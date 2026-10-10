import {APP_ID,SCHEMA,uid,parseJournal,parseBackup,exportData} from './model.js';
const API='https://www.googleapis.com/drive/v3/';
const UPLOAD='https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,appProperties';
const quote=value=>String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const loadScript=(src)=>new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=src;script.async=true;
  const timer=setTimeout(()=>reject(new Error('Google 連線元件載入逾時；請檢查網路後重試。')),20000);
  script.onload=()=>{clearTimeout(timer);resolve();};
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('無法載入 Google 連線元件。'));};
  document.head.append(script);
});
export class Drive {
  constructor(settings,status=()=>{}) { this.settings=settings;this.status=status;this.token=null;this.user=null;this.expires=0;this.busy=false; }
  async prepare() {
    if(this.ready) return;
    if(this.preparing) return this.preparing;
    this.preparing=(async()=>{
      if(!window.google?.accounts?.oauth2) await loadScript('https://accounts.google.com/gsi/client');
      this.ready=true;
    })().finally(()=>{this.preparing=null;});
    return this.preparing;
  }
  connected() { return Boolean(this.token && Date.now()<this.expires); }
  disconnect() {this.token=null;this.expires=0;this.user=null;this.status('disconnected');}
  authorize() {
    if(!this.ready) throw new Error('Google 元件尚未就緒，請稍後再按連線。');
    if(!this.settings.clientId) throw new Error('請先填入並儲存 OAuth Client ID。');
    return new Promise((resolve,reject)=>{
      const client=google.accounts.oauth2.initTokenClient({
        client_id:this.settings.clientId,scope:'https://www.googleapis.com/auth/drive.file',
        prompt:this.user?'':'select_account',
        callback:async response=>{
          if(response.error) {reject(new Error('Google 授權未完成：'+response.error));return;}
          this.token=response.access_token;this.expires=Date.now()+Math.max(0,Number(response.expires_in)-30)*1000;
          try {
            const info=await this.request('about?fields=user');
            this.user=info.user;resolve(this.user);
          } catch(error) {this.disconnect();reject(error);}
        },
        error_callback:error=>reject(new Error(error.type==='popup_closed'?'已取消 Google 連線。':'無法開啟 Google 授權視窗，請允許彈出視窗後重試。'))
      });
      client.requestAccessToken();
    });
  }
  async request(path,options={}) {
    if(!this.connected()) {this.disconnect();throw new Error('Google 授權已到期，請按「連線 Google」重新連線。');}
    const url=path.startsWith('https://')?path:API+path;
    for(let attempt=0;attempt<3;attempt++) {
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
      let response;
      try {response=await fetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+this.token},signal:controller.signal,cache:'no-store'});}
      catch(e) {throw new Error(e.name==='AbortError'?'Google Drive 連線逾時，本機記錄仍已保存。':'Google Drive 連線失敗，本機記錄仍已保存。');}
      finally {clearTimeout(timer);}
      if(response.ok) {
        if(response.status===204) return {};
        return response.json();
      }
      if(response.status===401) {this.disconnect();throw new Error('Google 授權已到期，請重新連線。');}
      if((response.status===429||response.status>=500)&&attempt<2) {await new Promise(r=>setTimeout(r,600*Math.pow(2,attempt)));continue;}
      let details={};try{details=await response.json();}catch{}
      const reason=details.error?.errors?.[0]?.reason||'';
      if(response.status===404) throw new Error('找不到資料夾或檔案，或此 App 尚未取得存取權。請用「選取資料夾」完成授權。');
      if(response.status===403) throw new Error('Google Drive 權限不足、API 未啟用或配額受限。'+(reason?'（'+reason+'）':''));
      throw new Error('Google Drive 作業失敗（'+response.status+'）。'+(details.error?.message||''));
    }
  }
  async list(folder,kind) {
    const q="'"+quote(folder)+"' in parents and trashed = false and appProperties has { key='medlogApp' and value='"+APP_ID+"' } and appProperties has { key='medlogKind' and value='"+kind+"' }";
    let page='',all=[];
    do {
      const params=new URLSearchParams({q,pageSize:'1000',fields:'nextPageToken,files(id,name,size,createdTime,appProperties)',orderBy:'createdTime'});
      if(page) params.set('pageToken',page);
      const data=await this.request('files?'+params);
      all.push(...(data.files||[]));page=data.nextPageToken||'';
    } while(page);
    return all;
  }
  async folder(id) {
    const data=await this.request('files/'+encodeURIComponent(id)+'?fields=id,name,mimeType,trashed,capabilities(canAddChildren)');
    if(data.mimeType!=='application/vnd.google-apps.folder'||data.trashed) throw new Error('資料夾 ID 必須指向有效的 Google Drive 資料夾。');
    if(!data.capabilities?.canAddChildren) throw new Error('此帳戶沒有在這個資料夾新增資料的權限。');
    return data;
  }
  async createFolder() {
    const q="trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='medlogApp' and value='"+APP_ID+"' }";
    const existing=await this.request('files?'+new URLSearchParams({q,fields:'files(id,name)',pageSize:'100'}));
    if(existing.files?.length) return existing.files[0];
    return this.request('files?fields=id,name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      name:'MedLog 服藥日誌',mimeType:'application/vnd.google-apps.folder',appProperties:{medlogApp:APP_ID}
    })});
  }
  async pickFolder() {
    if(!this.connected()) throw new Error('請先連線 Google。');
    if(!this.settings.apiKey||!this.settings.projectNumber) throw new Error('請先儲存 Google Picker API Key 與 Google Cloud 專案編號。');
    if(!window.gapi) await loadScript('https://apis.google.com/js/api.js');
    if(!window.google?.picker) await new Promise((resolve,reject)=>gapi.load('picker',{callback:resolve,onerror:()=>reject(new Error('資料夾選取器載入失敗。')),timeout:20000,ontimeout:()=>reject(new Error('資料夾選取器載入逾時。'))}));
    return new Promise(resolve=>{
      const view=new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true);
      const picker=new google.picker.PickerBuilder().setDeveloperKey(this.settings.apiKey).setAppId(this.settings.projectNumber)
        .setOAuthToken(this.token).setOrigin(location.origin).addView(view)
        .setCallback(data=>{
          if(data.action===google.picker.Action.PICKED) resolve(data.docs[0]);
          if(data.action===google.picker.Action.CANCEL) resolve(null);
        }).build();
      picker.setVisible(true);
    });
  }
  async json(file) {
    if(Number(file.size)>50*1024*1024) throw new Error('雲端檔案超過 50 MB，請先匯出整理。');
    return this.request('files/'+encodeURIComponent(file.id)+'?alt=media');
  }
  async upload(folder,name,data,kind,extra={}) {
    const boundary='medlog_'+uid().replace(/-/g,'');
    const metadata={name,parents:[folder],mimeType:'application/json',appProperties:{medlogApp:APP_ID,medlogKind:kind,...extra}};
    const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(data),'\r\n--'+boundary+'--'],{type:'multipart/related; boundary='+boundary});
    return this.request(UPLOAD,{method:'POST',headers:{'Content-Type':body.type},body});
  }
  async remove(id) {return this.request('files/'+encodeURIComponent(id),{method:'DELETE'});}
}
export class Sync {
  constructor(drive,storage,hooks) {this.drive=drive;this.db=storage;this.hooks=hooks;this.busy=false;}
  async pull(context) {
    const {workspace,folder,model}=context;
    let known=await this.db.meta('files:'+workspace,[]);
    const knownSet=new Set(known);
    const files=await this.drive.list(folder,'change');
    const collected=[];
    if(!known.length) {
      const backups=await this.drive.list(folder,'backup');
      const latest=backups.filter(x=>x.appProperties?.backupType==='auto').at(-1);
      if(latest) {
        const parsed=parseBackup(await this.drive.json(latest));
        collected.push(...parsed.model.all());
        for(const id of parsed.coveredFileIds) knownSet.add(id);
      }
    }
    const unseen=files.filter(file=>!knownSet.has(file.id));
    for(let i=0;i<unseen.length;i+=4) {
      this.hooks.status('讀取雲端 '+Math.min(i+4,unseen.length)+' / '+unseen.length);
      const group=unseen.slice(i,i+4);
      const parts=await Promise.all(group.map(async file=>parseJournal(await this.drive.json(file))));
      for(const events of parts) collected.push(...events);
      for(const file of group) knownSet.add(file.id);
    }
    if(collected.length) await this.hooks.merge(collected,true,context);
    await this.db.setMeta('files:'+workspace,[...knownSet]);
    return {files,knownSet};
  }
  async run({automatic=false,backup=false}={}) {
    if(this.busy) return;
    const context=this.hooks.context();
    if(!context.folder||!this.drive.connected()) {
      if(automatic) return;
      throw new Error('請先連線 Google 並確認資料夾。');
    }
    this.busy=true;this.drive.busy=true;this.hooks.status('正在同步');
    try {
      const {knownSet}=await this.pull(context);
      const loaded=await this.db.load(context.workspace);
      const pending=new Map(loaded.events.filter(e=>!loaded.receipts.has(e.id)).map(e=>[e.id,e]));
      const ordered=[],seen=new Set();
      const visit=e=>{if(seen.has(e.id))return;for(const id of e.parents)if(pending.has(id))visit(pending.get(id));seen.add(e.id);ordered.push(e);};
      for(const e of pending.values())visit(e);
      for(let i=0;i<ordered.length;i+=100) {
        const events=ordered.slice(i,i+100);
        this.hooks.status('上傳 '+Math.min(i+100,ordered.length)+' / '+ordered.length);
        const batchId=uid();
        const file=await this.drive.upload(context.folder,'changes-'+batchId+'.json',
          {appId:APP_ID,schemaVersion:SCHEMA,batchId,events},'change',{batchId});
        await this.db.acknowledge(context.workspace,events.map(e=>e.id));
        knownSet.add(file.id);
        await this.db.setMeta('files:'+context.workspace,[...knownSet]);
      }
      await this.db.setMeta('lastSync:'+context.workspace,new Date().toISOString());
      const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
      if(backup||await this.db.meta('backupDay:'+context.workspace)!==day) {
        await this.backup(context,backup?'manual':'auto',knownSet);
        if(!backup) await this.db.setMeta('backupDay:'+context.workspace,day);
      }
      this.hooks.status('已同步');
      await this.hooks.refresh();
    } finally {this.busy=false;this.drive.busy=false;this.hooks.finished();}
  }
  async backup(context,type,knownSet) {
    this.hooks.status(type==='manual'?'建立手動備份':'建立每日備份');
    const data=exportData(context.model,this.hooks.preferences(),knownSet||await this.db.meta('files:'+context.workspace,[]));
    const timestamp=new Date().toISOString().replace(/[:.]/g,'-');
    const file=await this.drive.upload(context.folder,'MedLog-'+type+'-'+timestamp+'.json',data,'backup',{backupType:type});
    // A backup may include edits made while synchronization is running.
    // Keep their journal entries pending so devices with an existing cache
    // also receive them through the ordinary change feed.
    if(type==='auto') {
      const backups=(await this.drive.list(context.folder,'backup')).filter(x=>x.appProperties?.backupType==='auto');
      for(const old of backups.slice(0,Math.max(0,backups.length-30))) {
        try {await this.drive.remove(old.id);} catch {this.hooks.warning('備份已完成，部分舊備份暫時無法清理。');break;}
      }
    }
    return file;
  }
}
