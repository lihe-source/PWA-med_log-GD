/* Google Identity Services 自動恢復入口；仍遵守瀏覽器的使用者互動限制。 */
export class AutoConnect {
  constructor(drive,hooks) {this.drive=drive;this.hooks=hooks;this.stage='idle';this.message='';this.pending=null;this.cancelled=false;this.stopped=false;}
  change(stage,message='') {this.stage=stage;this.message=message;this.hooks.changed?.(this);}
  enabled() {return this.hooks.enabled()&&!this.stopped;}
  start({reason='startup',gesture=false,force=false,selectAccount=false}={}) {
    if(this.pending)return this.pending;
    if(!force&&(this.cancelled||!this.enabled()))return Promise.resolve(false);
    if(force){this.cancelled=false;this.stopped=false;}
    if(!this.drive.settings.clientId){this.change('setup');return Promise.resolve(false);}
    if(!navigator.onLine){this.change('offline','目前離線，恢復網路後自動接續 Google 連線。');return Promise.resolve(false);}
    if(this.hooks.busy?.()){this.change('deferred','完成目前作業後，自動恢復 Google 連線。');this.defer(reason);return Promise.resolve(false);}
    const options={reason,gesture,force,selectAccount};
    // _run 在第一個 await 前直接呼叫 authorize，保留點擊的 user activation。
    this.pending=this.run(options).catch(error=>{
      if(this.stopped){this.change('paused');return false;}
      if(error.code==='popup_failed_to_open'){this.change('gesture','Google 將在你首次正常點擊介面時自動連線。');return false;}
      this.cancelled=['popup_closed','access_denied','missing_scope','config_changed'].includes(error.code)||error.message?.includes('不同帳號');
      this.change(error.code==='popup_closed'?'cancelled':'error',error.message);return false;
    }).finally(()=>{this.pending=null;this.hooks.changed?.(this);});
    return this.pending;
  }
  async run({gesture,force,selectAccount,reason}) {
    if(this.drive.connected()&&!selectAccount)return this.finish({automatic:!selectAccount,reason});
    const cached=!selectAccount&&this.drive.cachedSession();
    if(cached){
      this.change('restoring','正在恢復 Google 帳戶…');
      if(await this.drive.restoreSession())return this.finish({automatic:!selectAccount,reason});
      if(gesture){this.change('gesture','授權已到期，下次正常點擊時將接續 Google 連線。');return false;}
    }
    if(!this.drive.ready){this.change('preparing','正在準備 Google 連線…');await this.drive.prepare();}
    this.change('connecting','正在自動連線 Google…');
    await this.drive.authorize({automatic:!selectAccount,selectAccount,hint:this.hooks.hint?.()||''});
    return this.finish({automatic:!selectAccount,reason});
  }
  async finish(context) {
    if(this.stopped||!this.hooks.enabled()){this.drive.disconnect();this.change('paused');return false;}
    this.change('binding','正在恢復 Google Drive 連線…');
    const result=await this.hooks.complete(context);
    if(result==='deferred'){this.change('deferred','Google 已連線，完成目前編輯後自動同步。');this.defer('binding');return false;}
    if(result==='folder'){this.change('folder','Google 已連線，請選取或建立資料儲存資料夾。');return true;}
    this.cancelled=false;this.change('connected','Google 帳戶與雲端已連線。');this.expiryTimer();return true;
  }
  defer(reason) {clearTimeout(this.deferredTimer);this.deferredTimer=setTimeout(()=>{if(this.stage==='deferred'&&this.enabled())this.start({reason}).catch(()=>{});},600);}
  expiryTimer() {clearTimeout(this.expiresTimer);if(!this.enabled())return;this.expiresTimer=setTimeout(()=>{if(document.visibilityState==='visible')this.start({reason:'expired'}).catch(()=>{});},Math.max(1000,this.drive.expires-Date.now()+100));}
  resume(reason='foreground') {if(this.cancelled||this.stopped||this.stage==='gesture'||this.stage==='folder'||this.stage==='setup'||this.drive.connected()&&this.stage==='connected')return;return this.start({reason});}
  pause() {this.stopped=true;this.cancelled=true;clearTimeout(this.deferredTimer);clearTimeout(this.expiresTimer);this.drive.cancelAuthorization?.();this.change('paused');}
  retry() {this.cancelled=false;this.stopped=false;return this.start({force:true,gesture:true});}
  armGestures() {
    this.gestureListener=event=>{
      if(!event.isTrusted||this.stage!=='gesture'||!this.enabled()||this.pending||!this.drive.ready)return;
      const target=event.target.closest?.('button,a,[role=button]');if(!target||target.disabled||target.closest('#photo-modal'))return;
      if(target.closest('#cloud-form')||['connect','auto-connect','disconnect','local-workspace','pause-auto-login','take-photo','choose-photo','import','install','notification-enable','notification-disable','notification-test','notification-status','notification-connect'].includes(target.dataset.action))return;
      this.start({reason:'gesture',gesture:true}).catch(()=>{});
    };
    document.addEventListener('click',this.gestureListener,true);
  }
  dispose(){this.pause();document.removeEventListener('click',this.gestureListener,true);}
}
