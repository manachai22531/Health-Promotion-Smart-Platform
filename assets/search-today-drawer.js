(()=>{'use strict';const root=document.getElementById('searchView'),rail=root?.querySelector('.search-side-stack'),panel=rail?.querySelector('.today-registration-panel');if(!root||!panel)return;
 const drawer=document.getElementById('searchTodayDrawer'),toggle=document.getElementById('searchTodayToggle');drawer.querySelector('.search-today-body').append(panel);rail.remove();
 todayRegistrationItems=function(){const day=HealthCheckEmrBook.dateKey();return (state.records||[]).map(record=>({record,status:'confirmed',at:record.checkupConfirmedAt||record.visitedAt})).filter(item=>item.at&&HealthCheckEmrBook.dateKey(item.at)===day).sort((a,b)=>new Date(b.at)-new Date(a.at))};
 const count=document.getElementById('todayCaseConfirmed'),update=()=>document.getElementById('searchTodayCount').textContent=count.textContent;new MutationObserver(update).observe(count,{childList:true,characterData:true,subtree:true});update();
 let returnFocus=null;
 function restore(){root.inert=false;if(returnFocus?.isConnected)returnFocus.focus();returnFocus=null}
 toggle.onclick=()=>{returnFocus=toggle;root.inert=true;toggle.setAttribute('aria-expanded','true');open('searchTodayDrawer');document.getElementById('searchTodayClose').focus()};
 drawer.addEventListener('click',event=>{if(event.target===drawer||event.target.closest('[data-close="searchTodayDrawer"]'))close('searchTodayDrawer')});
 drawer.addEventListener('click',event=>{if(event.target.closest('[data-open-today-case]'))close('searchTodayDrawer')},true);
 drawer.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close('searchTodayDrawer')}if(event.key==='Tab'){const items=[...drawer.querySelectorAll('button:not([disabled]),a[href]')].filter(el=>el.getClientRects().length),first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});
 new MutationObserver(()=>{if(!drawer.classList.contains('open')){toggle.setAttribute('aria-expanded','false');restore()}}).observe(drawer,{attributes:true,attributeFilter:['class']});
})();
