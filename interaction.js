// Lock browser page zoom on touch devices, while allowing ordinary scrolling
// and the photo viewer’s explicit fit/original-size controls.
export function installZoomLock(win=window,doc=document) {
  const touch=()=>Boolean(win.matchMedia?.('(any-pointer: coarse)').matches||win.navigator?.maxTouchPoints>0);
  const gesture=event=>{if(touch()&&event.cancelable)event.preventDefault();};
  const double=event=>{
    if(!touch()||!event.cancelable)return;
    // Keep text selection/editing available; CSS and viewport metadata stop zoom.
    if(event.target?.closest?.('input,textarea,[contenteditable=true]'))return;
    event.preventDefault();
  };
  doc.addEventListener('gesturestart',gesture,{passive:false});
  doc.addEventListener('gesturechange',gesture,{passive:false});
  doc.addEventListener('dblclick',double,{passive:false});
  return ()=>{doc.removeEventListener('gesturestart',gesture);doc.removeEventListener('gesturechange',gesture);doc.removeEventListener('dblclick',double);};
}
