export const APP_ID = 'medlog-gd';
export const VERSION = '1.2.0';
export const SCHEMA = 1;
export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 240 * 1024;
export const MAX_JSON_BYTES = 50 * 1024 * 1024;
export const TYPES = ['藥品', '保健食品', '外用保養品'];
export const UNITS = ['mg', 'μg', 'g', 'mL', 'IU'];
export const COLORS = ['#42c9aa','#6aafff','#a992ff','#ed93bc','#f1b464','#e88779','#84bf85','#89bbc8'];
export const uid = () => crypto.randomUUID();
export const clone = value => structuredClone(value);
export function today() {
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
export function nowTime() {
  return new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
}
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function str(v, max=200, required=false) {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw new Error('資料包含無效或過長的文字欄位。');
  return v.trim();
}
function num(v, min, max) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error('含量或數量必須是有效數字。');
  return v;
}
export function validDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y,m,d]=v.split('-').map(Number);
  const check=new Date(Date.UTC(y,m-1,d));
  return y>=2000 && y<=2200 && check.getUTCFullYear()===y && check.getUTCMonth()===m-1 && check.getUTCDate()===d;
}
export function cleanProduct(v) {
  if (!v || typeof v !== 'object') throw new Error('品項資料格式錯誤。');
  const color=str(v.color,7,true);
  if (!/^#[0-9a-f]{6}$/i.test(color) || !TYPES.includes(v.type)) throw new Error('品項顏色或類型無效。');
  if (!Array.isArray(v.ingredients) || v.ingredients.length>30) throw new Error('每個品項最多可設定 30 個成分。');
  if(v.photoIds!==undefined&&(!Array.isArray(v.photoIds)||v.photoIds.length>MAX_PHOTOS||new Set(v.photoIds).size!==v.photoIds.length||!v.photoIds.every(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id))))throw new Error('品項照片資料無效，最多可保留 3 張。');
  return {
    name:str(v.name,100,true),shortName:str(v.shortName||'',12),
    brand:str(v.brand||'',100),manufacturer:str(v.manufacturer||'',100),type:v.type,
    unit:str(v.unit,20,true),basis:num(v.basis,0.001,100000),
    color,active:v.active!==false,note:str(v.note||'',4000),
    ...(v.photoIds?.length?{photoIds:[...v.photoIds]}:{}),
    ingredients:v.ingredients.map(i => {
      if (!i || !UNITS.includes(i.unit)) throw new Error('成分單位無效。');
      return {name:str(i.name,100,true),amount:num(i.amount,0,1000000000),unit:i.unit};
    })
  };
}
export function cleanRecord(v) {
  if (!v || !validDate(v.date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v.time)) throw new Error('記錄日期或時間無效。');
  const {photoIds,...snapshot}=cleanProduct(v.snapshot);
  return {
    date:v.date,time:v.time,productId:str(v.productId,100,true),
    quantity:num(v.quantity,0.001,100000),note:str(v.note||'',4000),
    snapshot
  };
}
export function cleanPhoto(v) {
  if(!v||typeof v.dataUrl!=='string')throw new Error('照片資料格式錯誤。');
  const prefix='data:image/jpeg;base64,',encoded=v.dataUrl.slice(prefix.length);
  if(!v.dataUrl.startsWith(prefix)||encoded.length>Math.ceil(MAX_PHOTO_BYTES/3)*4||encoded.length%4||!/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new Error('照片必須是經過壓縮的 JPEG，且不可超過 240 KB。');
  const width=num(v.width,1,1600),height=num(v.height,1,1600);
  if(!Number.isInteger(width)||!Number.isInteger(height))throw new Error('照片尺寸無效。');
  return {dataUrl:v.dataUrl,width,height,name:str(v.name||'外觀照片',100,true)};
}
export function cleanEvent(v) {
  if (!v || !['product','record','photo'].includes(v.entity)) throw new Error('資料類型錯誤。');
  const id=str(v.id,100,true), entityId=str(v.entityId,100,true);
  if (!Array.isArray(v.parents) || v.parents.length>500 || !v.parents.every(p=>typeof p==='string'&&p.length<=100&&p!==id)) throw new Error('資料修訂關係無效。');
  if (typeof v.createdAt!=='string'||!Number.isFinite(Date.parse(v.createdAt))) throw new Error('資料修訂時間無效。');
  return {id,entity:v.entity,entityId,parents:[...new Set(v.parents)],createdAt:v.createdAt,deleted:v.deleted===true,
    value:v.deleted===true?null:(v.entity==='product'?cleanProduct(v.value):v.entity==='photo'?cleanPhoto(v.value):cleanRecord(v.value))};
}
export class Model {
  constructor(events=[]) { this.events=new Map(); this.merge(events); }
  merge(events) {
    const clean=events.map(cleanEvent);
    for (const e of clean) {
      const old=this.events.get(e.id);
      if (old && JSON.stringify(old)!==JSON.stringify(e)) throw new Error('相同資料 ID 出現不同內容；已停止合併。');
    }
    const combined=new Map(this.events);
    for (const e of clean) combined.set(e.id,e);
    const photos=new Set([...combined.values()].filter(e=>e.entity==='photo'&&!e.deleted).map(e=>e.entityId));
    for(const e of clean)if(e.entity==='product'&&!e.deleted)for(const id of e.value.photoIds||[])if(!photos.has(id))throw new Error('品項缺少照片資料，已停止合併。請更新所有裝置後重新同步。');
    for (const e of clean) for (const p of e.parents) {
      const parent=combined.get(p);
      if (!parent || parent.entity!==e.entity || parent.entityId!==e.entityId) throw new Error('缺少修訂來源，資料可能不完整。');
    }
    const visiting=new Set(),done=new Set();
    const visit=id=>{
      if (done.has(id)) return;
      if (visiting.has(id)) throw new Error('資料含有循環修訂，無法匯入。');
      visiting.add(id);
      for(const p of combined.get(id).parents) visit(p);
      visiting.delete(id);done.add(id);
    };
    for (const e of clean) visit(e.id);
    this.events=combined;
  }
  groups(entity) {
    const grouped=new Map();
    for(const e of this.events.values()) {
      if(entity && e.entity!==entity) continue;
      const key=e.entity+':'+e.entityId;
      if(!grouped.has(key)) grouped.set(key,[]);
      grouped.get(key).push(e);
    }
    return grouped;
  }
  heads(entity,id) {
    const list=[...this.events.values()].filter(e=>e.entity===entity&&e.entityId===id);
    const consumed=new Set(list.flatMap(e=>e.parents));
    return list.filter(e=>!consumed.has(e.id)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  }
  items(entity,includeDeleted=false) {
    const result=[];
    for(const list of this.groups(entity).values()) {
      const consumed=new Set(list.flatMap(e=>e.parents));
      const heads=list.filter(e=>!consumed.has(e.id)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
      const latest=heads.at(-1);
      if(!latest.deleted || includeDeleted) result.push({id:latest.entityId,...clone(latest.value||{}),deleted:latest.deleted,conflict:heads.length>1,heads});
    }
    return result;
  }
  get(entity,id) { return this.items(entity,true).find(i=>i.id===id); }
  make(entity,entityId,value,deleted=false) {
    return cleanEvent({id:uid(),entity,entityId,parents:this.heads(entity,entityId).map(e=>e.id),
      createdAt:new Date().toISOString(),deleted,value});
  }
  conflicts() { return [...this.groups().values()].map(list=>this.heads(list[0].entity,list[0].entityId)).filter(h=>h.length>1); }
  all() { return [...this.events.values()].map(clone); }
}
export function productPhotoEvents(model,id,value,photos) {
  const cleaned=cleanProduct(value),events=[];
  for(const photoId of cleaned.photoIds||[]) {
    if(model.get('photo',photoId))continue;
    const photo=photos.find(p=>p.id===photoId);
    if(!photo)throw new Error('照片尚未準備完成，請重新選取。');
    events.push(model.make('photo',photoId,photo));
  }
  events.push(model.make('product',id,cleaned));
  const trial=new Model(model.all());trial.merge(events);
  return events;
}
export function exportData(model,preferences={},coveredFileIds=[]) {
  return {appId:APP_ID,schemaVersion:SCHEMA,appVersion:VERSION,exportedAt:new Date().toISOString(),
    preferences:{theme:preferences.theme||'dark',fontScale:Number(preferences.fontScale)||1,weekStart:Number(preferences.weekStart)||0},
    coveredFileIds:[...coveredFileIds],events:model.all()};
}
export function parseBackup(data) {
  if(!data || data.appId!==APP_ID || data.schemaVersion!==SCHEMA || !Array.isArray(data.events) || data.events.length>100000) throw new Error('這不是支援的 MedLog 備份，或資料版本不相容。');
  const model=new Model(data.events);
  const files=Array.isArray(data.coveredFileIds)?data.coveredFileIds.filter(v=>typeof v==='string'&&v.length<200):[];
  return {model,preferences:data.preferences||{},coveredFileIds:files,exportedAt:data.exportedAt||''};
}
export function parseJournal(data) {
  if(!data || data.appId!==APP_ID || data.schemaVersion!==SCHEMA || !Array.isArray(data.events)||data.events.length>1000) throw new Error('雲端變更檔案格式不相容。');
  return data.events.map(cleanEvent);
}
export function amountText(v) {
  return new Intl.NumberFormat('zh-TW',{maximumFractionDigits:4}).format(v);
}
export function colorText(color) {
  const values=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));
  const luminance=.2126*values[0]+.7152*values[1]+.0722*values[2];
  return luminance>.179?'#102019':'#ffffff';
}
export function quantities(record) {
  return record.snapshot.ingredients.map(i=>({name:i.name,amount:i.amount*record.quantity/record.snapshot.basis,unit:i.unit}));
}
