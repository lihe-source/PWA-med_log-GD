const DB_NAME='medlog-gd-data';
const req=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const completion=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('儲存作業已取消。'));});
export class Storage {
  async open() {
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>{
      const db=r.result;
      for(const name of ['events','receipts']) {
        const s=db.createObjectStore(name,{keyPath:['workspace','id']});
        s.createIndex('workspace','workspace');
      }
      db.createObjectStore('meta',{keyPath:'key'});
    };
    r.onblocked=()=>window.dispatchEvent(new CustomEvent('storage-blocked'));
    this.db=await req(r);
    this.db.onversionchange=()=>this.db.close();
    return this;
  }
  async meta(key,fallback=null) {
    const result=await req(this.db.transaction('meta').objectStore('meta').get(key));
    return result?.value??fallback;
  }
  async setMeta(key,value) {
    const tx=this.db.transaction('meta','readwrite');const done=completion(tx);
    tx.objectStore('meta').put({key,value});await done;
  }
  async load(workspace) {
    const tx=this.db.transaction(['events','receipts']);
    const [events,receipts]=await Promise.all([
      req(tx.objectStore('events').index('workspace').getAll(workspace)),
      req(tx.objectStore('receipts').index('workspace').getAll(workspace))
    ]);
    return {events:events.map(x=>x.event),receipts:new Set(receipts.map(x=>x.id))};
  }
  async save(workspace,events,ackIds=[]) {
    const tx=this.db.transaction(['events','receipts'],'readwrite');const done=completion(tx);
    for(const event of events) tx.objectStore('events').put({workspace,id:event.id,event});
    for(const id of ackIds) tx.objectStore('receipts').put({workspace,id});
    await done;
  }
  async acknowledge(workspace,ids) { await this.save(workspace,[],ids); }
}
