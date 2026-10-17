// Run locally: node notification-keygen.mjs. No network, no saved credentials.
const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',keys.privateKey);
const publicKey=Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('base64url');
console.log(JSON.stringify({VAPID_PUBLIC_KEY:publicKey,VAPID_PRIVATE_KEY:jwk.d},null,2));
