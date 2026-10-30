/* Shared dismiss styling, including dialogs rendered after page load. */
(()=>{'use strict';
  const selector='button,input[type="button"],input[type="reset"]';
  function isDismiss(button){
    if(button.hasAttribute('data-dismiss-style'))return button.getAttribute('data-dismiss-style')!=='off';
    if(button.matches('[role="switch"],[aria-pressed],.hc-setting-toggle'))return false;
    const labels=[button.getAttribute('aria-label'),button.getAttribute('title'),button.tagName==='INPUT'?button.value:button.textContent].filter(Boolean).map(s=>s.replace(/\s+/g,' ').trim());
    if(labels.some(s=>/^(?:Charge\s*Close|ปิดใช้งาน|ปิดบัญชี|เปิด\s*\/\s*ปิด)/i.test(s)))return false;
    if(button.hasAttribute('data-close')||button.hasAttribute('data-dismiss')||button.type==='reset')return true;
    return labels.some(s=>/^(?:[✕×✖]\s*)?(?:ปิด(?:$|หน้าต่าง|หน้าจอ|เมนู|แผง)|ยกเลิก|close(?:\s+(?:window|dialog|panel))?$|cancel(?:\s*(?:order|visit))?$)/i.test(s))||
      [...button.classList].some(name=>/^(?:modal-close|dialog-close|close-button|cancel-button|.*-close-button)$/.test(name))||(/^[×✕✖x]$/i.test(button.textContent.trim())&&/close/i.test(button.id));
  }
  function apply(button){
    const dismiss=isDismiss(button);button.classList.toggle('hc-dismiss-action',dismiss);
    if(dismiss&&button.hasAttribute('data-close')&&!button.hasAttribute('aria-label')&&/^[×✕✖x]$/i.test(button.textContent.trim()))button.setAttribute('aria-label','ปิดหน้าต่าง');
  }
  const pending=new Set();let scheduled=false;
  function collect(node){
    const el=node.nodeType===Node.ELEMENT_NODE?node:node.parentElement;if(!el)return;
    if(el.matches(selector))pending.add(el);
    const owner=el.closest(selector);if(owner)pending.add(owner);
    el.querySelectorAll(selector).forEach(button=>pending.add(button));
    if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;const buttons=[...pending];pending.clear();buttons.forEach(apply)})}
  }
  document.querySelectorAll(selector).forEach(apply);
  new MutationObserver(records=>{for(const record of records){if(record.type==='childList'){for(const node of record.addedNodes)collect(node);const button=record.target.nodeType===Node.ELEMENT_NODE?record.target.closest(selector):null;if(button)collect(button)}else collect(record.target)}}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','data-close','data-dismiss','data-dismiss-style','value','type','role','aria-pressed']});
})();
