// Only measured window/visual-viewport dimensions are used. Screen and 100vh
// can extend underneath the system overlay in iOS Home Screen mode.
export function visibleFrame({height,offsetTop=0,scale=1},layoutHeight) {
  const layout=Number.isFinite(layoutHeight)&&layoutHeight>0?layoutHeight:height;
  if(!Number.isFinite(layout)||layout<=0)return null;
  if(scale>1.05)return null; // Preserve normal page magnification.
  const top=Math.max(0,Math.min(Number(offsetTop)||0,layout-1));
  const available=layout-top;
  const visible=Number.isFinite(height)&&height>0?Math.min(height,available):available;
  return {top,height:Math.floor(visible),keyboard:layout-visible-top>120};
}
export function installViewport(win=window,doc=document) {
  const update=()=>{
    const v=win.visualViewport;
    const frame=visibleFrame(v?{height:v.height,offsetTop:v.offsetTop,scale:v.scale}:{height:win.innerHeight},win.innerHeight);
    if(!frame)return;
    const root=doc.documentElement;
    root.style.setProperty('--app-height',frame.height+'px');
    root.style.setProperty('--app-top',frame.top+'px');
    root.style.setProperty('--visible-height',frame.height+'px');
    root.style.setProperty('--dialog-height',Math.max(100,frame.height-24)+'px');
    root.style.setProperty('--keyboard-offset',Math.max(0,(win.innerHeight||frame.height)-frame.height-frame.top)+'px');
    root.dataset.keyboard=String(frame.keyboard);
  };
  const schedule=()=>{update();};
  win.visualViewport?.addEventListener('resize',schedule);
  win.visualViewport?.addEventListener('scroll',schedule);
  win.addEventListener('resize',schedule);
  win.addEventListener('pageshow',schedule);
  win.addEventListener('orientationchange',()=>{update();win.setTimeout(update,200);});
  doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='visible')update();});
  update();
  return update;
}
