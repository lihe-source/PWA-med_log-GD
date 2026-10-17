/* Shared deterministic rules. No credentials, product names, ingredients or photos. */
export const ID=/^[A-Za-z0-9_-]{1,100}$/;
export const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function taipeiNow(ms=Date.now()) {
  const iso=new Date(ms+8*3600000).toISOString();return {date:iso.slice(0,10),time:iso.slice(11,16)};
}
export function validDay(s) {return typeof s==='string'&&/^20\d\d-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
export function cleanPlan(v) {
  if(!v||!ID.test(v.productId)||!TIME.test(v.time)||!validDay(v.startDate)||typeof v.enabled!=='boolean')throw new Error('每日品項或提醒時間格式無效。');
  return {productId:v.productId,time:v.time,enabled:v.enabled,startDate:v.startDate};
}
export function cleanPlanSettings(v) {
  if(!v||typeof v.enabled!=='boolean'||!TIME.test(v.defaultTime))throw new Error('每日提醒設定格式無效。');
  return {enabled:v.enabled,defaultTime:v.defaultTime};
}
export function planSettings(model) {const p=model.get('planSettings','daily');return p&&!p.deleted?{enabled:p.enabled,defaultTime:p.defaultTime}:{enabled:true,defaultTime:'21:00'};}
export function dailyPlans(model,date=taipeiNow().date) {
  const products=new Map(model.items('product').filter(p=>p.active).map(p=>[p.id,p]));
  const done=new Set(model.items('record').filter(r=>r.date===date).map(r=>r.productId));
  return model.items('plan').filter(p=>p.enabled&&p.startDate<=date&&products.has(p.productId)).map(p=>({...p,product:products.get(p.productId),done:done.has(p.productId)})).sort((a,b)=>a.time.localeCompare(b.time)||a.productId.localeCompare(b.productId));
}
export function availableProducts(products,records,{date,originalId='',currentId='',selected=[],repeat=false}={}) {
  const logged=new Set(records.filter(r=>!r.deleted&&r.date===date&&r.id!==originalId).map(r=>r.productId));
  const elsewhere=new Set(selected);
  return products.filter(p=>!p.deleted&&(p.active||p.id===currentId)&&!elsewhere.has(p.id)&&(p.id===currentId||repeat||!logged.has(p.id))).sort((a,b)=>a.name.localeCompare(b.name,'zh-TW'));
}
export function projectEvent(e) {
  if(!['product','record','plan','planSettings'].includes(e.entity))return null;
  const value=e.deleted?null:e.entity==='product'?{active:e.value.active}:e.entity==='record'?{date:e.value.date,productId:e.value.productId}:e.value;
  return cleanProjection({id:e.id,entity:e.entity,entityId:e.entityId,parents:e.parents,createdAt:e.createdAt,deleted:e.deleted,value});
}
export function cleanProjection(e) {
  if(!e||!ID.test(e.id)||!ID.test(e.entityId)||!['product','record','plan','planSettings'].includes(e.entity)||!Array.isArray(e.parents)||e.parents.length>500||!e.parents.every(p=>ID.test(p)&&p!==e.id)||!Number.isFinite(Date.parse(e.createdAt))||typeof e.deleted!=='boolean')throw new Error('提醒同步資料格式無效。');
  let value=null;
  if(!e.deleted){
    if(e.entity==='plan'){value=cleanPlan(e.value);if(e.entityId!==value.productId)throw new Error('每日品項識別不一致。');}
    else if(e.entity==='planSettings'){if(e.entityId!=='daily')throw new Error('提醒設定識別錯誤。');value=cleanPlanSettings(e.value);}
    else if(e.entity==='product'){if(typeof e.value?.active!=='boolean')throw new Error('品項狀態格式錯誤。');value={active:e.value.active};}
    else{if(!validDay(e.value?.date)||!ID.test(e.value?.productId))throw new Error('當日完成狀態無效。');value={date:e.value.date,productId:e.value.productId};}
  }
  return {id:e.id,entity:e.entity,entityId:e.entityId,parents:[...new Set(e.parents)],createdAt:e.createdAt,deleted:e.deleted,value};
}
export function mergeProjections(existing,incoming) {
  const map=new Map(existing.map(e=>[e.id,cleanProjection(e)]));
  for(const raw of incoming){const e=cleanProjection(raw),old=map.get(e.id);if(old&&JSON.stringify(old)!==JSON.stringify(e))throw new Error('同一提醒修訂 ID 內容不一致。');map.set(e.id,e);}
  const visiting=new Set(),done=new Set();
  function visit(e){if(done.has(e.id))return;if(visiting.has(e.id))throw new Error('提醒修訂含循環。');visiting.add(e.id);for(const id of e.parents){const p=map.get(id);if(!p||p.entity!==e.entity||p.entityId!==e.entityId)throw new Error('提醒同步缺少修訂來源。');visit(p);}visiting.delete(e.id);done.add(e.id);}
  for(const e of map.values())visit(e);return [...map.values()];
}
export function projectionItems(events,entity) {
  const groups=new Map();
  for(const e of events)if(e.entity===entity){const list=groups.get(e.entityId)||[];list.push(e);groups.set(e.entityId,list);}
  return [...groups.values()].map(list=>{const consumed=new Set(list.flatMap(e=>e.parents));const e=list.filter(e=>!consumed.has(e.id)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).at(-1);return e.deleted?null:{id:e.entityId,...e.value};}).filter(Boolean);
}
export function dueGroups(events,now=Date.now()) {
  const {date,time}=taipeiNow(now),settings=projectionItems(events,'planSettings').find(v=>v.id==='daily');
  if(settings?.enabled===false)return [];
  const active=new Set(projectionItems(events,'product').filter(p=>p.active).map(p=>p.id));
  const done=new Set(projectionItems(events,'record').filter(r=>r.date===date).map(r=>r.productId));
  const groups=new Map();
  for(const p of projectionItems(events,'plan')){
    const due=Date.parse(date+'T'+p.time+':00+08:00');
    if(!p.enabled||p.startDate>date||!active.has(p.productId)||done.has(p.productId)||p.time>time||now-due>15*60000)continue;
    const list=groups.get(p.time)||[];list.push(p.productId);groups.set(p.time,list);
  }
  return [...groups].map(([at,ids])=>({date,time:at,productIds:[...new Set(ids)].sort(),count:new Set(ids).size}));
}
export function nextPlanTime(model,now=Date.now()) {
  if(planSettings(model).enabled===false)return null;
  const {date}=taipeiNow(now),todayPlans=dailyPlans(model,date).filter(p=>!p.done&&Date.parse(date+'T'+p.time+':00+08:00')>now);
  if(todayPlans.length)return date+' '+todayPlans[0].time;
  const tomorrow=taipeiNow(now+86400000).date,plans=dailyPlans(model,tomorrow);return plans.length?tomorrow+' '+plans[0].time:null;
}
