import {projectEvent,nextPlanTime} from './reminder-core.js';
export class NotificationBridge {
  constructor(db,hooks){this.db=db;this.hooks=hooks;this.url='';this.deviceId='';this.credential=null;this.busy=false;this.message='尚未連結通知服務';this.timer=null;this.pending=null;this.remote=null;this.dirty=true;this.generation=0;this.failures=0;}
  changed(message){if(message)this.message=message;this.hooks.changed?.(this);}
  context(){return this.hooks.context();}
  key(workspace=this.context().workspace){return 'notification-device:'+this.url+':'+workspace;}
  async init(){this.url=await this.db.meta('notification-url','');this.deviceId=await this.db.meta('notification-device-id','');if(!this.deviceId){this.deviceId=crypto.randomUUID();await this.db.setMeta('notification-device-id',this.deviceId);}await this.loadCredential();}
  async loadCredential(){this.credential=await this.db.meta(this.key(),null);this.remote=null;this.dirty=true;this.changed(this.url?(this.credential?'通知服務待同步':'等待 Google 與 Drive 工作區連線'):'尚未連結通知服務');}
  async setUrl(value){
    let url='';if(value.trim()){let u;try{u=new URL(value.trim());}catch{throw new Error('請輸入有效的通知服務 HTTPS 網址。');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new Error('通知服務網址必須使用 HTTPS，且不可包含查詢參數。');url=u.href.replace(/\/$/,'');}
    if(url!==this.url){await this.leave();this.url=url;await this.db.setMeta('notification-url',url);await this.loadCredential();}this.kick();
  }
  async request(path,body,credential=this.credential,url=this.url){
    const headers={'Content-Type':'application/json'};if(credential?.token)headers.Authorization='Bearer '+credential.token;
    let response;try{response=await fetch(url+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw new Error('通知服務無法連線，狀態仍待同步；請檢查網址與 ALLOWED_ORIGINS。');}
    let data;try{data=await response.json();}catch{throw new Error('通知服務回傳非 JSON，請確認 Worker 網址與部署檔案。');}
    if(!response.ok||!data.ok){const e=new Error(data.error||'通知服務 HTTP '+response.status);e.status=response.status;throw e;}return data;
  }
  async ensureCredential(ctx){
    if(!this.url||!ctx.workspace.startsWith('drive:'))return false;
    const url=this.url,generation=this.generation,key='notification-device:'+url+':'+ctx.workspace;
    if(!this.credential||this.credential.workspace!==ctx.workspace||this.credential.expires<Date.now()){
      if(!ctx.drive.connected())throw new Error('請先恢復 Google 連線，以連結通知服務。');
      const config=await this.request('/config',undefined,null,url);
      const page=new URL('./',document.baseURI),app=new URL(config.appUrl);
      if(app.origin!==page.origin||app.pathname!==page.pathname||config.clientId!==ctx.drive.settings.clientId)throw new Error('通知服務的 APP_URL 或 OAUTH_CLIENT_ID 與目前 PWA 不一致。');
      const registered=await this.request('/register',{accessToken:ctx.drive.token,folderId:ctx.drive.settings.folderId,deviceId:this.deviceId},null,url);
      const credential={token:registered.token,workspace:ctx.workspace,workspaceKey:registered.workspaceKey,expires:registered.expires,publicKey:config.publicKey};
      if(this.context().workspace!==ctx.workspace||this.url!==url||this.generation!==generation)return false;
      await this.db.setMeta(key,credential);
      this.credential=credential;
    }
    return true;
  }
  kick(){this.dirty=true;clearTimeout(this.retryTimer);clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush().catch(()=>{}),500);}
  async flush(){
    clearTimeout(this.retryTimer);
    if(this.pending){this.dirty=true;return this.pending;}
    if(!navigator.onLine){this.changed('提醒狀態待同步：目前離線，雲端可能仍發出提醒。');return false;}
    this.pending=this.run().catch(e=>{this.changed(e.message);if((e.status>=500||e.status===429||e.message.includes('無法連線'))&&this.failures<4){const delay=[5000,15000,30000,60000][this.failures++];clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>{if(document.visibilityState!=='hidden')this.flush().catch(()=>{});},delay);}return false;}).finally(()=>{this.pending=null;this.busy=false;this.hooks.changed?.(this);});return this.pending;
  }
  async run(){
    this.busy=true;const disabled=await this.drainDisableQueue();
    if(!this.url||!this.context().workspace.startsWith('drive:')){this.changed(!disabled?'停用要求待同步：請檢查舊通知服務連線。':this.url?'目前使用本機資料，通知服務等待 Drive 工作區。':'尚未連結通知服務');return false;}
    this.changed('正在同步每日提醒狀態…');let count=0;
    do{
      this.dirty=false;const ctx=this.context(),generation=this.generation;
      if(!await this.ensureCredential(ctx)){this.changed('選擇 Google Drive 工作區後可連結通知服務。');return false;}
      if(generation!==this.generation)return false;
      const credential=this.credential,url=this.url;
      let remote;try{remote=await this.request('/status',undefined,credential,url);}catch(e){if(e.status===401){await this.db.setMeta(this.key(ctx.workspace),null);this.credential=null;if(ctx.drive.connected()&&count<1){count++;this.dirty=true;continue;}}throw e;}
      const ackKey=this.key(ctx.workspace)+':ack:'+remote.datasetId,acked=new Set(await this.db.meta(ackKey,[]));
      const projected=ctx.model.all().map(projectEvent).filter(Boolean),events=new Map(projected.map(e=>[e.id,e]));
      const ordered=[],seen=new Set();function visit(e){if(seen.has(e.id)||acked.has(e.id))return;for(const p of e.parents){const parent=events.get(p);if(parent)visit(parent);}seen.add(e.id);ordered.push(e);}for(const e of projected)visit(e);
      for(let at=0;at<ordered.length;at+=100){
        const batch=ordered.slice(at,at+100),result=await this.request('/sync',{events:batch},credential,url);
        if(result.accepted?.length!==batch.length||batch.some(e=>!result.accepted.includes(e.id)))throw new Error('通知同步未完整確認，稍後將重新傳送。');
        for(const e of batch)acked.add(e.id);await this.db.setMeta(ackKey,[...acked]);
      }
      if(this.context().workspace!==ctx.workspace||this.url!==url||generation!==this.generation)return false;
      this.remote=await this.request('/status',undefined,credential,url);this.changed(this.remote.enabled?'提醒狀態已同步，本機通知已啟用。':'提醒狀態已同步，本機通知尚未啟用。');
      count++;
    }while(this.dirty&&count<4);
    this.failures=0;if(this.dirty)this.kick();return true;
  }
  support(){
    if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return '此瀏覽器不支援 Web Push。';
    const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    if(ios&&!navigator.standalone&&!window.matchMedia('(display-mode: standalone)').matches)return 'iPhone／iPad 請先加入主畫面，並從主畫面開啟後啟用。';return '';
  }
  async enable(){
    if(!this.url)throw new Error('請先儲存通知服務網址。');
    if(!this.context().workspace.startsWith('drive:'))throw new Error('請先連線 Google Drive 資料夾。');
    if(!this.credential&&!this.context().drive.connected())throw new Error('Google 自動連線尚未完成，稍後再啟用通知。');
    const unsupported=this.support();if(unsupported)throw new Error(unsupported);
    // Called directly inside a trusted click, before any network/IDB await.
    const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
    if(permission!=='granted')throw new Error('通知權限未允許，請在系統通知設定開啟 MedLog。');
    if(!await this.flush())throw new Error(this.message);
    const ctx=this.context(),credential=this.credential,url=this.url,config=await this.request('/config');
    let readyTimer;const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{readyTimer=setTimeout(()=>reject(new Error('離線元件尚未就緒，請稍後重試。')),15000);})]).finally(()=>clearTimeout(readyTimer));
    let sub=await registration.pushManager.getSubscription();
    const publicBytes=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-config.publicKey.length%4)%4)),c=>c.charCodeAt(0));
    const oldKey=sub?.options.applicationServerKey;
    if(sub&&oldKey&&([...new Uint8Array(oldKey)].join(',')!==[...publicBytes].join(','))){await sub.unsubscribe();sub=null;}
    if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicBytes});
    if(this.context().workspace!==ctx.workspace||this.url!==url)throw new Error('帳戶已變更，請在目前帳戶重新啟用通知。');
    await this.request('/subscription',{enabled:true,subscription:sub.toJSON(),publicKey:config.publicKey},credential,url);
    credential.publicKey=config.publicKey;await this.db.setMeta(this.key(ctx.workspace),credential);this.remote={...this.remote,enabled:true};this.changed('本機通知已啟用；可按測試通知確認接收。');
  }
  async drainDisableQueue(){
    const queue=await this.db.meta('notification-disable-queue',[]),remaining=[];
    for(const item of queue){try{await this.request('/subscription',{enabled:false},item.credential,item.url);}catch(e){if(e.status!==401)remaining.push(item);}}
    await this.db.setMeta('notification-disable-queue',remaining);
    return !remaining.length;
  }
  async disable(){
    if(!this.credential||!this.url){this.changed('本機通知尚未啟用。');return;}
    const queue=await this.db.meta('notification-disable-queue',[]);
    if(!queue.some(i=>i.credential.token===this.credential.token))queue.push({url:this.url,credential:this.credential});
    await this.db.setMeta('notification-disable-queue',queue);
    const done=navigator.onLine?await this.drainDisableQueue():false;
    if(this.remote)this.remote.enabled=false;
    this.changed(done?'本機通知已停用。':'停用要求待同步：伺服器確認前仍可能收到通知，連線後會重試。');
  }
  async leave(){
    clearTimeout(this.timer);clearTimeout(this.retryTimer);this.generation++;
    await this.disable();this.credential=null;this.remote=null;
  }
  async test(){if(!await this.flush())throw new Error(this.message);const r=await this.request('/test',{});this.changed(r.message);return r;}
  async refresh(){if(!await this.flush())return;const registration=await navigator.serviceWorker?.getRegistration?.('./');if(this.remote?.enabled&&(!registration||!await registration.pushManager.getSubscription()||typeof Notification==='undefined'||Notification.permission!=='granted'))this.changed('裝置訂閱或權限已失效，請重新啟用本機通知。');}
  next(){return nextPlanTime(this.context().model);}
}
