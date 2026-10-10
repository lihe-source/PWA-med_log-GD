import {VERSION,SCHEMA} from './model.js';
export function compareVersions(a,b) {
  const valid=/^\d+\.\d+\.\d+$/;
  if(!valid.test(a)||!valid.test(b)) throw new Error('版本資訊格式錯誤。');
  const x=a.split('.').map(Number),y=b.split('.').map(Number);
  for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;
  return 0;
}
export class Updater {
  constructor(hooks) {this.hooks=hooks;this.latest=null;this.status='尚未檢查';this.checking=false;this.reloading=false;}
  async start() {
    if(!('serviceWorker' in navigator)) {this.status='此瀏覽器不支援離線安裝';this.hooks.changed();return;}
    try {
      this.registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      this.registration.addEventListener('updatefound',()=>{
        const worker=this.registration.installing;
        worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&this.registration.waiting)this.activate();});
      });
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(!this.applying||this.reloading)return;
        this.reloading=true;
        this.hooks.saveDraft();
        sessionStorage.setItem('medlog-updated','1');
        location.reload();
      });
      await this.check(true);
    } catch(error) {this.status='離線快取尚未完成：'+error.message;this.hooks.changed();}
  }
  async check(silent=false) {
    if(this.checking)return;
    this.checking=true;this.status='正在檢查';this.hooks.changed();
    try {
      if(!navigator.onLine)throw new Error('目前離線，保留現有版本');
      const response=await fetch('./version.json?t='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('無法讀取線上版本（'+response.status+'）');
      const data=await response.json();
      compareVersions(data.version,VERSION);
      if(data.appId!=='medlog-gd'||data.schemaVersion!==SCHEMA)throw new Error('新版資料格式不相容，已保留現有版本');
      this.latest=data.version;this.checkedAt=new Date().toISOString();
      await this.hooks.persist({latest:this.latest,checkedAt:this.checkedAt});
      const difference=compareVersions(data.version,VERSION);
      this.status=difference>0?'發現新版，正在準備更新':difference<0?'本機版本高於線上版本':'已是最新版本';
      if(this.registration)await this.registration.update();
      if(difference>0&&this.registration?.waiting)await this.activate();
      if(!silent&&difference===0)this.hooks.notice('目前已是最新版本。');
    } catch(error) {this.status=error.message;if(!silent)this.hooks.notice(error.message,true);}
    finally {this.checking=false;this.hooks.changed();}
  }
  async activate() {
    if(this.applying||!this.registration?.waiting||!this.latest||compareVersions(this.latest,VERSION)<=0)return;
    if(!this.hooks.canReload()) {
      clearTimeout(this.retry);this.retry=setTimeout(()=>this.activate(),1500);
      this.status='新版已下載，等待儲存作業完成';this.hooks.changed();return;
    }
    this.hooks.saveDraft();
    const worker=this.registration.waiting;
    const remote=await new Promise(resolve=>{
      const channel=new MessageChannel(),timer=setTimeout(()=>resolve(null),3000);
      channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data?.version);};
      worker.postMessage({type:'GET_VERSION'},[channel.port2]);
    });
    if(remote!==this.latest){this.status='新版檔案尚未全部發佈，稍後再檢查';this.hooks.changed();return;}
    this.applying=true;this.status='正在套用新版';this.hooks.changed();
    worker.postMessage({type:'ACTIVATE'});
  }
}
