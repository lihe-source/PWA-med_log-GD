// The document owns the app height. Home Screen mode uses CSS 100vh;
// browser windows use 100dvh. Only an open keyboard overrides that height.
// iOS can under-report innerHeight/visualViewport by the status-bar inset.
export function visibleFrame({height,offsetTop=0,scale=1},layoutHeight) {
  const layout=Number.isFinite(layoutHeight)&&layoutHeight>0?layoutHeight:height;
  if(!Number.isFinite(layout)||layout<=0)return null;
  if(scale>1.05)return null; // Preserve normal page magnification.
  const top=Math.max(0,Math.min(Number(offsetTop)||0,layout-1));
  const available=layout-top;
  const visible=Number.isFinite(height)&&height>0?Math.min(height,available):available;
  return {top,height:Math.floor(visible),keyboard:layout-visible-top>120};
}

export function pageFrame(viewport,cssHeight,editable=false) {
  const frame=visibleFrame(viewport,cssHeight);
  if(!frame)return null;
  const base=Number.isFinite(cssHeight)&&cssHeight>0?cssHeight:frame.height;
  // Stale visualViewport values and hardware-keyboard focus must not
  // collapse the app or permanently hide its navigation.
  const keyboard=Boolean(editable&&frame.keyboard);
  return keyboard?{...frame,keyboard:true}:{top:0,height:Math.floor(base),keyboard:false};
}

function editing(element) {
  if(!element||element.disabled||element.readOnly)return false;
  if(element.isContentEditable)return true;
  if(['TEXTAREA','SELECT'].includes(element.tagName))return true;
  return element.tagName==='INPUT'&&!['button','submit','reset','file','checkbox','radio','range','color','hidden'].includes(element.type);
}

export function installViewport(win=window,doc=document) {
  const root=doc.documentElement;
  const standalone=win.matchMedia?.('(display-mode: standalone)');
  const fullscreen=win.matchMedia?.('(display-mode: fullscreen)');
  let pending=false,settleTimer;
  const update=()=>{
    pending=false;
    root.dataset.standalone=String(Boolean(win.navigator?.standalone||standalone?.matches||fullscreen?.matches));
    const v=win.visualViewport;
    const viewport=v?{height:v.height,offsetTop:v.offsetTop,scale:v.scale}:{height:win.innerHeight};
    // This probe is independent of --app-height: keyboard resizing cannot
    // feed back into the resting height. CSS units also fit iPad windows.
    const cssHeight=doc.getElementById('viewport-probe')?.getBoundingClientRect().height||root.clientHeight||win.innerHeight;
    const frame=pageFrame(viewport,cssHeight,editing(doc.activeElement));
    if(!frame)return; // Preserve normal pinch-to-zoom and panning.
    root.dataset.keyboard=String(frame.keyboard);
    if(frame.keyboard) {
      root.style.setProperty('--app-height',frame.height+'px');
      root.style.setProperty('--app-top',frame.top+'px');
    } else {
      root.style.removeProperty('--app-height');
      root.style.removeProperty('--app-top');
    }
    // Native dialogs stay inside the reported fixed-position viewport.
    const overlay=visibleFrame(viewport,win.innerHeight)||frame;
    root.style.setProperty('--overlay-top',overlay.top+'px');
    root.style.setProperty('--visible-height',overlay.height+'px');
    root.style.setProperty('--dialog-height',Math.max(100,overlay.height-24)+'px');
    root.style.setProperty('--keyboard-offset',Math.max(0,(win.innerHeight||overlay.height)-overlay.height-overlay.top)+'px');
    // Main and dialog bodies own scrolling; reset only accidental document
    // scroll from iOS focus, leaving those independent scroll positions alone.
    if((win.scrollX||win.scrollY)&&typeof win.scrollTo==='function')win.scrollTo(0,0);
  };
  const schedule=()=>{
    if(pending)return;
    pending=true;
    if(win.requestAnimationFrame)win.requestAnimationFrame(update);else update();
  };
  const settle=()=>{
    schedule();
    win.clearTimeout?.(settleTimer);
    settleTimer=win.setTimeout(schedule,350);
  };
  win.visualViewport?.addEventListener('resize',schedule);
  win.visualViewport?.addEventListener('scroll',schedule);
  win.addEventListener('resize',schedule);
  win.addEventListener('pageshow',settle);
  win.addEventListener('orientationchange',settle);
  standalone?.addEventListener('change',settle);
  fullscreen?.addEventListener('change',settle);
  doc.addEventListener('focusin',settle);
  doc.addEventListener('focusout',settle);
  doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='visible')settle();});
  update();
  return update;
}
