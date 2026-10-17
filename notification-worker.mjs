import {mergeProjections,dueGroups,taipeiNow,ID,projectionItems} from './reminder-core.js';
import {sendPush,validateSubscription,b64u,unb64} from './push-crypto.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
function settings(env){
  const missing=['DB','APP_URL','ALLOWED_ORIGINS','OAUTH_CLIENT_ID','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'].filter(k=>!env[k]);
  if(missing.length)throw fail('服務尚未設定：'+missing.join('、'),503);
  const app=new URL(env.APP_URL);if(app.protocol!=='https:'||app.username||app.password||app.search||app.hash)throw fail('APP_URL 必須是正式 HTTPS PWA 網址，且不含查詢參數。',503);
  if(!/^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(env.VAPID_SUBJECT))throw fail('VAPID_SUBJECT 請填入 mailto:實際電子郵件。',503);
  const pub=unb64(env.VAPID_PUBLIC_KEY);if(pub.length!==65||unb64(env.VAPID_PRIVATE_KEY).length!==32)throw fail('VAPID 金鑰格式錯誤。',503);
  return {app,origins:env.ALLOWED_ORIGINS.split(',').map(v=>v.trim()).filter(Boolean)};
}
async function jsonBody(request){
  if(!request.headers.get('Content-Type')?.includes('application/json'))throw fail('請使用 JSON 請求。',415);
  if(Number(request.headers.get('Content-Length')||0)>512*1024)throw fail('請求資料過大。',413);
  const reader=request.body?.getReader();if(!reader)throw fail('缺少請求內容。');let n=0,chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>512*1024){await reader.cancel();throw fail('請求資料過大。',413);}chunks.push(value);}
  const data=new Uint8Array(n);let at=0;for(const c of chunks){data.set(c,at);at+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(data));}catch{throw fail('JSON 格式錯誤。');}
}
async function rateLimit(env,id,max=60){
  const minute=Math.floor(Date.now()/60000),key=await hash(id);
  await env.DB.prepare('INSERT INTO limits(id,minute,count) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN minute=excluded.minute THEN count+1 ELSE 1 END, minute=excluded.minute').bind(key,minute).run();
  const row=await env.DB.prepare('SELECT count FROM limits WHERE id=?').bind(key).first();if(row.count>max)throw fail('操作太頻繁，請稍後再試。',429);
}
async function authenticate(request,env){
  const token=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];if(!token)throw fail('請先連結通知服務。',401);
  const device=await env.DB.prepare('SELECT * FROM devices WHERE token_hash=? AND expires_at>?').bind(await hash(token),Date.now()).first();if(!device)throw fail('裝置授權已失效，請重新連結通知服務。',401);
  await rateLimit(env,'device:'+device.token_hash,120);return device;
}
async function readEvents(env,workspace){const r=await env.DB.prepare('SELECT data FROM events WHERE workspace=?').bind(workspace).all();return r.results.map(r=>JSON.parse(r.data));}
async function summary(env,device){
  const workspace=await env.DB.prepare('SELECT * FROM workspaces WHERE id=?').bind(device.workspace).first();
  const events=await readEvents(env,device.workspace),{date}=taipeiNow();
  const plans=projectionItems(events,'plan'),active=new Set(projectionItems(events,'product').filter(p=>p.active).map(p=>p.id));
  const done=new Set(projectionItems(events,'record').filter(r=>r.date===date).map(r=>r.productId));
  return {workspaceKey:device.workspace,datasetId:workspace.dataset_id,enabled:Boolean(device.enabled),hasSubscription:Boolean(device.subscription),vapidKey:device.vapid_key||'',syncedAt:workspace.synced_at,checkedAt:workspace.checked_at,lastResult:workspace.last_result,unfinished:plans.filter(p=>p.enabled&&p.startDate<=date&&active.has(p.productId)&&!done.has(p.productId)).length};
}
async function googleRegister(body,env){
  if(typeof body.accessToken!=='string'||body.accessToken.length>4096||!ID.test(body.deviceId)||!ID.test(body.folderId))throw fail('Google 連線或資料夾設定無效。');
  const tokenResponse=await fetch('https://oauth2.googleapis.com/tokeninfo',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:'Bearer '+body.accessToken},signal:AbortSignal.timeout(15000)});
  if(!tokenResponse.ok)throw fail('Google 授權已過期，請恢復 Google 連線後重試。',401);
  const info=await tokenResponse.json();
  const client=info.azp||info.issued_to||info.aud||info.audience,audience=info.aud||info.audience;
  if(client!==env.OAUTH_CLIENT_ID||audience!==env.OAUTH_CLIENT_ID||(!Number.isFinite(Number(info.expires_in))||Number(info.expires_in)<30)||!String(info.scope||'').split(' ').includes('https://www.googleapis.com/auth/drive.file'))throw fail('Google OAuth Client ID 或授權範圍不符合通知服務設定。',403);
  const headers={Authorization:'Bearer '+body.accessToken};
  const responses=await Promise.all([fetch('https://www.googleapis.com/drive/v3/about?fields=user(permissionId)',{headers,signal:AbortSignal.timeout(15000)}),fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(body.folderId)+'?fields=id,mimeType,trashed,capabilities(canEdit)',{headers,signal:AbortSignal.timeout(15000)})]);
  if(responses.some(r=>!r.ok))throw fail('無法驗證 Google 帳戶或資料夾存取權限。',403);
  const [account,folder]=await Promise.all(responses.map(r=>r.json()));
  if(!ID.test(account.user?.permissionId)||folder.mimeType!=='application/vnd.google-apps.folder'||folder.trashed||!folder.capabilities?.canEdit)throw fail('請使用可編輯的 Drive 資料夾。',403);
  const workspaceKey=await hash('drive:'+account.user.permissionId+':'+folder.id),token=b64u(crypto.getRandomValues(new Uint8Array(32))),now=Date.now();
  // Rebinding rotates the device credential but preserves its existing subscription.
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO workspaces(id,dataset_id,created_at) VALUES(?,?,?)').bind(workspaceKey,crypto.randomUUID(),now),
    env.DB.prepare('INSERT INTO devices(workspace,device_id,token_hash,expires_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(workspace,device_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,updated_at=excluded.updated_at').bind(workspaceKey,body.deviceId,await hash(token),now+180*86400000,now)
  ]);
  return {token,workspaceKey,expires:now+180*86400000};
}
export async function handleRequest(request,env){
  let config;try{config=settings(env);}catch(e){return Response.json({ok:false,error:e.message},{status:e.status||503});}
  const origin=request.headers.get('Origin'),allowed=origin&&config.origins.includes(origin),cors=allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'600',Vary:'Origin'}:{};
  const reply=(data,status=200)=>Response.json(data,{status,headers:{...cors,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers:cors});
  const path=new URL(request.url).pathname;
  if(request.method==='GET'&&(path==='/'||path==='/health')){
    try{const schema=await env.DB.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('workspaces','devices','events','deliveries','limits')").first();if(schema.n!==5)throw new Error('schema');return reply({ok:true,service:'MedLog Daily Reminder',version:'1.4.0',configured:true,schemaInitialized:true});}
    catch{return reply({ok:false,error:'資料庫尚未初始化，請在綁定的 D1 執行 notification-schema.sql。'},503);}
  }
  if(!allowed)return reply({ok:false,error:'網站來源不在 ALLOWED_ORIGINS 內。'},403);
  try{
    if(request.method==='GET'&&path==='/config')return reply({ok:true,appUrl:config.app.href,publicKey:env.VAPID_PUBLIC_KEY,clientId:env.OAUTH_CLIENT_ID});
    if(request.method==='POST'&&path==='/register'){
      await rateLimit(env,'register:'+(request.headers.get('CF-Connecting-IP')||'unknown'),20);
      return reply({ok:true,...await googleRegister(await jsonBody(request),env)});
    }
    const device=await authenticate(request,env);
    if(request.method==='GET'&&path==='/status')return reply({ok:true,...await summary(env,device)});
    if(request.method!=='POST')throw fail('不存在的路徑。',404);
    const body=await jsonBody(request);
    if(path==='/sync'){
      if(!Array.isArray(body.events)||body.events.length>100)throw fail('一次最多同步 100 筆提醒修訂。');
      const existing=await readEvents(env,device.workspace);if(existing.length+body.events.length>100100)throw fail('提醒歷史資料已超過上限。',413);
      const merged=mergeProjections(existing,body.events),known=new Set(existing.map(e=>e.id)),add=merged.filter(e=>!known.has(e.id));
      if(add.length)await env.DB.batch(add.map(e=>env.DB.prepare('INSERT INTO events(workspace,event_id,entity,entity_id,data) VALUES(?,?,?,?,?) ON CONFLICT(workspace,event_id) DO UPDATE SET data=CASE WHEN data=excluded.data THEN data ELSE NULL END').bind(device.workspace,e.id,e.entity,e.entityId,JSON.stringify(e))));
      await env.DB.prepare('UPDATE workspaces SET synced_at=? WHERE id=?').bind(Date.now(),device.workspace).run();
      return reply({ok:true,accepted:body.events.map(e=>e.id)});
    }
    if(path==='/subscription'){
      let subscription=null,endpointHash=null;
      if(body.enabled){subscription=validateSubscription(body.subscription);if(body.publicKey!==env.VAPID_PUBLIC_KEY)throw fail('推播公鑰已更新，請重新啟用通知。',409);endpointHash=await hash(subscription.endpoint);}
      const statements=[];
      if(endpointHash)statements.push(env.DB.prepare('UPDATE devices SET enabled=0,subscription=NULL,endpoint_hash=NULL WHERE endpoint_hash=? AND NOT(workspace=? AND device_id=?)').bind(endpointHash,device.workspace,device.device_id));
      statements.push(env.DB.prepare('UPDATE devices SET subscription=?,endpoint_hash=?,enabled=?,vapid_key=?,updated_at=? WHERE workspace=? AND device_id=?').bind(subscription?JSON.stringify(subscription):null,endpointHash,body.enabled?1:0,body.enabled?env.VAPID_PUBLIC_KEY:null,Date.now(),device.workspace,device.device_id));
      await env.DB.batch(statements);return reply({ok:true,enabled:Boolean(body.enabled)});
    }
    if(path==='/test'){
      if(!device.enabled||!device.subscription)throw fail('請先啟用本機通知。');
      if(device.last_test&&Date.now()-device.last_test<10000)throw fail('請等待 10 秒再測試。',429);
      await env.DB.prepare('UPDATE devices SET last_test=? WHERE workspace=? AND device_id=?').bind(Date.now(),device.workspace,device.device_id).run();
      const response=await sendPush(JSON.parse(device.subscription),{type:'test',date:taipeiNow().date,workspaceKey:device.workspace,count:0,tag:'medlog-test',title:'MedLog 測試通知',body:'通知服務已連線，點此開啟當日記錄。'},env,120);
      if(!response.ok){await invalidateIfGone(response,env,device);throw fail('推播服務回應 HTTP '+response.status+'；請檢查公私鑰、Subject 與裝置訂閱。',502);}
      return reply({ok:true,message:'推播服務已接受，請確認裝置是否顯示；這不代表排程已完成驗證。'});
    }
    if(path==='/revoke'){
      await env.DB.prepare('DELETE FROM devices WHERE workspace=? AND device_id=?').bind(device.workspace,device.device_id).run();return reply({ok:true});
    }
    throw fail('不存在的路徑。',404);
  }catch(e){return reply({ok:false,error:e.status?e.message:e.message?.startsWith('D1')?'資料庫尚未初始化，請先執行 notification-schema.sql。':e.name==='TimeoutError'?'外部服務逾時，請稍後重試。':e.message||'通知服務暫時無法使用。'},e.status||400);}
}
async function invalidateIfGone(response,env,device){if([404,410].includes(response.status))await env.DB.prepare('UPDATE devices SET enabled=0,subscription=NULL,endpoint_hash=NULL WHERE workspace=? AND device_id=?').bind(device.workspace,device.device_id).run();}
export async function runScheduled(env,now=Date.now()){
  settings(env);
  const workspaces=await env.DB.prepare('SELECT id FROM workspaces').all();
  for(const {id:workspace} of workspaces.results){
    let result='沒有到期且尚未記錄的品項';
    try{
      const events=await readEvents(env,workspace),groups=dueGroups(events,now);
      const devices=await env.DB.prepare('SELECT * FROM devices WHERE workspace=? AND enabled=1 AND subscription IS NOT NULL AND expires_at>?').bind(workspace,now).all();
      if(groups.length&&!devices.results.length)result='有未記錄品項，但沒有已啟用的通知裝置';
      for(const group of groups)for(const device of devices.results){
        if(device.vapid_key!==env.VAPID_PUBLIC_KEY){result='推播公鑰已變更，裝置需重新啟用';continue;}
        const params=[workspace,device.device_id,group.date,group.time],claim=crypto.randomUUID();
        // Atomic claim prevents overlapping Cron invocations from sending the same delivery.
        await env.DB.prepare('INSERT OR IGNORE INTO deliveries(workspace,device_id,day,at_time,state,updated_at) VALUES(?,?,?,?,?,?)').bind(...params,'pending',now).run();
        const lease=await env.DB.prepare("UPDATE deliveries SET state=?,attempts=attempts+1,lease_until=?,updated_at=? WHERE workspace=? AND device_id=? AND day=? AND at_time=? AND (state IN ('pending','retry') OR lease_until>0 AND lease_until<=?) AND attempts<3 AND lease_until<=? AND next_attempt<=?").bind(claim,now+60000,now,...params,now,now,now).run();
        if(!lease.meta.changes){result='本時段已處理或等待重試';continue;}
        try{
          // Re-read immediately before send, including edits from another device.
          const fresh=dueGroups(await readEvents(env,workspace),now).find(g=>g.time===group.time);
          if(!fresh){await env.DB.prepare('UPDATE deliveries SET state=?,updated_at=? WHERE workspace=? AND device_id=? AND day=? AND at_time=? AND state=?').bind('cancelled',now,...params,claim).run();continue;}
          const tag='ml-'+(await hash(workspace+group.date+group.time)).slice(0,24);
          const endOfDay=Date.parse(group.date+'T23:59:59+08:00'),ttl=Math.max(0,Math.floor(Math.min(900000,endOfDay-now)/1000));
          const response=await sendPush(JSON.parse(device.subscription),{type:'daily-reminder',date:group.date,time:group.time,workspaceKey:workspace,count:fresh.count,tag,title:'MedLog 每日記錄提醒',body:'今天還有 '+fresh.count+' 項每日品項尚未記錄，點此查看。'},env,ttl);
          await invalidateIfGone(response,env,device);
          const retry=response.status===429||response.status>=500;
          await env.DB.prepare('UPDATE deliveries SET state=?,lease_until=0,next_attempt=?,last_http=?,updated_at=? WHERE workspace=? AND device_id=? AND day=? AND at_time=? AND state=?').bind(response.ok?'sent':retry?'retry':'failed',now+60000,response.status,now,...params,claim).run();
          result=response.ok?'推播服務已接受本時段提醒':'推播 HTTP '+response.status+(retry?'，稍後重試':'，請檢查通知設定');
        }catch{
          // An uncertain network response may have been accepted. Same tag/topic coalesces retries.
          await env.DB.prepare('UPDATE deliveries SET state=?,lease_until=0,next_attempt=?,updated_at=? WHERE workspace=? AND device_id=? AND day=? AND at_time=? AND state=?').bind('retry',now+60000,now,...params,claim).run();result='推播連線失敗，稍後重試';
        }
      }
    }catch{result='排程處理失敗，請檢查資料庫與服務設定';}
    await env.DB.prepare('UPDATE workspaces SET checked_at=?,last_result=? WHERE id=?').bind(now,result,workspace).run();
  }
  await env.DB.batch([env.DB.prepare('DELETE FROM limits WHERE minute<?').bind(Math.floor(now/60000)-60),env.DB.prepare('DELETE FROM deliveries WHERE updated_at<?').bind(now-35*86400000)]);
}
export default {fetch:handleRequest,scheduled(controller,env,ctx){ctx.waitUntil(runScheduled(env,controller.scheduledTime));}};
