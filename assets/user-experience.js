/* HealthCheck personal EXP. Values are always supplied by the server. */
(function(){
  'use strict';
  var bar=document.getElementById('hcExpBar'),reopen=document.getElementById('hcExpReopen');
  if(!bar||!reopen)return;
  var user=null,progress=null,collapsed=true,requestId=0,toastTimer=null,historyRequestId=0;
  var names=['ทองแดง','เงิน','หยก','ทอง','แซฟไฟร์','อเมทิสต์','ทับทิม','แพลทินัม','เพชร','ตำนาน'];
  var colors=[['#b47745','#e9b784'],['#7e9aae','#e2edf4'],['#168d80','#8ff1d0'],['#c99525','#ffe59d'],['#176cc6','#9cd7ff'],['#8050bc','#d8b5ff'],['#b34462','#ffadbf'],['#5a869c','#e5faff'],['#159fae','#bdfbff'],['#a47b1f','#fff0ac']];
  function shield(level,tier,suffix){
    var color=tier<=4?['#07989e','#73f2e4']:(colors[tier-1]||colors[0]),id='hc-shield-'+suffix,metal=tier===2||tier>=8?'#c4dcea':'#f3bf45';
    var leaves='';for(var i=0;i<5;i++){var x=10-i*.8,y=44-i*6;leaves+='<ellipse cx="'+x+'" cy="'+y+'" rx="2.9" ry="5.5" transform="rotate(-38 '+x+' '+y+')"/><ellipse cx="'+(64-x)+'" cy="'+y+'" rx="2.9" ry="5.5" transform="rotate(38 '+(64-x)+' '+y+')"/>'}
    var ornament=tier>=4?'<path d="m32 2 2.1 4.5 5 .5-3.8 3.3 1.1 4.8-4.4-2.5-4.4 2.5 1.1-4.8L25 7l5-.5z" fill="url(#'+id+'-metal)"/>':'';
    var crown=tier>=8?'<path d="m21 9-2-7 7 4 6-5 6 5 7-4-2 7z" fill="url(#'+id+'-metal)" stroke="#927025" stroke-width=".7"/>':'';
    var gem=tier>=6?'<path d="m32 50 5 4-5 6-5-6z" fill="'+color[1]+'" stroke="white" stroke-width=".8"/>':'';
    return '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="'+id+'-metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff5c8"/><stop offset=".25" stop-color="'+metal+'"/><stop offset=".52" stop-color="#ad7929"/><stop offset=".74" stop-color="'+metal+'"/><stop offset="1" stop-color="#fff1ac"/></linearGradient><linearGradient id="'+id+'-face" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+color[1]+'"/><stop offset=".35" stop-color="'+color[0]+'"/><stop offset="1" stop-color="#063b50"/></linearGradient></defs><g fill="url(#'+id+'-metal)" stroke="#af8228" stroke-width=".4"><path d="M9 20c-3 17 3 28 16 34M55 20c3 17-3 28-16 34" fill="none" stroke-width="1.5"/>'+leaves+'</g>'+crown+'<path d="M32 6 51 15v18c0 12-10 20-19 26-9-6-19-14-19-26V15z" fill="url(#'+id+'-metal)" stroke="#e9c87a" stroke-width="1.4"/><path d="m32 11 14 7v15c0 9-7 15-14 20-7-5-14-11-14-20V18z" fill="url(#'+id+'-face)" stroke="#fff0b0" stroke-width="1"/><path d="m20 20 12-6 11 5-22 21z" fill="white" opacity=".12"/>'+ornament+gem+'<text x="32" y="29" text-anchor="middle" fill="#deffff" font-size="8" font-family="sans-serif" font-weight="bold">LV.</text><text x="32" y="45" text-anchor="middle" fill="white" font-size="'+(level===100?17:21)+'" font-family="sans-serif" font-weight="bold">'+level+'</text></svg>';
  }
  function visible(){return user&&!document.getElementById('loginScreen')?.classList.contains('hidden')?false:Boolean(user&&(String(user.roleId)==='admin'||progress?.collectionEnabled===true))}
  function paintWork(){
    var latest=progress?.latestAchievement,button=document.getElementById('hcExpLatest');
    document.getElementById('hcExpLatestName').textContent=latest?latest.name:'ยังไม่มีเหรียญ';button.classList.toggle('is-empty',!latest);button.title=latest?latest.name+' · +'+latest.exp+' EXP · '+new Date(latest.createdAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'ยังไม่มีผลงานที่ได้รับ EXP';
    var container=document.getElementById('hcExpWorkToday');container.replaceChildren();var items=progress?.todayBreakdown||[];
    if(!progress){container.textContent='กำลังโหลดผลงาน…';return}
    if(!items.length){container.textContent='ยังไม่มีงานที่ได้รับ EXP วันนี้';return}
    items.forEach(function(item){var row=document.createElement('p'),name=document.createElement('span'),count=document.createElement('strong');name.textContent=item.name;count.textContent=item.count+' งาน · +'+item.exp+' EXP';row.append(name,count);container.append(row)});
  }
  function resetHistory(){historyRequestId++;document.getElementById('hcExpHistory').hidden=true;document.getElementById('hcExpHistoryToggle').setAttribute('aria-expanded','false');document.getElementById('hcExpHistoryList').replaceChildren();document.getElementById('hcExpHistoryStatus').textContent=''}
  async function loadHistory(){
    if(!user)return;var ticket=++historyRequestId,target=String(user.id),status=document.getElementById('hcExpHistoryStatus'),list=document.getElementById('hcExpHistoryList');status.textContent='กำลังโหลดประวัติ…';list.replaceChildren();
    try{var response=await fetch('/api/users/me/experience/history',{cache:'no-store'});if(!response.ok)throw Error('โหลดประวัติไม่สำเร็จ กดปิดแล้วเปิดประวัติเพื่อลองใหม่');var data=await response.json();if(ticket!==historyRequestId||String(user?.id)!==target)return;
      status.textContent=data.items?.length?'แสดงล่าสุดไม่เกิน 100 รายการ':'ยังไม่มีประวัติรับ EXP';
      (data.items||[]).forEach(function(item){var row=document.createElement('li'),name=document.createElement('strong'),date=document.createElement('small'),amount=document.createElement('b');name.textContent=item.activityName||'งานที่สำเร็จ';date.textContent=new Date(item.created_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})+(item.action==='REVOKE'?' · ยกเลิก EXP':' · ได้รับ EXP');amount.textContent=(Number(item.exp_delta)>0?'+':'')+Number(item.exp_delta)+' EXP';row.classList.toggle('is-revoked',item.action==='REVOKE');row.append(name,amount,date);list.append(row)});
    }catch(error){if(ticket===historyRequestId&&String(user?.id)===target)status.textContent=error.message}
    updateBounds();
  }
  function showHistory(force){var panel=document.getElementById('hcExpHistory'),open=force===true||panel.hidden;panel.hidden=!open;document.getElementById('hcExpHistoryToggle').setAttribute('aria-expanded',String(open));if(open)loadHistory();else historyRequestId++;updateBounds()}
  document.getElementById('hcExpHistoryToggle').addEventListener('click',function(){showHistory()});document.getElementById('hcExpLatest').addEventListener('click',function(){showHistory(true)});
  function render(){
    paintWork();var show=visible();if(!show)collapsed=true;bar.hidden=!show||collapsed;reopen.hidden=!show;bar.setAttribute('aria-hidden',String(bar.hidden));reopen.setAttribute('aria-expanded',String(!bar.hidden));
    document.body.classList.remove('hc-exp-expanded');
    if(!show){document.getElementById('hcExpToast').hidden=true;return;}
    document.getElementById('hcExpShield').innerHTML=progress?shield(progress.level,progress.tier,'main'):'';document.getElementById('hcExpReopenShield').innerHTML=progress?shield(progress.level,progress.tier,'small'):'';
    document.getElementById('hcExpName').textContent=user.displayName||user.username||'';
    document.getElementById('hcExpNumbers').textContent=progress?(progress.capped?'เลเวล 100 · '+progress.totalExp.toLocaleString('th-TH')+' EXP รวม':progress.currentExp.toLocaleString('th-TH')+' / '+progress.requiredExp.toLocaleString('th-TH')+' EXP'):'กำลังโหลด EXP…';
    document.getElementById('hcExpRemaining').textContent=progress?(progress.capped?'เลเวลสูงสุด · สะสม EXP ต่อได้':'อีก '+progress.remainingExp.toLocaleString('th-TH')+' EXP ถึงเลเวล '+(progress.level+1)):'';
    document.getElementById('hcExpToday').textContent=progress?'วันนี้ '+(progress.todayActivities??progress.todayCases)+' งาน · +'+progress.todayExp.toLocaleString('th-TH')+' EXP':'';
    document.getElementById('hcExpRole').textContent=progress?.roleName||user.roleName||'ผู้ใช้งาน';
    var rules=progress?.activities||[],amounts=rules.map(r=>r.exp),low=Math.min(...amounts),high=Math.max(...amounts);document.getElementById('hcExpRuleTitle').textContent=progress?(progress.collectionEnabled?(rules.length===1?rules[0].name:'งานที่สำเร็จ'):'หยุดรับ EXP ใหม่'):'กำลังโหลดกติกา';document.getElementById('hcExpRuleValue').textContent=amounts.length?'+'+low+(low!==high?'–'+high:'')+' EXP':'';
    var meter=document.getElementById('hcExpProgress'),fill=document.getElementById('hcExpFill');
    fill.style.width=(progress?progress.percent:0)+'%';meter.setAttribute('aria-valuenow',String(progress?Math.round(progress.percent):0));meter.setAttribute('aria-valuetext',progress?'เลเวล '+progress.level+' จาก 100 · '+document.getElementById('hcExpNumbers').textContent:'กำลังโหลด');
    bar.title=progress?'โล่'+names[progress.tier-1]+' · วันนี้ '+(progress.todayActivities??progress.todayCases)+' งาน · +'+progress.todayExp+' EXP · รับ EXP ครั้งเดียวต่อกิจกรรม/งาน':'';
    document.getElementById('hcExpTier').textContent=progress?'โล่'+(names[progress.tier-1]||''):'';document.getElementById('hcExpTotal').textContent=progress?progress.totalExp.toLocaleString('th-TH')+' EXP':'—';
    reopen.setAttribute('aria-expanded',String(!bar.hidden));if(!bar.hidden)updateBounds();reopen.title='เปิด EXP'+(progress?' · เลเวล '+progress.level:'');reopen.setAttribute('aria-label','เปิดข้อมูลเลเวลและ EXP'+(progress?' · เลเวล '+progress.level:''));
  }
  async function refresh(){if(!user||document.hidden)return;var id=++requestId,target=String(user.id);try{var response=await fetch('/api/users/me/experience',{cache:'no-store'});if(!response.ok)throw new Error('โหลด EXP ไม่สำเร็จ');var data=await response.json();if(id!==requestId||String(user?.id)!==target)return;progress=data;render()}catch(_){if(id===requestId&&!progress&&user)document.getElementById('hcExpNumbers').textContent='โหลด EXP ไม่สำเร็จ';}}
  function setUser(next){if(String(next?.id||'')===String(user?.id||'')&&String(next?.roleId||'')===String(user?.roleId||'')){user=next||null;render();return}user=next||null;progress=null;requestId++;resetHistory();collapsed=true;clearTimeout(toastTimer);document.getElementById('hcExpToast').hidden=true;render();if(user)refresh()}
  function updateBounds(){if(bar.hidden)return;var v=window.visualViewport,baseX=v?.offsetLeft||0,baseY=v?.offsetTop||0,width=v?.width||innerWidth,height=v?.height||innerHeight,rect=reopen.getBoundingClientRect(),panelWidth=Math.min(380,Math.max(0,width-24)),left=Math.max(baseX+12,Math.min(rect.right-panelWidth,baseX+width-panelWidth-12)),top=Math.max(baseY+8,Math.min(rect.bottom+8,baseY+height-80));bar.style.width=panelWidth+'px';bar.style.left=left+'px';bar.style.top=top+'px';bar.style.maxHeight=Math.max(0,baseY+height-top-12)+'px'}
  function toggle(value,restoreFocus=true){if(!value)document.getElementById('hcAppearanceClose')?.click();collapsed=value;render();if(!value){document.getElementById('hcExpHide').focus({preventScroll:true});refresh()}else if(restoreFocus)reopen.focus({preventScroll:true})}
  function accept(data){if(!user||!data)return;requestId++;progress=data;render();if(!visible()||!data.award)return;
    var toast=document.getElementById('hcExpToast'),levelUp=data.level>data.previousLevel;
    toast.textContent=levelUp?'LEVEL UP! '+data.previousLevel+' → '+data.level+' · +'+data.award+' EXP':(data.award>0?'+':'')+data.award+' EXP';toast.hidden=false;
    bar.classList.toggle('hc-exp-level-up',levelUp);reopen.classList.toggle('hc-exp-level-up',levelUp);clearTimeout(toastTimer);toastTimer=setTimeout(function(){toast.hidden=true;bar.classList.remove('hc-exp-level-up');reopen.classList.remove('hc-exp-level-up')},2600);
  }
  document.getElementById('hcExpHide').addEventListener('click',function(){toggle(true)});reopen.addEventListener('click',function(event){event.stopPropagation();toggle(!collapsed)});
  document.getElementById('hcExpRefresh').addEventListener('click',function(){refresh();if(!document.getElementById('hcExpHistory').hidden)loadHistory()});
  document.getElementById('hcAppearanceToggle')?.addEventListener('click',function(){if(!bar.hidden)toggle(true,false)});
  document.addEventListener('click',function(event){if(!bar.hidden&&!bar.contains(event.target)&&!reopen.contains(event.target))toggle(true,false)});
  document.addEventListener('focusin',function(event){if(!bar.hidden&&!bar.contains(event.target)&&!reopen.contains(event.target))toggle(true,false)});
  document.addEventListener('keydown',function(event){if(event.key==='Escape'&&!bar.hidden){event.preventDefault();event.stopPropagation();toggle(true)}},true);
  window.addEventListener('resize',updateBounds);window.addEventListener('scroll',updateBounds,true);window.visualViewport?.addEventListener('resize',updateBounds);window.visualViewport?.addEventListener('scroll',updateBounds);
  document.getElementById('globalUiDensity')?.addEventListener('change',function(){requestAnimationFrame(updateBounds)});
  var login=document.getElementById('loginScreen');if(login)new MutationObserver(render).observe(login,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh()});setInterval(refresh,60000);
  window.HealthCheckExperience={setUser:setUser,refresh:refresh,accept:accept};
})();
