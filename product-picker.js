import {esc,colorText} from './model.js';
import {availableProducts} from './reminder-core.js';
export function pickerMarkup(id,name='選擇品項') {
  return '<div class="product-picker"><input type="hidden" data-intake="product" value="'+esc(id)+'"><button type="button" class="picker-trigger" data-picker-open aria-haspopup="listbox" aria-expanded="false"><span>'+esc(name)+'</span><span aria-hidden="true">⌄</span></button><div class="picker-panel" hidden><label class="picker-search-label"><span class="visually-hidden">搜尋藥品</span><input class="picker-search" type="search" placeholder="搜尋名稱或品牌" autocomplete="off"></label><div class="picker-list" role="listbox" aria-label="品項"></div><button type="button" class="picker-repeat" data-picker-repeat>再次記錄已服用品項</button><p class="picker-help" role="status"></p></div></div>';
}
export function bindPickers(form,hooks) {
  let listId=0;
  const original=()=>hooks.original?.();
  function populate(picker){
    const row=picker.closest('.intake-row'),input=picker.querySelector('[data-intake=product]'),currentId=input.value;
    const items=hooks.products(),records=hooks.records(),orig=original(),date=form.elements.date.value;
    const selected=[...form.querySelectorAll('[data-intake=product]')].filter(el=>el!==input).map(el=>el.value).filter(Boolean);
    const values=availableProducts(items,records,{date,originalId:orig?.id||'',currentId,selected,repeat:picker.dataset.repeat==='true'});
    if(orig&&orig.productId===currentId&&!values.some(p=>p.id===currentId))values.unshift({id:currentId,...orig.snapshot,active:false});
    const query=picker.querySelector('.picker-search').value.trim().toLocaleLowerCase();
    const filtered=values.filter(p=>(p.name+' '+(p.brand||'')).toLocaleLowerCase().includes(query));
    const list=picker.querySelector('.picker-list');if(!list.id)list.id='product-options-'+(++listId)+'-'+Math.random().toString(36).slice(2);
    picker.querySelector('.picker-trigger').setAttribute('aria-controls',list.id);
    list.innerHTML=filtered.map(p=>'<button type="button" role="option" aria-selected="'+String(p.id===currentId)+'" data-picker-value="'+esc(p.id)+'" style="background:'+p.color+';color:'+colorText(p.color)+'">'+esc(p.name)+(p.active?'':'（停用／歷史品項）')+'</button>').join('');
    picker.querySelector('.picker-help').textContent=filtered.length?'':query?'沒有符合的品項。':'當天所有啟用品項皆已記錄，或已在其他列選取。';
    picker.querySelector('[data-picker-repeat]').textContent=picker.dataset.repeat==='true'?'只顯示當天尚未記錄品項':'再次記錄已服用品項';
    const p=items.find(p=>p.id===currentId)||orig?.productId===currentId&&orig.snapshot;
    const trigger=picker.querySelector('.picker-trigger');trigger.querySelector('span').textContent=p?p.name:'選擇品項';
    trigger.style.background=p?p.color:'';trigger.style.color=p?colorText(p.color):'';
    row.dataset.validProduct=String(Boolean(p));
  }
  function close(picker,focus=false){picker.querySelector('.picker-panel').hidden=true;picker.querySelector('.picker-trigger').setAttribute('aria-expanded','false');if(focus)picker.querySelector('.picker-trigger').focus({preventScroll:true});}
  function refresh(){form.querySelectorAll('.product-picker').forEach(populate);}
  form.addEventListener('click',e=>{
    const picker=e.target.closest('.product-picker');if(!picker)return;
    if(e.target.closest('[data-picker-open]')){const panel=picker.querySelector('.picker-panel'),open=panel.hidden;form.querySelectorAll('.product-picker').forEach(p=>close(p));if(open){populate(picker);panel.hidden=false;picker.querySelector('.picker-trigger').setAttribute('aria-expanded','true');}return;}
    const option=e.target.closest('[data-picker-value]');if(option){picker.querySelector('[data-intake=product]').value=option.dataset.pickerValue;close(picker,true);refresh();hooks.changed();return;}
    if(e.target.closest('[data-picker-repeat]')){picker.dataset.repeat=String(picker.dataset.repeat!=='true');populate(picker);}
  });
  form.addEventListener('input',e=>{if(e.target.matches('.picker-search'))populate(e.target.closest('.product-picker'));});
  form.addEventListener('change',e=>{if(e.target.name==='date'){
    const date=e.target.value,orig=original();
    form.querySelectorAll('.product-picker').forEach(p=>{
      const input=p.querySelector('[data-intake=product]'),repeated=hooks.records().some(r=>r.date===date&&r.id!==orig?.id&&r.productId===input.value);
      if(repeated&&input.value!==orig?.productId&&p.dataset.repeat!=='true')input.value='';
    });refresh();hooks.changed();
  }});
  form.addEventListener('keydown',e=>{const p=e.target.closest('.product-picker');if(!p)return;
    if(e.key==='Escape'&&!p.querySelector('.picker-panel').hidden){e.preventDefault();e.stopPropagation();close(p,true);}
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)&&!p.querySelector('.picker-panel').hidden){const options=[...p.querySelectorAll('[role=option]')];if(!options.length)return;e.preventDefault();let i=options.indexOf(document.activeElement);i=e.key==='Home'?0:e.key==='End'?options.length-1:e.key==='ArrowDown'?(i+1)%options.length:(i-1+options.length)%options.length;options[i].focus();}
  });refresh();return refresh;
}
