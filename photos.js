import {MAX_PHOTO_BYTES,cleanPhoto,uid} from './model.js';

export function fitPhoto(width,height,limit=1600) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('無法讀取照片尺寸。');
  const scale=Math.min(1,limit/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
async function decode(file) {
  if(typeof createImageBitmap==='function') {
    try {
      const bitmap=await new Promise((resolve,reject)=>{
        let done=false;
        const timer=setTimeout(()=>{done=true;reject(new Error('照片解碼逾時。'));},20000);
        createImageBitmap(file,{imageOrientation:'from-image'}).then(value=>{
          if(done){value.close();return;}done=true;clearTimeout(timer);resolve(value);
        },error=>{if(done)return;done=true;clearTimeout(timer);reject(error);});
      });
      return {image:bitmap,release:()=>bitmap.close()};
    } catch {}
  }
  const url=URL.createObjectURL(file),img=new Image();
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('照片讀取逾時。')),20000);
      img.onload=()=>{clearTimeout(timer);resolve();};
      img.onerror=()=>{clearTimeout(timer);reject(new Error('此照片無法讀取，請改用 JPG、PNG 或重新拍攝。'));};
      img.src=url;
    });
    return {image:img,release:()=>{img.src='';URL.revokeObjectURL(url);}};
  } catch(error){URL.revokeObjectURL(url);throw error;}
}
const encode=(canvas,quality)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('照片壓縮逾時，請改用較小的照片。')),15000);
  canvas.toBlob(blob=>{clearTimeout(timer);blob?resolve(blob):reject(new Error('照片壓縮失敗，請重新選取。'));},'image/jpeg',quality);
});
const dataURL=blob=>new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('無法讀取壓縮後的照片。'));reader.readAsDataURL(blob);
});
export async function preparePhoto(file) {
  if(!file||file.size<=0||file.size>25*1024*1024)throw new Error('請選擇 25 MB 以內的照片。');
  if(file.type&&!file.type.startsWith('image/'))throw new Error('請選擇圖片檔案。');
  if(file.type==='image/svg+xml'||/\.svg$/i.test(file.name))throw new Error('請選擇拍攝的照片或 JPG、PNG、WebP 圖片。');
  const decoded=await decode(file),canvas=document.createElement('canvas');
  try {
    const width=decoded.image.naturalWidth||decoded.image.width,height=decoded.image.naturalHeight||decoded.image.height;
    if(width*height>64000000)throw new Error('照片尺寸過大，請先裁切後再選取。');
    let limit=1600,blob;
    for(let step=0;step<5;step++,limit=Math.round(limit*.8)) {
      const size=fitPhoto(width,height,limit);canvas.width=size.width;canvas.height=size.height;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('此瀏覽器無法處理照片。');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(decoded.image,0,0,canvas.width,canvas.height);
      for(const quality of [.84,.72,.6]) {
        blob=await encode(canvas,quality);if(blob.size<=MAX_PHOTO_BYTES)break;
      }
      if(blob.size<=MAX_PHOTO_BYTES)break;
    }
    if(!blob||blob.size>MAX_PHOTO_BYTES)throw new Error('照片仍然過大，請裁切包裝或標籤後重試。');
    const photo=cleanPhoto({dataUrl:await dataURL(blob),width:canvas.width,height:canvas.height,name:(file.name||'外觀照片').slice(0,100)});
    return {id:uid(),...photo};
  } finally{decoded.release();canvas.width=0;canvas.height=0;}
}
