/* Web Push RFC 8291 aes128gcm + RFC 8292 VAPID, using standard Web Crypto only. */
const encoder=new TextEncoder();
export const bytes=s=>encoder.encode(s);
export function concat(...arrays){const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let at=0;for(const a of arrays){out.set(a,at);at+=a.length;}return out;}
export function b64u(data){let s='';for(const b of new Uint8Array(data))s+=String.fromCharCode(b);return btoa(s).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
export function unb64(s){if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s))throw new Error('推播金鑰格式無效。');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));}
async function hmac(key,data){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,data));}
const expand=(prk,info,n)=>hmac(prk,concat(info,new Uint8Array([1]))).then(b=>b.slice(0,n));
export function validateSubscription(s){
  let u;try{u=new URL(s.endpoint);}catch{throw new Error('推播端點格式無效。');}
  const h=u.hostname,allowed=h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h==='web.push.apple.com'||h.endsWith('.push.apple.com')||h.endsWith('.notify.windows.com');
  if(u.protocol!=='https:'||u.port&&u.port!=='443'||u.username||u.password||!allowed||s.endpoint.length>2048)throw new Error('不支援此推播服務端點。');
  const pub=unb64(s.keys?.p256dh),auth=unb64(s.keys?.auth);if(pub.length!==65||pub[0]!==4||auth.length!==16)throw new Error('推播訂閱金鑰格式無效。');
  return {endpoint:u.href,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};
}
export async function encryptPush(subscription,payload,{serverKeys,salt}={}){
  const ua=unb64(subscription.keys.p256dh),auth=unb64(subscription.keys.auth);
  const plain=bytes(typeof payload==='string'?payload:JSON.stringify(payload));if(plain.length>3000)throw new Error('通知內容過長。');
  const keys=serverKeys||await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const serverPublic=new Uint8Array(await crypto.subtle.exportKey('raw',keys.publicKey));
  const peer=await crypto.subtle.importKey('raw',ua,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:peer},keys.privateKey,256));
  const authPrk=await hmac(auth,shared),ikm=await expand(authPrk,concat(bytes('WebPush: info\0'),ua,serverPublic),32);
  salt=salt||crypto.getRandomValues(new Uint8Array(16));
  const prk=await hmac(salt,ikm),key=await expand(prk,bytes('Content-Encoding: aes128gcm\0'),16),nonce=await expand(prk,bytes('Content-Encoding: nonce\0'),12);
  const aes=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,tagLength:128},aes,concat(plain,new Uint8Array([2]))));
  const header=new Uint8Array(5);new DataView(header.buffer).setUint32(0,4096);header[4]=65;
  return concat(salt,header,serverPublic,cipher);
}
export async function vapidAuthorization(endpoint,publicKey,privateKey,subject,now=Date.now()) {
  if(!/^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(subject||''))throw new Error('請設定有效的 VAPID_SUBJECT（mailto:電子郵件）。');
  const pub=unb64(publicKey),priv=unb64(privateKey);if(pub.length!==65||pub[0]!==4||priv.length!==32)throw new Error('VAPID 公私鑰長度不正確。');
  const key=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:b64u(pub.slice(1,33)),y:b64u(pub.slice(33)),d:b64u(priv),ext:true},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const header=b64u(bytes(JSON.stringify({typ:'JWT',alg:'ES256'}))),claims=b64u(bytes(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(now/1000)+12*3600,sub:subject})));
  const input=header+'.'+claims,signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,bytes(input));
  return 'vapid t='+input+'.'+b64u(signature)+', k='+publicKey;
}
export async function sendPush(subscription,payload,env,ttl=900){
  validateSubscription(subscription);
  const body=await encryptPush(subscription,payload),authorization=await vapidAuthorization(subscription.endpoint,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY,env.VAPID_SUBJECT);
  return fetch(subscription.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:authorization,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:String(Math.max(0,Math.min(900,ttl))),Urgency:'normal',Topic:payload.tag.replace(/[^A-Za-z0-9_-]/g,'').slice(0,32)},body});
}
