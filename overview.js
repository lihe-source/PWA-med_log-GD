import {today,quantities} from './model.js';

// Only identical ingredient names are combined. Do not infer chemical equivalence.
const nameKey=name=>name.normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase();
const weightFactors={g:1000,mg:1,'μg':.001};
export const totalText=value=>new Intl.NumberFormat('zh-TW',{maximumSignificantDigits:12}).format(value);
export function dailySummary(records,date=today()) {
  const selected=records.filter(r=>!r.deleted&&r.date===date).sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
  const groups=new Map();
  for(const record of selected) {
    const external=record.snapshot.type==='外用保養品';
    for(const ingredient of quantities(record)) {
      const unit=Object.hasOwn(weightFactors,ingredient.unit)?'mg':ingredient.unit;
      const amount=ingredient.amount*(weightFactors[ingredient.unit]??1);
      const key=JSON.stringify([external,nameKey(ingredient.name),unit]);
      if(!groups.has(key))groups.set(key,{name:ingredient.name,unit,external,total:0,correction:0,sources:new Map()});
      const group=groups.get(key);
      // Compensated summation avoids accumulating floating-point error over many records.
      const next=amount-group.correction,sum=group.total+next;
      group.correction=(sum-group.total)-next;group.total=sum;
      const source=group.sources.get(record.id)||{record,amount:0,unit};
      source.amount+=amount;group.sources.set(record.id,source);
    }
  }
  const entries=[...groups.values()].map(({correction,...g})=>({...g,sources:[...g.sources.values()],productCount:new Set([...g.sources.values()].map(s=>s.record.productId)).size}))
    .sort((a,b)=>a.name.localeCompare(b.name,'zh-TW')||a.unit.localeCompare(b.unit));
  const oralRecords=selected.filter(r=>r.snapshot.type!=='外用保養品');
  return {date,records:selected,oralRecords,productCount:new Set(oralRecords.map(r=>r.productId)).size,
    ingredients:entries.filter(g=>!g.external),external:entries.filter(g=>g.external),
    missing:selected.filter(r=>!r.snapshot.ingredients.length),conflicted:selected.filter(r=>r.conflict).length};
}

export function latestBackups(files,limit=5) {
  const time=file=>Number.isFinite(Date.parse(file.createdTime))?Date.parse(file.createdTime):0;
  return [...files].sort((a,b)=>time(b)-time(a)||String(b.id).localeCompare(String(a.id))).slice(0,limit);
}
