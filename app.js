import {APP_ID,VERSION,Model,TYPES,UNITS,COLORS,uid,clone,today,nowTime,esc,validDate,cleanProduct,cleanRecord,exportData,parseBackup,quantities,amountText,colorText} from './model.js';
import {Storage} from './storage.js';
import {Drive,Sync} from './cloud.js';
import {Updater} from './update.js';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const paths={
  calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M8 14h2m4 0h2m-8 4h2',
  pill:'M10 4a6 6 0 0 1 8.5 8.5l-6 6A6 6 0 0 1 4 10l6-6m-3 3 8.5 8.5',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3l1-1h4l1 1 .5 2 2 1 2-.5 2 3-.8 2v3l.8 2-2 3-2-.5-2 1-.5 2-1 1h-4l-1-1-.5-2-2-1-2 .5-2-3 .8-2v-3L2 8l2-3 2 .5 2-1L9 3',
  plus:'M12 5v14M5 12h14',close:'m6 6 12 12M6 18 18 6',left:'m14 6-6 6 6 6',right:'m10 6 6 6-6 6',
  search:'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16m6 14 4 4',edit:'m14 5 5 5M3 21l4-1L20 7a2.8 2.8 0 0 0-4-4L3 16v5',
  trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  cloud:'M7 18H5a4 4 0 0 1-.5-8A7 7 0 0 1 18 8a5 5 0 0 1 1 10h-2m-5-5v8m-3-5 3-3 3 3',
  backup:'M3 11V5h6M3 5a10 10 0 1 1-1 11M12 7v5l3 2',
  check:'m5 12 4 4L19 6',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  folder:'M3 7V4h6l2 3h10v13H3V7',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2',
  info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 11v6m0-10v1',
  refresh:'M20 7v5h-5M4 17v-5h5M20 12a8 8 0 0 0-14-5M4 12a8 8 0 0 0 14 5'
};
const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[name]||paths.info)+'"/></svg>';
const button=(text,action,style='',extra='',symbol='')=>'<button type="button" class="btn '+style+'" data-action="'+action+'" '+extra+'>'+(symbol?icon(symbol):'')+'<span>'+text+'</span></button>';
const iconButton=(name,action,label,extra='')=>'<button type="button" class="icon-btn" data-action="'+action+'" aria-label="'+esc(label)+'" title="'+esc(label)+'" '+extra+'>'+icon(name)+'</button>';
const options=(values,selected)=>values.map(v=>'<option value="'+esc(v)+'"'+(v===selected?' selected':'')+'>'+esc(v)+'</option>').join('');
const formattedDate=(date,opts={})=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',...opts}).format(new Date(date+'T12:00:00+08:00'));
const stamp=value=>value?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)):'尚未同步';
const defaults={clientId:'',folderId:'',apiKey:'',projectNumber:'',theme:'dark',fontScale:1,weekStart:0,autoSync:true};
const state={model:new Model(),db:new Storage(),workspace:'local',tab:'calendar',date:today(),month:today().slice(0,7),
  filter:'',productSearch:'',productType:'',settings:{...defaults},receipts:new Set(),backups:[],profile:null,
  folderName:'',boundFolder:'',lastSync:'',cloudStatus:'',writing:0,cloudRunning:false,restoring:false,
  modalKind:'',dayFlow:false,recordAfterProduct:false,draft:null,configDraft:null,googleError:'',started:false};
