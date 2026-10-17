import {VERSION,SCHEMA} from './model.js';
export function compareVersions(a,b) {
  const valid=/^\d+\.\d+\.\d+$/;
  if(!valid.test(a)||!valid.test(b))throw new Error('版本資訊格式錯誤。');
  const x=a.split('.').map(Number),y=b.split('.').map(Number);
  for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;
  return 0;
}
const LIMITS={metadata:12000,registration:20000,install:60000,message:3000,activation:12000,retry:[10000,30000],blocked:1500};
export class Updater {
  constructor(hooks,limits={}) {
    this.hooks=hooks;this.limits={...LIMITS,...limits};this.latest=null;this.status='尚未檢查';
    this.checking=false;this.reloading=false;this.applying=false;this.seen=new WeakSet();this.retryCount=0;
  }
  changed(status) {if(status)this.status=status;this.hooks.changed();}
  newer() {return Boolean(this.latest&&compareVersions(this.latest,VERSION)>0);}
  bounded(promise,ms,message) {
    let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms);})]).finally(()=>clearTimeout(timer));
  }
  listen() {
    if(this.listening||!('serviceWorker' in navigator))return;
    this.listening=true;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{this.activate().catch(error=>this.failed(error));});
    navigator.serviceWorker.addEventListener('message',event=>{
      const data=event.data,source=event.source;
      if(data?.appId!=='medlog-gd'||data.version!==this.latest||!this.newer())return;
      if(![this.registration?.installing,this.registration?.waiting,this.registration?.active,navigator.serviceWorker.controller].includes(source))return;
      if(data.type==='UPDATE_PROGRESS'&&!this.applying)this.changed('正在下載並驗證新版（'+data.done+'／'+data.total+'）');
      if(data.type==='UPDATE_ERROR')this.failed(new Error('新版安裝失敗：'+data.message));
      if(data.type==='UPDATE_READY')this.settle();
    });
  }
  async registrationReady() {
    this.listen();
    if(this.registration)return this.registration;
    if(!this.registering)this.registering=this.bounded(
      navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}),this.limits.registration,'更新服務連線逾時，請稍後重試'
    ).then(registration=>{
      this.registration=registration;
      registration.addEventListener('updatefound',()=>this.watch(registration.installing));
      this.watch(registration.installing);
      return registration;
    }).finally(()=>{this.registering=null;});
    return this.registering;
  }
  async start() {
    if(!('serviceWorker' in navigator)){this.changed('此瀏覽器不支援離線安裝');return;}
    await this.check(true);
  }
  check(silent=false,automatic=false) {
    if(this.checkPromise)return this.checkPromise;
    if(!automatic){clearTimeout(this.retry);this.retryCount=0;}
    this.checkPromise=this.performCheck(silent).finally(()=>{this.checkPromise=null;});
    return this.checkPromise;
  }
  async performCheck(silent) {
    this.checking=true;this.changed('正在檢查');
    const abort=new AbortController();let timer;
    try {
      if(!navigator.onLine)throw new Error('目前離線，保留現有版本');
      timer=setTimeout(()=>abort.abort(),this.limits.metadata);
      const data=await this.bounded((async()=>{
        const response=await fetch('./version.json?t='+Date.now(),{cache:'no-store',signal:abort.signal});
        if(!response.ok)throw new Error('無法讀取線上版本（'+response.status+'）');
        return response.json();
      })(),this.limits.metadata,'讀取線上版本逾時，請重試');
      clearTimeout(timer);
      const difference=compareVersions(data.version,VERSION);
      if(data.appId!=='medlog-gd'||data.schemaVersion!==SCHEMA)throw new Error('新版資料格式不相容，已保留現有版本');
      this.latest=data.version;this.checkedAt=new Date().toISOString();
      // A slow metadata write must not hold the update button or installation open.
      this.bounded(Promise.resolve().then(()=>this.hooks.persist({latest:this.latest,checkedAt:this.checkedAt})),this.limits.metadata,'').catch(()=>{});
      this.changed(difference>0?'發現新版，正在準備下載':difference<0?'本機版本高於線上版本':'已是最新版本');
      const registration=await this.registrationReady();
      if(difference>0&&await this.activate())return;
      this.watch(registration.installing);
      if(!registration.installing)await this.bounded(registration.update(),this.limits.registration,'更新服務回應逾時，請重試');
      if(this.newer()) {
        if(await this.activate())return;
        if(registration.installing){this.watch(registration.installing);this.changed('正在下載並驗證新版');this.armInstall();}
        else throw new Error('新版尚未就緒；請確認全部檔案已發佈後重試');
      } else if(!silent&&difference===0)this.hooks.notice('目前已是最新版本。');
    } catch(error) {
      const message=error.name==='AbortError'?'讀取線上版本逾時，請重試':error.message;
      this.failed(new Error(message));if(!silent)this.hooks.notice(message,true);
    } finally {clearTimeout(timer);this.checking=false;this.hooks.changed();}
  }
  watch(worker) {
    if(!worker||this.seen.has(worker))return;
    this.seen.add(worker);
    worker.addEventListener('statechange',()=>{
      if(worker.state==='installed'||worker.state==='activated')this.settle();
      if(worker.state==='redundant'&&this.newer()&&!this.applying&&!this.reloading)this.failed(new Error('新版安裝未完成，保留原版本；請重試'));
    });
    if(worker.state==='installed'||worker.state==='activated')this.settle();
    else if(worker.state==='installing'&&this.newer())this.armInstall();
  }
  settle() {
    // waiting/controller can be assigned just after statechange fires.
    clearTimeout(this.settleTimer);
    this.settleTimer=setTimeout(()=>{this.activate().catch(error=>this.failed(error));},0);
  }
  armInstall() {
    if(this.installTimer)return;
    this.installTimer=setTimeout(()=>{
      this.installTimer=null;
      if(!this.applying&&!this.reloading)this.failed(new Error('新版下載逾時，保留原版本；請重試'));
    },this.limits.install);
  }
  failed(error) {
    if(this.reloading)return;
    clearTimeout(this.installTimer);this.installTimer=null;
    clearTimeout(this.activationTimer);this.activationTimer=null;
    this.applying=false;this.changed(error.message||'更新失敗，請重試');
    if(this.newer()&&navigator.onLine&&this.retryCount<this.limits.retry.length){
      clearTimeout(this.retry);
      const delay=this.limits.retry[this.retryCount++];
      this.retry=setTimeout(()=>{this.check(true,true);},delay);
    }
  }
  async versionOf(worker) {
    if(!worker)return null;
    return new Promise(resolve=>{
      const channel=new MessageChannel();let finished=false;
      const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(value);};
      const timer=setTimeout(()=>finish(null),this.limits.message);
      channel.port1.onmessage=event=>finish(event.data?.version||null);
      try{worker.postMessage({type:'GET_VERSION'},[channel.port2]);}catch{finish(null);}
    });
  }
  activate() {
    if(this.activationPromise)return this.activationPromise;
    this.activationPromise=this.performActivation().finally(()=>{this.activationPromise=null;});
    return this.activationPromise;
  }
  async performActivation() {
    if(!this.newer()||this.reloading)return false;
    const registration=this.registration;if(!registration)return false;
    const controller=navigator.serviceWorker.controller;
    // Another tab may already have activated the downloaded worker.
    if(controller&&await this.versionOf(controller)===this.latest){
      if(!this.readyToReload())return true;
      this.reload();return true;
    }
    const worker=registration.waiting;
    if(!worker)return false;
    const remote=await this.versionOf(worker);
    if(remote!==this.latest){
      this.failed(new Error(remote?'新版檔案版本尚未一致，稍後會重試':'新版暫無回應，請重試'));return true;
    }
    clearTimeout(this.installTimer);this.installTimer=null;
    if(!this.readyToReload())return true;
    if(this.applying)return true;
    this.hooks.saveDraft();this.applying=true;this.changed('新版已驗證，正在套用');
    try{worker.postMessage({type:'ACTIVATE'});}catch(error){this.failed(error);return true;}
    this.activationTimer=setTimeout(async()=>{
      this.activationTimer=null;
      const active=navigator.serviceWorker.controller;
      if(active&&await this.versionOf(active)===this.latest){if(this.readyToReload())this.reload();}
      else this.failed(new Error('新版切換逾時，請關閉 App 後重新開啟'));
    },this.limits.activation);
    return true;
  }
  readyToReload() {
    if(this.hooks.canReload())return true;
    clearTimeout(this.blockedTimer);
    this.blockedTimer=setTimeout(()=>{this.activate().catch(error=>this.failed(error));},this.limits.blocked);
    this.changed('新版已下載，等待完成編輯或儲存作業');return false;
  }
  reload() {
    if(this.reloading)return;
    clearTimeout(this.retry);clearTimeout(this.installTimer);clearTimeout(this.activationTimer);clearTimeout(this.blockedTimer);
    try{this.hooks.saveDraft();}catch(error){this.failed(error);return;}
    // Storage restrictions must not trap a fully installed update forever.
    try{sessionStorage.setItem('medlog-updated','1');}catch{}
    this.reloading=true;this.changed('正在開啟新版');location.reload();
  }
}