let drive,sync,updater,writeChain=Promise.resolve(),syncTimer,installPrompt,confirmResolver=null;
const modal=$('#modal');
function toast(message,error=false,undo=null) {
  const el=document.createElement('div');el.className='toast'+(error?' error':'');
  const text=document.createElement('span');text.textContent=message;el.append(text);
  if(undo) {const b=document.createElement('button');b.textContent='復原';b.onclick=()=>{undo().catch(e=>toast(e.message,true));el.remove();};el.append(b);}
  ((modal.open?$('.modal-notices',modal):null)||$('#toasts')).append(el);setTimeout(()=>el.remove(),undo?9000:4500);
}
function pendingCount() {return [...state.model.events.keys()].filter(id=>!state.receipts.has(id)).length;}
function applyTheme() {
  document.documentElement.dataset.theme=state.settings.theme;
  document.documentElement.style.setProperty('--font-scale',String(state.settings.fontScale));
  $('meta[name="theme-color"]').content=state.settings.theme==='light'?'#f0f5f2':'#101816';
}
function nav() {
  const pages=[['calendar','calendar','藥品記錄','記錄'],['products','pill','藥品／保健食品','品項'],['settings','settings','設定','設定']];
  const html=compact=>pages.map(([tab,symbol,label,shortLabel])=>'<button type="button" class="nav-btn'+(state.tab===tab?' active':'')+'" data-action="tab" data-tab="'+tab+'" aria-label="'+label+'"'+(state.tab===tab?' aria-current="page"':'')+'>'+icon(symbol)+'<span>'+ (compact?shortLabel:label)+'</span></button>').join('');
  $('.desktop-nav').innerHTML=html(false);$('.bottom-nav').innerHTML=html(true);
}
function pageTitle(title,subtitle,action='') {
  return '<div class="page-title"><div><p class="eyebrow">PERSONAL CARE JOURNAL</p><h1>'+title+'</h1><p class="subtitle">'+subtitle+'</p></div>'+action+'</div>';
}
function empty(title,text,action='',symbol='pill') {
  return '<div class="empty"><div class="empty-icon">'+icon(symbol)+'</div><h3>'+title+'</h3><p>'+text+'</p>'+action+'</div>';
}
function conflictBanner() {
  const count=state.model.conflicts().length;
  return count?'<div class="notice-banner warning">'+icon('info')+'<span>有 '+count+' 筆資料在不同裝置同時修改，需要確認保留內容。</span>'+button('確認差異','conflicts','outline')+'</div>':'';
}
function recordColor(record) {
  const product=state.model.get('product',record.productId);
  return product&&!product.deleted?product.color:record.snapshot.color;
}
function calendarPage() {
  const all=state.model.items('record'),products=state.model.items('product').sort((a,b)=>a.name.localeCompare(b.name,'zh-TW'));
  const records=all.filter(r=>!state.filter||r.productId===state.filter);
  const [year,month]=state.month.split('-').map(Number);
  const first=new Date(Date.UTC(year,month-1,1)),offset=(first.getUTCDay()-Number(state.settings.weekStart)+7)%7;
  const weeks=Math.ceil((offset+new Date(Date.UTC(year,month,0)).getUTCDate())/7);
  const monthRecords=records.filter(r=>r.date.startsWith(state.month));
  const weekdays=['日','一','二','三','四','五','六'];
  let cells='';
  for(let i=0;i<weeks*7;i++) {
    const date=new Date(Date.UTC(year,month-1,1-offset+i)),key=date.toISOString().slice(0,10);
    const items=records.filter(r=>r.date===key),grouped=new Map();
    for(const record of items){const group=grouped.get(record.productId)||{record,count:0};group.count++;grouped.set(record.productId,group);}
    const entries=[...grouped.values()].sort((a,b)=>a.record.snapshot.name.localeCompare(b.record.snapshot.name,'zh-TW'));
    const chips=entries.slice(0,2).map(({record,count})=>'<span class="day-chip" style="--chip:'+recordColor(record)+';color:'+colorText(recordColor(record))+'" title="'+esc(record.snapshot.name+'・'+count+' 次')+'">'+esc(record.snapshot.shortName||record.snapshot.name)+(count>1?' ×'+count:'')+'</span>').join('');
    cells+='<button type="button" class="day'+(key.slice(0,7)!==state.month?' other-month':'')+(key===today()?' today':'')+(key===state.date?' selected':'')+'" data-action="date" data-date="'+key+'" aria-label="'+key+'，'+items.length+' 筆記錄" aria-pressed="'+(key===state.date)+'"><span class="day-number">'+date.getUTCDate()+'</span><span class="day-items">'+chips+(entries.length>2?'<span class="more-label">＋'+(entries.length-2)+' 項</span>':'')+'</span></button>';
  }
  const dayRecords=records.filter(r=>r.date===state.date).sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
  const productOptions=products.map(p=>'<option value="'+esc(p.id)+'"'+(state.filter===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('');
  return '<div class="page calendar-page">'+pageTitle('藥品記錄','點日期查看當日記錄，點品項即可調整。',button('新增記錄','add-record','primary','','plus'))+conflictBanner()+
    '<div class="calendar-layout"><section class="panel calendar-panel" aria-label="服用月曆"><div class="calendar-toolbar">'+
    '<label class="visually-hidden" for="month-picker">選擇年月</label><input id="month-picker" class="month-select" type="month" value="'+state.month+'" min="2000-01" max="2200-12">'+
    '<div class="month-nav">'+iconButton('left','prev-month','上個月')+button('今天','today','outline')+iconButton('right','next-month','下個月')+'</div></div>'+
    '<div class="month-summary"><div class="summary-item"><strong>'+new Set(monthRecords.map(r=>r.date)).size+'</strong><span>記錄天數</span></div><div class="summary-item"><strong>'+new Set(monthRecords.map(r=>r.productId)).size+'</strong><span>記錄品項</span></div><div class="summary-item"><strong>'+monthRecords.length+'</strong><span>本月筆數</span></div></div>'+
    '<div class="weekdays">'+Array.from({length:7},(_,i)=>{const d=(i+Number(state.settings.weekStart))%7;return '<span class="'+(d===0||d===6?'weekend':'')+'">'+weekdays[d]+'</span>';}).join('')+'</div>'+
    '<div class="calendar-grid" style="--week-count:'+weeks+'">'+cells+'</div><div class="calendar-filter">'+icon('pill')+'<label class="visually-hidden" for="record-filter">篩選藥品</label><select id="record-filter"><option value="">全部品項</option>'+productOptions+'</select></div><p class="calendar-hint">點日期 · 查看、新增或修改當日記錄</p></section>'+
    '<section class="panel daily-panel" aria-label="選取日期的記錄"><div class="daily-heading"><div><div class="selected-label">當日記錄</div><h2>'+esc(formattedDate(state.date,{month:'long',day:'numeric'}))+'</h2></div>'+iconButton('plus','add-record','新增當日記錄')+'</div>'+
    '<p class="date-sub">'+esc(formattedDate(state.date,{year:'numeric',weekday:'long'}))+' · '+dayRecords.length+' 筆記錄</p>'+
    (dayRecords.length?'<div class="records-list">'+dayRecords.map(recordCard).join('')+'</div>':empty('這一天尚未記錄','選取藥品後，記下時間與數量。',button('新增當日記錄','add-record','outline','','plus'),'calendar'))+
    '</section></div></div>';
}
function recordCard(record) {
  const ingredients=quantities(record);
  return '<article class="record-card" style="--chip:'+recordColor(record)+'"><div class="record-top"><button type="button" class="record-open" data-action="edit-record" data-id="'+esc(record.id)+'" aria-label="'+esc('修改 '+record.time+' '+record.snapshot.name)+'"><span class="record-time">'+record.time+'</span><span class="record-name">'+esc(record.snapshot.name)+'</span><span class="record-quantity">'+amountText(record.quantity)+' '+esc(record.snapshot.unit)+(record.conflict?' · 待確認差異':'')+'</span>'+
    (record.note?'<span class="record-note">'+esc(record.note)+'</span>':'')+'<span class="record-edit-hint">點選修改</span></button><div class="record-actions">'+iconButton('trash','delete-record','刪除記錄','data-id="'+esc(record.id)+'"')+'</div></div>'+
    (ingredients.length?'<details class="ingredients-detail"><summary>本次成分含量</summary>'+ingredients.map(i=>'<p>'+esc(i.name)+' · '+amountText(i.amount)+' '+esc(i.unit)+'</p>').join('')+'<p>依當時標示基準換算</p></details>':'')+'</article>';
}
function dayViewBody() {
  const records=state.model.items('record').filter(r=>r.date===state.date).sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
  const future=state.date>today();
  return '<div class="day-view-summary"><span>'+esc(formattedDate(state.date,{year:'numeric',weekday:'long'}))+'</span><span>'+records.length+' 筆 · '+new Set(records.map(r=>r.productId)).size+' 個品項</span></div>'+
    (records.length?'<p class="day-view-hint">點選品項可調整時間、數量與備註。</p><div class="records-list">'+records.map(recordCard).join('')+'</div>':
      empty('這一天尚未記錄',future?'此日期尚未到來，請選擇今天或之前的日期。':'按下方「新增保健品／藥品」，記下本次使用的品項與數量。','','calendar'));
}
function openDay(date=state.date) {
  if(!validDate(date))return;
  state.date=date;state.month=date.slice(0,7);state.dayFlow=true;state.recordAfterProduct=false;
  openModal(esc(formattedDate(date,{month:'long',day:'numeric'}))+' · 當日記錄',
    '<div class="modal-body day-view-body" id="day-view-body">'+dayViewBody()+'</div>',
    '<div class="modal-foot day-view-foot">'+button('回到月曆','close-modal','outline')+button('新增保健品／藥品','add-record','primary',date>today()?'disabled':'','plus')+'</div>','day');
}
function backToDay() {
  try{sessionStorage.removeItem('medlog-draft');}catch{}
  openDay(state.date);
}
function productCards() {
  const list=state.model.items('product').filter(p=>(!state.productType||p.type===state.productType)&&(!state.productSearch||[p.name,p.brand,p.manufacturer].join(' ').toLowerCase().includes(state.productSearch.toLowerCase())))
    .sort((a,b)=>Number(b.active)-Number(a.active)||a.name.localeCompare(b.name,'zh-TW'));
  return list.length?'<div class="product-grid">'+list.map(p=>'<article class="panel product-card'+(!p.active?' inactive':'')+'" style="--chip:'+p.color+'"><div class="product-heading"><div><span class="product-type">'+esc(p.type)+(!p.active?' · 已停用':'')+'</span><h2>'+esc(p.name)+'</h2><p class="product-brand">'+esc([p.brand,p.manufacturer].filter(Boolean).join(' · ')||'未填寫品牌／製造商')+'</p></div><div>'+iconButton('edit','edit-product','編輯品項','data-id="'+esc(p.id)+'"')+'</div></div>'+
    '<div class="product-ingredients">'+(p.ingredients.length?p.ingredients.slice(0,4).map(i=>'<span class="ingredient-tag">'+esc(i.name)+' '+amountText(i.amount)+' '+esc(i.unit)+'</span>').join('')+(p.ingredients.length>4?'<span class="ingredient-tag">＋'+(p.ingredients.length-4)+' 個成分</span>':''):'<span class="ingredient-tag">未設定成分</span>')+'</div>'+
    '<div class="product-footer"><span>每 '+amountText(p.basis)+' '+esc(p.unit)+(p.conflict?' · 待確認差異':'')+'</span><div>'+iconButton('trash','delete-product','刪除品項','data-id="'+esc(p.id)+'"')+(p.active?button('記錄','record-product','outline','data-id="'+esc(p.id)+'"'):'')+'</div></div></article>').join('')+'</div>':
    '<div class="panel">'+empty(state.productSearch||state.productType?'找不到符合的品項':'建立你的常用品項',state.productSearch||state.productType?'調整搜尋文字或分類。':'先新增藥品、保健食品或保養品，再從月曆快速記錄。',button('新增品項','add-product','primary','','plus'))+'</div>';
}
function productsPage() {
  return '<div class="page">'+pageTitle('藥品／保健食品','把品牌、成分與月曆顏色整理在一起。',button('新增品項','add-product','primary','','plus'))+conflictBanner()+
    '<div class="search-toolbar"><div class="search-box">'+icon('search')+'<label class="visually-hidden" for="product-search">搜尋品項</label><input id="product-search" placeholder="搜尋名稱、品牌或製造商" value="'+esc(state.productSearch)+'"></div><label class="visually-hidden" for="product-type">品項類型</label><select id="product-type"><option value="">全部類型</option>'+options(TYPES,state.productType)+'</select></div><div id="product-results">'+productCards()+'</div></div>';
}
function sectionHeading(symbol,title,subtitle) {
  return '<div class="section-heading"><div class="section-icon">'+icon(symbol)+'</div><div><h2>'+title+'</h2><p>'+subtitle+'</p></div></div>';
}
function settingsPage() {
  const settings=state.configDraft||state.settings,account=drive.user||state.profile;
  const dataCounts=state.model.items('product').length+' 品項 / '+state.model.items('record').length+' 記錄';
  return '<div class="page">'+pageTitle('設定','帳戶、備份與版本狀況，集中管理。')+conflictBanner()+'<div class="settings-stack">'+
    '<section class="panel settings-panel">'+sectionHeading('cloud','帳戶與雲端','Google Drive 連線與資料夾設定')+
    '<div class="account-row"><div class="account-info"><span class="avatar">'+esc((account?.displayName||'G').slice(0,1))+'</span><div><strong>'+esc(account?.emailAddress||'尚未連線 Google')+'</strong><span id="account-caption">'+(drive.connected()?'已連線 · '+esc(state.folderName||'請指定資料夾'):account?'上次使用的帳戶 · 本機資料可繼續記錄':'連線前可先使用本機記錄')+'</span></div></div>'+button(drive.connected()?'重新連線':'連線 Google','connect','primary','data-cloud-action')+'</div>'+
    '<form id="cloud-form"><div class="form-grid"><div class="field full"><label for="client-id">OAuth Client ID</label><input id="client-id" name="clientId" autocomplete="off" spellcheck="false" placeholder="…apps.googleusercontent.com" value="'+esc(settings.clientId)+'"></div>'+
    '<div class="field full"><label for="folder-id">Google Drive 資料夾 ID</label><input id="folder-id" name="folderId" autocomplete="off" spellcheck="false" placeholder="貼上資料夾 ID 或 Drive 資料夾網址" value="'+esc(settings.folderId)+'"><p class="help">既有資料夾首次使用時，需透過選取器授權。</p></div></div>'+
    '<details class="advanced"'+(!settings.apiKey?' open':'')+'><summary>資料夾選取器設定</summary><div class="form-grid"><div class="field"><label for="api-key">Google Picker API Key</label><input id="api-key" name="apiKey" autocomplete="off" spellcheck="false" placeholder="API Key" value="'+esc(settings.apiKey)+'"></div><div class="field"><label for="project-number">Google Cloud 專案編號</label><input id="project-number" name="projectNumber" inputmode="numeric" autocomplete="off" placeholder="數字專案編號" value="'+esc(settings.projectNumber)+'"></div></div></details>'+
    '<div class="button-row"><button type="submit" class="btn primary" data-cloud-action>儲存連線設定</button>'+button('選取資料夾','pick-folder','outline','data-cloud-action','folder')+button('建立專用資料夾','create-folder','outline','data-cloud-action')+'</div></form>'+
    '<div class="button-row">'+button('立即同步','sync','outline','data-cloud-action','refresh')+button('測試連線','test-cloud','outline','data-cloud-action')+(drive.connected()?button('中斷連線','disconnect','outline','data-cloud-action'):'')+button('本機資料','local-workspace','outline','data-cloud-action')+'</div>'+
    '<div class="sync-overview"><div><small>目前資料</small><strong id="data-counts">'+dataCounts+'</strong></div><div><small>待上傳變更</small><strong id="pending-count">'+pendingCount()+' 筆</strong></div><div><small>上次成功同步</small><strong id="last-sync">'+esc(stamp(state.lastSync))+'</strong></div></div>'+
    '<p id="cloud-status" class="inline-note">'+esc(state.cloudStatus||'本機先儲存；連線有效時同步至 Drive。')+'</p>'+
    (state.googleError?'<div class="button-row">'+button('重試載入 Google 元件','retry-google','outline')+'</div>':'')+
    '<div class="toggle-row"><label><input type="checkbox" id="auto-sync"'+(state.settings.autoSync?' checked':'')+'>自動同步</label><span class="small muted">開啟期間執行</span></div></section>'+
    '<section class="panel settings-panel">'+sectionHeading('backup','備份與復原','每日自動備份保留近 30 份，手動備份另外保留')+
    '<div class="button-row">'+button('雲端備份','backup','primary','data-cloud-action','cloud')+button('讀取備份清單','list-backups','outline','data-cloud-action')+button('匯出本機 JSON','export','outline','','download')+button('匯入備份','import','outline')+'</div>'+
    '<div class="button-row">'+button('下載還原前安全備份','safety-export','outline')+'</div><p class="inline-note">還原前先驗證與預覽內容，並保存目前資料。備份不包含登入權杖。</p><div id="backup-list" class="backup-list">'+backupRows()+'</div></section>'+
    '<section class="panel settings-panel">'+sectionHeading('sun','外觀與顯示','依裝置調整閱讀方式')+
    '<div class="form-grid"><div class="field"><label for="theme">主題</label><select id="theme"><option value="dark"'+(state.settings.theme==='dark'?' selected':'')+'>深色</option><option value="light"'+(state.settings.theme==='light'?' selected':'')+'>淺色</option></select></div>'+
    '<div class="field"><label for="font-scale">字體大小</label><select id="font-scale"><option value="1"'+(Number(state.settings.fontScale)===1?' selected':'')+'>標準</option><option value="1.1"'+(Number(state.settings.fontScale)===1.1?' selected':'')+'>較大</option><option value="1.2"'+(Number(state.settings.fontScale)===1.2?' selected':'')+'>大</option></select></div>'+
    '<div class="field"><label for="week-start">每週起始日</label><select id="week-start"><option value="0"'+(!Number(state.settings.weekStart)?' selected':'')+'>星期日</option><option value="1"'+(Number(state.settings.weekStart)===1?' selected':'')+'>星期一</option></select></div></div></section>'+
    '<section class="panel settings-panel">'+sectionHeading('info','版本與系統','啟動時自動檢查，完成儲存後自動套用新版')+
    '<div class="version-grid"><div><small>目前版本</small><strong>V'+VERSION+'</strong></div><div><small>線上最新版本</small><strong id="latest-version">'+(updater.latest?'V'+esc(updater.latest):'尚未確認')+'</strong></div></div>'+
    '<p class="version-message" id="version-status">'+esc(updater.status)+'</p><p class="help" id="version-checked">'+(updater.checkedAt?'上次檢查：'+esc(stamp(updater.checkedAt)):'')+'</p>'+
    '<div class="button-row">'+button('檢查更新','check-update','primary','','refresh')+button('安裝／加入主畫面','install','outline')+button('部署與設定說明','help','outline')+'</div></section>'+
    '</div></div>';
}
function backupRows() {
  if(!state.backups.length)return '<p class="help">按「讀取備份清單」查看此 App 的雲端備份。</p>';
  return [...state.backups].reverse().map(b=>'<div class="backup-row"><div><strong>'+esc(b.appProperties?.backupType==='auto'?'每日自動備份':b.appProperties?.backupType==='before-restore'?'還原前安全備份':'手動備份')+'</strong><span>'+esc(stamp(b.createdTime))+' · '+Math.ceil(Number(b.size||0)/1024)+' KB</span></div>'+button('預覽還原','restore-cloud','outline','data-id="'+esc(b.id)+'" data-cloud-action')+'</div>').join('');
}
function render() {
  nav();$('#main').innerHTML=state.tab==='calendar'?calendarPage():state.tab==='products'?productsPage():settingsPage();
  if(state.modalKind==='day'&&$('#day-view-body'))$('#day-view-body').innerHTML=dayViewBody();
  updateIndicators();
}
function updateIndicators() {
  const busy=state.cloudRunning||sync?.busy||state.restoring;
  const pending=pendingCount();
  const status=state.writing?'正在儲存':busy?(state.cloudStatus||'正在同步'):!navigator.onLine?'離線 · 已存本機':drive?.connected()&&state.boundFolder?(pending?'待同步 '+pending+' 筆':'已同步雲端'):pending&&state.workspace!=='local'?'已存本機 · 待連線':'已儲存本機';
  $('#global-status').textContent=status;$('#global-status').classList.toggle('warn',!navigator.onLine||pending>0&&state.workspace!=='local');
  if($('#cloud-status'))$('#cloud-status').textContent=state.cloudStatus||'本機先儲存；連線有效時同步至 Drive。';
  if($('#pending-count'))$('#pending-count').textContent=pending+' 筆';
  if($('#last-sync'))$('#last-sync').textContent=stamp(state.lastSync);
  if($('#data-counts'))$('#data-counts').textContent=state.model.items('product').length+' 品項 / '+state.model.items('record').length+' 記錄';
  for(const b of $$('[data-cloud-action]'))b.disabled=busy;
  const connect=$('[data-action="connect"]');
  if(connect) {
    connect.disabled=busy||!drive?.ready;
    connect.querySelector('span').textContent=drive?.ready?(drive.connected()?'重新連線':'連線 Google'):state.googleError?'Google 元件未載入':'載入 Google 元件…';
  }
  if($('#latest-version'))$('#latest-version').textContent=updater.latest?'V'+updater.latest:'尚未確認';
  if($('#version-status'))$('#version-status').textContent=updater.status;
  if($('#version-checked'))$('#version-checked').textContent=updater.checkedAt?'上次檢查：'+stamp(updater.checkedAt):'';
  const check=$('[data-action="check-update"]');if(check)check.disabled=updater.checking;
}
function queueWrite(operation) {
  state.writing++;updateIndicators();
  const result=writeChain.then(operation);
  writeChain=result.catch(()=>{});
  return result.finally(()=>{state.writing--;updateIndicators();});
}
async function mergeEvents(events,ack=false,context=null) {
  const ctx=context||{workspace:state.workspace,model:state.model};
  await queueWrite(async()=>{
    const trial=new Model(ctx.model.all());trial.merge(events);
    await state.db.save(ctx.workspace,events,ack?events.map(e=>e.id):[]);
    ctx.model.merge(events);
    if(ctx.workspace===state.workspace&&ack)for(const e of events)state.receipts.add(e.id);
  });
}
async function commit(entity,id,value,deleted=false) {
  let event;
  await queueWrite(async()=>{
    event=state.model.make(entity,id,value,deleted);
    await state.db.save(state.workspace,[event]);
    state.model.merge([event]);
  });
  render();scheduleSync();return event;
}
function scheduleSync() {
  clearTimeout(syncTimer);
  if(!state.settings.autoSync||!drive?.connected()||!state.boundFolder||state.restoring)return;
  syncTimer=setTimeout(()=>runSync(true).catch(()=>{}),1800);
}
async function refreshData() {
  const data=await state.db.load(state.workspace);
  state.receipts=data.receipts;state.lastSync=await state.db.meta('lastSync:'+state.workspace,'');
  if(state.tab!=='settings')render();else updateIndicators();
}
async function runSync(automatic=false,backup=false) {
  if(sync.busy)return;
  try {
    await sync.run({automatic,backup});
    if(!automatic)toast(backup?'雲端備份已完成。':'同步已完成。');
    if(pendingCount()&&state.settings.autoSync&&drive.connected())scheduleSync();
  } catch(error) {state.cloudStatus=error.message;updateIndicators();if(!automatic)toast(error.message,true);throw error;}
}
async function loadWorkspace(workspace) {
  await writeChain;
  const data=await state.db.load(workspace);
  state.workspace=workspace;state.model=new Model(data.events);state.receipts=data.receipts;
  state.profile=await state.db.meta('profile:'+workspace,null);
  state.lastSync=await state.db.meta('lastSync:'+workspace,'');
  state.filter='';state.backups=[];
  await state.db.setMeta('workspace',workspace);
}
async function bindFolder(folderId) {
  const folder=await drive.folder(folderId);
  const workspace='drive:'+drive.user.permissionId+':'+folder.id;
  const local=state.workspace==='local'?state.model.all():[];
  if(workspace!==state.workspace) {
    await loadWorkspace(workspace);
    if(local.length)await mergeEvents(local);
  }
  state.settings.folderId=folder.id;drive.settings=state.settings;state.configDraft=null;
  state.boundFolder=folder.id;state.folderName=folder.name;state.profile=clone(drive.user);
  await state.db.setMeta('settings',state.settings);await state.db.setMeta('profile:'+workspace,state.profile);
  await state.db.setMeta('folderName:'+workspace,folder.name);
  state.cloudStatus='已連線至 '+folder.name;render();
}
async function connect() {
  if(state.cloudRunning||sync.busy)return;
  state.boundFolder='';
  state.cloudRunning=true;state.cloudStatus='等待 Google 授權';updateIndicators();
  try {
    await drive.authorize();
    if(state.settings.folderId)await bindFolder(state.settings.folderId);
    else {state.cloudStatus='Google 已連線，請選取資料夾或建立專用資料夾。';render();}
  } finally {state.cloudRunning=false;updateIndicators();}
  if(state.boundFolder)await runSync(false);
}
async function prepareGoogle() {
  state.googleError='';
  if(!navigator.onLine)return;
  try {await drive.prepare();updateIndicators();}
  catch(error) {state.googleError=error.message;if(state.tab==='settings')render();}
}
function openModal(title,body,foot='',kind='') {
  if(!['day','record','product','product-guide'].includes(kind)){state.dayFlow=false;state.recordAfterProduct=false;}
  state.modalKind=kind;
  modal.dataset.kind=kind;
  const back=state.dayFlow&&kind!=='day'?iconButton('left','back-day','返回當日記錄'):'';
  modal.innerHTML='<div class="modal-shell"><div class="modal-head">'+back+'<h2 id="modal-title" tabindex="-1">'+title+'</h2>'+iconButton('close','close-modal','關閉視窗')+'</div><div class="modal-notices" aria-live="polite"></div>'+body+foot+'</div>';
  if(!modal.open)modal.showModal();
  $('#modal-title')?.focus({preventScroll:true});
}
function closeModal(clear=true) {
  if(clear) {try{sessionStorage.removeItem('medlog-draft');}catch{}}
  modal.close();state.modalKind='';state.dayFlow=false;state.recordAfterProduct=false;
}
function confirm(title,message,accept='確認',danger=false) {
  return new Promise(resolve=>{
    confirmResolver=resolve;
    openModal(title,'<div class="modal-body confirm-copy">'+message+'</div>',
      '<div class="modal-foot">'+button('取消','confirm-cancel','outline')+button(accept,'confirm-ok',danger?'danger outline':'primary')+'</div>','confirm');
  });
}
function ingredientRow(item={name:'',amount:'',unit:'mg'}) {
  return '<div class="ingredient-row"><input data-ingredient="name" aria-label="成分名稱" placeholder="成分名稱" maxlength="100" value="'+esc(item.name)+'"><input data-ingredient="amount" aria-label="成分含量" type="number" min="0" max="1000000000" step="any" placeholder="含量" value="'+esc(item.amount)+'"><select data-ingredient="unit" aria-label="成分單位">'+options(UNITS,item.unit)+'</select>'+iconButton('trash','remove-ingredient','移除此成分')+'</div>';
}
function openProduct(id='',draft=null) {
  const existing=id?state.model.get('product',id):null;
  const p=draft||existing||{name:'',shortName:'',brand:'',manufacturer:'',type:'保健食品',unit:'顆',basis:1,color:COLORS[state.model.items('product').length%COLORS.length],ingredients:[],active:true,note:''};
  const body='<form id="product-form" data-id="'+esc(id)+'"><div class="modal-body"><div class="form-grid">'+
    '<div class="field full"><label for="p-name">品項名稱 *</label><input id="p-name" name="name" required maxlength="100" placeholder="例如：日常保健食品" value="'+esc(p.name)+'"></div>'+
    '<div class="field"><label for="p-type">類型</label><select id="p-type" name="type">'+options(TYPES,p.type)+'</select></div>'+
    '<div class="field"><label for="p-short">月曆短名稱</label><input id="p-short" name="shortName" maxlength="12" placeholder="選填，建議 2～4 字" value="'+esc(p.shortName)+'"></div>'+
    '<div class="field"><label for="p-brand">品牌</label><input id="p-brand" name="brand" maxlength="100" value="'+esc(p.brand)+'"></div>'+
    '<div class="field"><label for="p-manufacturer">製造商</label><input id="p-manufacturer" name="manufacturer" maxlength="100" value="'+esc(p.manufacturer)+'"></div>'+
    '<div class="field"><label for="p-unit">記錄單位</label><input id="p-unit" name="unit" required maxlength="20" list="dose-units" value="'+esc(p.unit)+'"><datalist id="dose-units">'+['顆','錠','包','滴','mL','次'].map(u=>'<option value="'+u+'">').join('')+'</datalist></div>'+
    '<div class="field"><label for="p-basis">以下成分標示於每幾個單位 *</label><input id="p-basis" name="basis" type="number" required min=".001" max="100000" step="any" value="'+esc(p.basis)+'"><p class="help">例如每份 2 顆，請填 2。</p></div>'+
    '<div class="field full"><label for="p-color">月曆顏色</label><div class="color-row"><input id="p-color" name="color" type="color" value="'+esc(p.color)+'">'+COLORS.map(c=>'<button type="button" class="swatch'+(p.color===c?' chosen':'')+'" style="--chip:'+c+'" data-action="color" data-color="'+c+'" aria-label="選擇顏色 '+c+'"></button>').join('')+'</div></div></div>'+
    '<div class="ingredients-header"><span class="field-label">複合成分與含量</span>'+button('新增成分','add-ingredient','outline','','plus')+'</div><p class="help">每個成分可獨立設定含量；單位不互相換算。</p>'+
    '<div id="ingredient-rows" class="ingredient-rows">'+(p.ingredients.length?p.ingredients.map(ingredientRow).join(''):ingredientRow())+'</div>'+
    '<div class="field" style="margin-top:20px"><label for="p-note">備註</label><textarea id="p-note" name="note" maxlength="4000">'+esc(p.note)+'</textarea></div>'+
    '<label class="checkbox-field" style="margin-top:14px"><input type="checkbox" name="active"'+(p.active?' checked':'')+'>列入常用品項</label>'+
    '<div class="form-error" role="alert"></div></div><div class="modal-foot">'+button(state.dayFlow?'返回當日':'取消',state.dayFlow?'back-day':'close-modal','outline')+'<button type="submit" class="btn primary">儲存品項</button></div></form>';
  openModal(id?'編輯品項':'新增品項',body,'','product');
}
function collectProduct(form) {
  const values=Object.fromEntries(new FormData(form)),ingredients=$$('.ingredient-row',form).map(row=>{
    const name=$('[data-ingredient="name"]',row).value.trim(),raw=$('[data-ingredient="amount"]',row).value;
    if(!name&&!raw)return null;
    if(!name||raw==='')throw new Error('請完整填寫每列的成分名稱與含量。');
    return {name,amount:Number(raw),unit:$('[data-ingredient="unit"]',row).value};
  }).filter(Boolean);
  return cleanProduct({...values,basis:Number(values.basis),ingredients,active:$('[name="active"]',form).checked});
}
function intakeRow(item={productId:'',quantity:1},original=null) {
  const products=state.model.items('product').filter(p=>p.active||p.id===item.productId).sort((a,b)=>a.name.localeCompare(b.name,'zh-TW'));
  let list=products.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===item.productId?' selected':'')+'>'+esc(p.name)+(!p.active?'（已停用）':'')+'</option>').join('');
  if(original&&original.productId===item.productId&&!products.some(p=>p.id===item.productId))list='<option value="'+esc(item.productId)+'" selected>'+esc(original.snapshot.name)+'（歷史品項）</option>'+list;
  return '<div class="intake-row"><div class="form-grid intake-fields"><div class="field"><label>品項<select data-intake="product" required><option value="">選擇品項</option>'+list+'</select></label></div><div class="field"><label>數量<input data-intake="quantity" type="number" required min=".001" max="100000" step="any" value="'+esc(item.quantity)+'"></label></div></div><div class="intake-preview"></div><div class="button-row">'+button('移除此品項','remove-intake','outline danger')+'</div></div>';
}
function openRecord(id='',productId='',draft=null) {
  const original=id?state.model.get('record',id):null;
  const d=draft||{date:original?.date||state.date,time:original?.time||(state.date===today()?nowTime():'08:00'),note:original?.note||'',items:[{productId:original?.productId||productId,quantity:original?.quantity||1}]};
  if(!state.model.items('product').some(p=>p.active)&&!original) {
    openModal('新增記錄','<div class="modal-body">'+empty('先建立常用品項','新增藥品或保健食品後，就能在月曆記錄。',button('新增品項','add-product','primary','','plus'))+'</div>',
      '<div class="modal-foot">'+button(state.dayFlow?'返回當日':'關閉',state.dayFlow?'back-day':'close-modal','outline')+'</div>','product-guide');return;
  }
  const body='<form id="record-form" data-id="'+esc(id)+'"><div class="modal-body"><div class="form-grid record-datetime"><div class="field"><label for="r-date">記錄日期 *</label><input id="r-date" name="date" type="date" required min="2000-01-01" max="'+today()+'" value="'+esc(d.date)+'"></div><div class="field"><label for="r-time">時間（24 小時制）*</label><input id="r-time" name="time" type="time" required value="'+esc(d.time)+'"></div></div>'+
    '<div id="intake-rows" class="ingredient-rows" style="margin-top:20px">'+d.items.map(item=>intakeRow(item,original)).join('')+'</div>'+
    '<div class="button-row">'+button('加入其他品項','add-intake','outline','','plus')+'</div>'+
    '<div class="field" style="margin-top:20px"><label for="r-note">備註</label><textarea id="r-note" name="note" maxlength="4000" placeholder="例如：飯後服用">'+esc(d.note)+'</textarea></div><div class="form-error" role="alert"></div></div>'+
    '<div class="modal-foot">'+button(state.dayFlow?'返回當日':'取消',state.dayFlow?'back-day':'close-modal','outline')+'<button type="submit" class="btn primary">儲存記錄</button></div></form>';
  openModal(id?'編輯記錄':'新增記錄',body,'','record');updateIntakePreviews();
}
function recordDraft(form) {
  return {date:$('[name=date]',form).value,time:$('[name=time]',form).value,note:$('[name=note]',form).value,
    items:$$('.intake-row',form).map(row=>({productId:$('[data-intake=product]',row).value,quantity:$('[data-intake=quantity]',row).value}))};
}
function updateIntakePreviews() {
  const form=$('#record-form');if(!form)return;
  const original=form.dataset.id?state.model.get('record',form.dataset.id):null;
  for(const row of $$('.intake-row',form)) {
    const productId=$('[data-intake=product]',row).value;
    const product=state.model.get('product',productId);
    const snapshot=original?.productId===productId?original.snapshot:product&&!product.deleted?product:null;
    const amount=Number($('[data-intake=quantity]',row).value),preview=$('.intake-preview',row);
    if(!snapshot){preview.innerHTML='';continue;}
    preview.innerHTML='<div class="record-preview" style="--chip:'+snapshot.color+'"><strong>'+esc(snapshot.name)+' · '+amountText(amount||0)+' '+esc(snapshot.unit)+'</strong><p>'+
      (snapshot.ingredients.length?snapshot.ingredients.map(i=>esc(i.name)+' '+amountText(i.amount*(amount||0)/snapshot.basis)+' '+esc(i.unit)).join(' ／ '):'未設定成分含量')+
      '</p><p>成分基準：每 '+amountText(snapshot.basis)+' '+esc(snapshot.unit)+(original?.productId===productId?' · 保留此記錄當時的成分':'')+'</p></div>';
  }
}
function saveDraft() {
  try {
    let draft=null;
    const p=$('#product-form'),r=$('#record-form');
    if(p) {
      const values=Object.fromEntries(new FormData(p));
      draft={workspace:state.workspace,kind:'product',id:p.dataset.id,value:{...values,active:$('[name=active]',p).checked,
        ingredients:$$('.ingredient-row',p).map(row=>({name:$('[data-ingredient=name]',row).value,amount:$('[data-ingredient=amount]',row).value,unit:$('[data-ingredient=unit]',row).value}))}};
    }
    if(r)draft={workspace:state.workspace,kind:'record',id:r.dataset.id,value:recordDraft(r)};
    if(draft)sessionStorage.setItem('medlog-draft',JSON.stringify({...draft,dayFlow:state.dayFlow,recordAfterProduct:state.recordAfterProduct}));
    sessionStorage.setItem('medlog-view',JSON.stringify({workspace:state.workspace,date:state.date,month:state.month,tab:state.tab,dayFlow:state.dayFlow}));
  } catch {}
}
function formError(form,error) {
  const el=$('.form-error',form);el.textContent=error.message;el.classList.add('visible');el.scrollIntoView({block:'nearest'});
}
async function saveProductForm(form) {
  try {
    const p=collectProduct(form),id=form.dataset.id||uid();
    for(const b of $$('button[type=submit]',form))b.disabled=true;
    const dayFlow=state.dayFlow,resumeRecord=state.recordAfterProduct;
    await commit('product',id,p);
    try{sessionStorage.removeItem('medlog-draft');}catch{}
    if(resumeRecord){state.dayFlow=dayFlow;state.recordAfterProduct=false;openRecord('',id);}
    else if(dayFlow)openDay();
    else closeModal();
    toast('品項已儲存。');
  } catch(error){formError(form,error);for(const b of $$('button[type=submit]',form))b.disabled=false;}
}
async function saveRecordForm(form) {
  try {
    const draft=recordDraft(form);
    if(!validDate(draft.date)||draft.date>today())throw new Error('請選擇今天或過去的記錄日期。');
    if(!draft.items.length)throw new Error('請至少選擇一個品項。');
    const selected=new Set(),original=form.dataset.id?state.model.get('record',form.dataset.id):null;
    const values=draft.items.map(item=>{
      if(selected.has(item.productId))throw new Error('同一次儲存請選擇不同品項；同品項的另一次服用可另外新增。');
      selected.add(item.productId);
      const product=state.model.get('product',item.productId);
      const snapshot=original?.productId===item.productId?original.snapshot:product&&!product.deleted?product:null;
      if(!snapshot)throw new Error('請選擇有效的品項。');
      return cleanRecord({date:draft.date,time:draft.time,productId:item.productId,quantity:Number(item.quantity),note:draft.note,snapshot});
    });
    for(const b of $$('button[type=submit]',form))b.disabled=true;
    await queueWrite(async()=>{
      const events=values.map((value,i)=>state.model.make('record',i===0&&form.dataset.id?form.dataset.id:uid(),value));
      await state.db.save(state.workspace,events);state.model.merge(events);
    });
    const dayFlow=state.dayFlow;
    state.date=draft.date;state.month=draft.date.slice(0,7);state.tab='calendar';
    try{sessionStorage.removeItem('medlog-draft');}catch{}
    render();
    if(dayFlow)openDay(draft.date);
    else closeModal();
    scheduleSync();toast(values.length+' 筆記錄已儲存。');
  } catch(error){formError(form,error);for(const b of $$('button[type=submit]',form))b.disabled=false;}
}
async function deleteItem(entity,id) {
  const item=state.model.get(entity,id);if(!item||item.deleted)return;
  if(entity==='product'&&!await confirm('刪除品項','將「'+esc(item.name)+'」移出常用品項。<br>過去的服用記錄及當時成分仍會保留。','刪除品項',true))return;
  const value=clone(item.heads.at(-1).value);
  await commit(entity,id,null,true);
  toast(entity==='product'?'品項已刪除，歷史記錄保留。':'記錄已刪除。',false,()=>commit(entity,id,value));
}
function download(data,name) {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function showRestore(data,source) {
  const parsed=parseBackup(data);state.restoreData=parsed;
  const p=parsed.model.items('product').length,r=parsed.model.items('record').length;
  openModal('預覽備份','<div class="modal-body confirm-copy"><p>來源：'+esc(source)+'</p><p>備份時間：'+esc(parsed.exportedAt?stamp(parsed.exportedAt):'未提供')+'</p><div class="month-summary"><div class="summary-item"><strong>'+p+'</strong><span>品項</span></div><div class="summary-item"><strong>'+r+'</strong><span>記錄</span></div><div class="summary-item"><strong>'+parsed.model.conflicts().length+'</strong><span>待確認差異</span></div></div>'+
    '<p><strong>合併還原</strong>保留目前資料並加入備份內容；同筆差異會提示確認。</p><p><strong>取代目前資料</strong>將目前資料調整為備份內容。還原前會先保留安全備份。</p><p class="help">還原將影響目前使用的帳戶／資料夾資料，之後會同步至其他裝置。</p></div>',
    '<div class="modal-foot">'+button('取消','close-modal','outline')+button('取代目前資料','restore-replace','outline danger')+button('合併還原','restore-merge','primary')+'</div>','restore');
}
async function restore(replace) {
  if(state.restoring||sync.busy||state.cloudRunning)throw new Error('請等待目前同步或還原作業完成。');
  const parsed=state.restoreData;if(!parsed)return;
  if(replace&&parsed.model.conflicts().length)throw new Error('備份中有未確認的差異，請先使用合併還原。');
  if(replace&&!await confirm('確認取代資料','將目前資料調整為備份內容，並保留還原前安全備份。','確認取代',true))return;
  state.restoring=true;updateIndicators();
  for(const b of $$('button',modal))b.disabled=true;
  try {
    if(navigator.onLine&&drive.connected()&&state.boundFolder)await runSync(true);
    await state.db.setMeta('safety:'+state.workspace,exportData(state.model,state.settings));
    if(navigator.onLine&&drive.connected()&&state.boundFolder)await sync.backup(sync.hooks.context(),'before-restore');
    if(replace) {
      await queueWrite(async()=>{
        const events=[];
        for(const entity of ['product','record']) {
          const current=state.model.items(entity,true),target=parsed.model.items(entity,true);
          const ids=new Set([...current.map(i=>i.id),...target.map(i=>i.id)]);
          for(const id of ids) {
            const next=target.find(i=>i.id===id),old=current.find(i=>i.id===id);
            if((!next||next.deleted)&&(!old||old.deleted&&!old.conflict))continue;
            const value=next&&!next.deleted?next.heads.at(-1).value:null;
            events.push(state.model.make(entity,id,value,!next||next.deleted));
          }
        }
        await state.db.save(state.workspace,events);state.model.merge(events);
      });
    } else await mergeEvents(parsed.model.all());
    const preferences=parsed.preferences,next={...state.settings};
    if(['dark','light'].includes(preferences.theme))next.theme=preferences.theme;
    if([1,1.1,1.2].includes(Number(preferences.fontScale)))next.fontScale=Number(preferences.fontScale);
    if([0,1].includes(Number(preferences.weekStart)))next.weekStart=Number(preferences.weekStart);
    await state.db.setMeta('settings',next);state.settings=next;drive.settings=next;applyTheme();
    closeModal();render();toast('還原完成，原資料已保留安全備份。');
  } finally {state.restoring=false;for(const b of $$('button',modal))b.disabled=false;updateIndicators();}
  scheduleSync();
}
function conflictDescription(head) {
  if(head.deleted)return '<p>此版本已刪除資料。</p>';
  const v=head.value;
  if(head.entity==='product')return '<p>'+esc(v.type)+' · '+esc(v.brand||'未填品牌')+' · '+esc(v.manufacturer||'未填製造商')+'</p><p>每 '+amountText(v.basis)+' '+esc(v.unit)+'；'+v.ingredients.map(i=>esc(i.name)+' '+amountText(i.amount)+' '+esc(i.unit)).join(' ／ ')+'</p><p>'+esc(v.note||'無備註')+'</p>';
  return '<p>'+esc(v.date)+' '+esc(v.time)+' · '+esc(v.snapshot.name)+' · '+amountText(v.quantity)+' '+esc(v.snapshot.unit)+'</p><p>'+quantities(v).map(i=>esc(i.name)+' '+amountText(i.amount)+' '+esc(i.unit)).join(' ／ ')+'</p><p>'+esc(v.note||'無備註')+'</p>';
}
function showConflicts() {
  const groups=state.model.conflicts();
  if(!groups.length){toast('目前沒有同步衝突。');closeModal();return;}
  openModal('確認同步差異','<div class="modal-body"><p class="help">同一筆資料在不同裝置修改。選取要保留的版本，其他修訂仍保留於歷史資料中。</p>'+
    groups.map((heads,i)=>'<div style="margin:22px 0"><h3>差異 '+(i+1)+' · '+(heads[0].entity==='product'?'品項':'記錄')+'</h3>'+heads.map(head=>'<button type="button" class="conflict-option" data-action="resolve" data-head="'+esc(head.id)+'"><strong>保留'+(head.deleted?'刪除狀態':'此版本')+' · '+esc(stamp(head.createdAt))+'</strong>'+conflictDescription(head)+'</button>').join('')+'</div>').join('')+'</div>',
    '<div class="modal-foot">'+button('稍後確認','close-modal','outline')+'</div>','conflicts');
}
async function saveConfig(form) {
  if(state.cloudRunning||sync.busy)return;
  const values=Object.fromEntries(new FormData(form));
  for(const key of ['clientId','folderId','apiKey','projectNumber'])values[key]=(values[key]||'').trim();
  if(values.folderId.includes('/folders/'))values.folderId=values.folderId.split('/folders/')[1].split(/[?#/]/)[0];
  if(values.clientId&&!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(values.clientId))throw new Error('OAuth Client ID 格式應以 .apps.googleusercontent.com 結尾。');
  if(values.folderId&&!/^[A-Za-z0-9_-]{5,200}$/.test(values.folderId))throw new Error('資料夾 ID 格式無效。');
  if(values.projectNumber&&!/^\d{5,30}$/.test(values.projectNumber))throw new Error('Google Cloud 專案編號應為數字。');
  const changed=values.clientId!==state.settings.clientId||values.folderId!==state.settings.folderId;
  const next={...state.settings,...values};await state.db.setMeta('settings',next);state.settings=next;drive.settings=next;state.configDraft=null;
  if(changed){drive.disconnect();state.boundFolder='';}
  render();toast(changed?'設定已儲存，請連線 Google。':'設定已儲存。');
}
async function setPreference(key,value) {
  const next={...state.settings,[key]:value};await state.db.setMeta('settings',next);state.settings=next;drive.settings=next;applyTheme();
  if(key==='autoSync') {if(value)scheduleSync();else clearTimeout(syncTimer);}
}
function help() {
  openModal('部署與設定說明','<div class="modal-body confirm-copy"><p>程式檔案上傳至 <strong>lihe-source/PWA-med_log-GD</strong> 的 main 分支根目錄。GitHub Settings → Pages 設定 main / (root)。</p><p>Google Cloud 啟用 Drive API 與 Picker API，建立「網頁應用程式」OAuth Client ID。</p><p>授權 JavaScript 來源：<strong>https://lihe-source.github.io</strong>（不含專案路徑）。</p><p>設定頁貼入 Client ID、Picker API Key 及專案編號；儲存後連線 Google，再選取資料夾。</p><p>API Key 網站限制加入 https://lihe-source.github.io/* 與 https://docs.google.com/*，API 限制選 Google Picker API 與 Google Drive API。</p><p>也可只設定 Client ID，連線後按「建立專用資料夾」。資料夾 ID 會自動保存。</p><p>完整步驟、OAuth 測試使用者設定與更新方式，見 ZIP 的 README.md。</p></div>',
    '<div class="modal-foot">'+button('關閉','close-modal','primary')+'</div>','help');
}
async function action(target) {
  const name=target.dataset.action;
  if(['connect','pick-folder','create-folder','test-cloud','disconnect','local-workspace','restore-cloud','list-backups','backup'].includes(name)&&(sync.busy||state.cloudRunning||state.restoring))return;
  switch(name) {
    case 'tab':saveDraft();state.tab=target.dataset.tab;render();$('#main').scrollTop=0;break;
    case 'date':if(!validDate(target.dataset.date))return;state.date=target.dataset.date;state.month=state.date.slice(0,7);render();openDay();break;
    case 'today':state.date=today();state.month=state.date.slice(0,7);render();break;
    case 'prev-month':case 'next-month':{
      const [y,m]=state.month.split('-').map(Number),next=new Date(Date.UTC(y,m-1+(name==='next-month'?1:-1),1));
      const month=next.toISOString().slice(0,7);if(month<'2000-01'||month>'2200-12')return;state.month=month;render();break;
    }
    case 'add-product':state.recordAfterProduct=state.modalKind==='product-guide';openProduct();break;
    case 'edit-product':openProduct(target.dataset.id);break;
    case 'delete-product':await deleteItem('product',target.dataset.id);break;
    case 'add-record':openRecord();break;
    case 'record-product':openRecord('',target.dataset.id);break;
    case 'edit-record':openRecord(target.dataset.id);break;
    case 'delete-record':await deleteItem('record',target.dataset.id);break;
    case 'close-modal':if(state.writing||state.restoring)return;closeModal();break;
    case 'back-day':if(state.writing||state.restoring)return;backToDay();break;
    case 'confirm-cancel':confirmResolver?.(false);confirmResolver=null;closeModal();break;
    case 'confirm-ok':confirmResolver?.(true);confirmResolver=null;closeModal();break;
    case 'add-ingredient':if($$('.ingredient-row',modal).length>=30)throw new Error('每個品項最多 30 個成分。');$('#ingredient-rows').insertAdjacentHTML('beforeend',ingredientRow());saveDraft();break;
    case 'remove-ingredient':target.closest('.ingredient-row').remove();saveDraft();break;
    case 'color':$('#p-color').value=target.dataset.color;$$('.swatch',modal).forEach(b=>b.classList.toggle('chosen',b.dataset.color===target.dataset.color));saveDraft();break;
    case 'add-intake':if($$('.intake-row',modal).length>=20)throw new Error('一次最多記錄 20 個品項。');$('#intake-rows').insertAdjacentHTML('beforeend',intakeRow());saveDraft();break;
    case 'remove-intake':if($$('.intake-row',modal).length===1)throw new Error('至少保留一個品項。');target.closest('.intake-row').remove();saveDraft();break;
    case 'connect':await connect();break;
    case 'retry-google':await prepareGoogle();render();break;
    case 'pick-folder':{
      const folder=await drive.pickFolder();if(!folder)return;
      state.cloudRunning=true;updateIndicators();
      try {await bindFolder(folder.id);}finally{state.cloudRunning=false;updateIndicators();}
      await runSync(false);break;
    }
    case 'create-folder':{
      if(!drive.connected())throw new Error('請先連線 Google。');
      state.cloudRunning=true;updateIndicators();
      try {const folder=await drive.createFolder();await bindFolder(folder.id);}finally{state.cloudRunning=false;updateIndicators();}
      await runSync(false);break;
    }
    case 'test-cloud':if(!drive.connected())throw new Error('請先連線 Google。');if(!state.settings.folderId)throw new Error('請先指定資料夾。');{
      const folder=await drive.folder(state.settings.folderId);toast('連線正常，可寫入「'+folder.name+'」。');break;
    }
    case 'disconnect':drive.disconnect();state.boundFolder='';state.cloudStatus='已中斷連線，本機資料保留。';render();break;
    case 'local-workspace':drive.disconnect();state.boundFolder='';await loadWorkspace('local');state.folderName='';state.cloudStatus='目前使用獨立本機資料；不會上傳到其他帳戶。';render();break;
    case 'sync':await runSync(false);break;
    case 'backup':await runSync(false,true);await listBackups();break;
    case 'list-backups':await listBackups();break;
    case 'restore-cloud':{
      const file=state.backups.find(b=>b.id===target.dataset.id);if(!file)throw new Error('找不到這份備份。');
      state.cloudRunning=true;updateIndicators();try{showRestore(await drive.json(file),'Google Drive');}finally{state.cloudRunning=false;updateIndicators();}break;
    }
    case 'export':download(exportData(state.model,state.settings),'MedLog-backup-'+today()+'.json');break;
    case 'safety-export':{const safety=await state.db.meta('safety:'+state.workspace);if(!safety)throw new Error('目前還沒有還原前安全備份。');download(safety,'MedLog-before-restore.json');break;}
    case 'import':$('#import-file').click();break;
    case 'restore-merge':await restore(false);break;
    case 'restore-replace':await restore(true);break;
    case 'conflicts':showConflicts();break;
    case 'resolve':{const event=state.model.events.get(target.dataset.head);if(!event)throw new Error('資料已變更，請重新查看差異。');await commit(event.entity,event.entityId,event.value,event.deleted);showConflicts();toast('已保留選取的版本。');break;}
    case 'check-update':await updater.check();break;
    case 'install':if(installPrompt){await installPrompt.prompt();installPrompt=null;}else openModal('加入主畫面','<div class="modal-body confirm-copy"><p>iPhone／iPad：使用 Safari 開啟網站，按分享按鈕，再選「加入主畫面」。</p><p>Chrome／Edge：使用網址列的安裝圖示或選單中的「安裝應用程式」。</p><p>安裝後建議在主畫面 App 中完成 Google 設定；不同瀏覽器或 Safari 與主畫面 App 的本機資料可能分開，請透過同一個 Drive 資料夾同步。</p></div>','<div class="modal-foot">'+button('關閉','close-modal','primary')+'</div>','help');break;
    case 'help':help();break;
  }
}
async function listBackups() {
  if(!drive.connected()||!state.boundFolder)throw new Error('請先連線 Google 並指定資料夾。');
  state.cloudRunning=true;updateIndicators();
  try {state.backups=await drive.list(state.boundFolder,'backup');if($('#backup-list'))$('#backup-list').innerHTML=backupRows();if(!state.backups.length)toast('此資料夾尚無 MedLog 備份。');}
  finally{state.cloudRunning=false;updateIndicators();}
}
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;
  action(target).catch(error=>{state.cloudStatus=error.message;toast(error.message,true);updateIndicators();});
});
document.addEventListener('submit',event=>{
  const form=event.target;if(!['product-form','record-form','cloud-form'].includes(form.id))return;
  event.preventDefault();
  const fn=form.id==='product-form'?saveProductForm:form.id==='record-form'?saveRecordForm:saveConfig;
  fn(form).catch(e=>toast(e.message,true));
});
document.addEventListener('input',event=>{
  if(event.target.id==='product-search'){state.productSearch=event.target.value;$('#product-results').innerHTML=productCards();}
  if(event.target.closest('#cloud-form'))state.configDraft={...state.settings,...Object.fromEntries(new FormData($('#cloud-form')))};
  if(event.target.closest('#record-form'))updateIntakePreviews();
  if(event.target.closest('#product-form')||event.target.closest('#record-form'))saveDraft();
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='month-picker'&&/^\d{4}-\d{2}$/.test(el.value)){state.month=el.value;render();}
  if(el.id==='record-filter'){state.filter=el.value;render();}
  if(el.id==='product-type'){state.productType=el.value;$('#product-results').innerHTML=productCards();}
  const preferences={'theme':['theme',el.value],'font-scale':['fontScale',Number(el.value)],'week-start':['weekStart',Number(el.value)],'auto-sync':['autoSync',el.checked]};
  if(preferences[el.id])setPreference(...preferences[el.id]).catch(e=>toast(e.message,true));
  if(el.closest('#record-form')){updateIntakePreviews();saveDraft();}
});
$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  try {if(file.size>50*1024*1024)throw new Error('備份檔案不可超過 50 MB。');showRestore(JSON.parse(await file.text()),file.name);}
  catch(error){toast(error instanceof SyntaxError?'檔案不是有效的 JSON 備份。':error.message,true);}
});
modal.addEventListener('cancel',event=>{if(state.writing||state.restoring){event.preventDefault();return;}if(state.dayFlow&&state.modalKind!=='day'){event.preventDefault();backToDay();return;}try{sessionStorage.removeItem('medlog-draft');}catch{}confirmResolver?.(false);confirmResolver=null;state.modalKind='';state.dayFlow=false;state.recordAfterProduct=false;});
modal.addEventListener('close',()=>{if(modal.open)return;confirmResolver?.(false);confirmResolver=null;state.modalKind='';state.dayFlow=false;state.recordAfterProduct=false;});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
const standaloneDisplay=window.matchMedia?.('(display-mode: standalone)');
const fullscreenDisplay=window.matchMedia?.('(display-mode: fullscreen)');
function updateDisplayMode() {
  // navigator.standalone also covers older iOS Home Screen implementations.
  document.documentElement.dataset.standalone=String(Boolean(navigator.standalone||standaloneDisplay?.matches||fullscreenDisplay?.matches));
  adjustKeyboardViewport();
}
function adjustKeyboardViewport() {
  const viewport=window.visualViewport;if(!viewport)return;
  document.documentElement.style.setProperty('--visible-height',viewport.height+'px');
  document.documentElement.style.setProperty('--dialog-height',Math.max(180,viewport.height-32)+'px');
  document.documentElement.style.setProperty('--keyboard-offset',Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop)+'px');
}
window.visualViewport?.addEventListener('resize',adjustKeyboardViewport);
window.visualViewport?.addEventListener('scroll',adjustKeyboardViewport);
standaloneDisplay?.addEventListener('change',updateDisplayMode);
fullscreenDisplay?.addEventListener('change',updateDisplayMode);
window.addEventListener('resize',updateDisplayMode);
window.addEventListener('pageshow',updateDisplayMode);
updateDisplayMode();
window.addEventListener('offline',()=>{state.cloudStatus='目前離線，本機記錄可繼續使用。';updateIndicators();});
window.addEventListener('online',()=>{prepareGoogle();updater.check(true);scheduleSync();updateIndicators();});
window.addEventListener('pagehide',saveDraft);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveDraft();else if(state.started){updater.check(true);scheduleSync();}});
window.addEventListener('storage-blocked',()=>toast('資料庫更新被其他視窗阻擋，請關閉其他 MedLog 視窗後重新開啟。',true));
async function start() {
  try {
    await state.db.open();state.settings={...defaults,...await state.db.meta('settings',{})};applyTheme();
    await loadWorkspace(await state.db.meta('workspace','local'));
    state.folderName=await state.db.meta('folderName:'+state.workspace,'');
    drive=new Drive(state.settings,()=>updateIndicators());
    sync=new Sync(drive,state.db,{
      context:()=>({workspace:state.workspace,folder:state.boundFolder,model:state.model}),
      merge:mergeEvents,status:message=>{state.cloudStatus=message;updateIndicators();},
      refresh:refreshData,finished:()=>updateIndicators(),warning:message=>toast(message,true),
      preferences:()=>state.settings
    });
    updater=new Updater({
      changed:updateIndicators,notice:toast,
      persist:value=>state.db.setMeta('update',value),
      canReload:()=>!state.writing&&!sync.busy&&!state.cloudRunning&&!state.restoring&&(!modal.open||['day','product','record'].includes(state.modalKind)),
      saveDraft
    });
    const cachedUpdate=await state.db.meta('update',{});updater.latest=cachedUpdate.latest||null;updater.checkedAt=cachedUpdate.checkedAt||null;
    let draft=null;
    try {
      if(sessionStorage.getItem('medlog-updated')) {
        const view=JSON.parse(sessionStorage.getItem('medlog-view')||'null');
        if(view&&validDate(view.date)){state.date=view.date;state.month=view.month;state.dayFlow=Boolean(view.dayFlow);if(['calendar','products','settings'].includes(view.tab))state.tab=view.tab;}
        sessionStorage.removeItem('medlog-updated');
      }
      draft=JSON.parse(sessionStorage.getItem('medlog-draft')||'null');
    } catch {}
    render();state.started=true;
    if(draft?.workspace===state.workspace) {
      state.dayFlow=Boolean(draft.dayFlow);state.recordAfterProduct=Boolean(draft.recordAfterProduct);
      if(state.dayFlow) {
        try {
          const view=JSON.parse(sessionStorage.getItem('medlog-view')||'null');
          if(view&&(!view.workspace||view.workspace===state.workspace)&&validDate(view.date)){state.date=view.date;state.month=view.date.slice(0,7);state.tab='calendar';render();}
        } catch {}
      }
      if(draft.kind==='product')openProduct(draft.id,draft.value);
      if(draft.kind==='record')openRecord(draft.id,'',draft.value);
    } else if(state.dayFlow)openDay();
    prepareGoogle();updater.start();
    if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
  } catch(error) {
    $('#main').innerHTML='<div class="panel fatal"><h1>無法開啟本機資料</h1><p>'+esc(error.message)+'</p><p>請確認瀏覽器允許網站儲存空間，並重新開啟。不要先清除網站資料。</p></div>';
    $('#global-status').textContent='本機資料尚未就緒';
  }
}
start();
