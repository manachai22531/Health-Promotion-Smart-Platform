/* v7.64.13 source fix: keep company lookup together in one accessible popover. */
(()=>{'use strict';
  const root=document.querySelector('#searchView.hc-search-one-row');
  const toggle=document.getElementById('companyQuickLookupToggle');
  const heading=root?.querySelector('.hc-search-heading');
  const label=document.querySelector('#searchView .search-secondary-row-v76405>label[for="companyQuickLookup"]');
  const action=document.getElementById('openCompanyQuickLookup');
  if(!root||!toggle||!heading||!label||!action)return;
  const popover=document.createElement('div');
  popover.className='hc-company-lookup-popover';
  popover.id='hcCompanyLookupPopover';
  popover.hidden=true;
  popover.setAttribute('role','group');
  popover.setAttribute('aria-label','ค้นหาข้อมูลบริษัท');
  popover.append(label,action);
  heading.append(popover);
  toggle.setAttribute('aria-controls',popover.id);
  const setOpen=(open)=>{
    popover.hidden=!open;
    toggle.setAttribute('aria-expanded',String(!!open));
    if(open)document.getElementById('companyQuickLookup')?.focus();
  };
  toggle.addEventListener('click',e=>{e.stopPropagation();setOpen(popover.hidden)});
  popover.addEventListener('click',e=>e.stopPropagation());
  document.addEventListener('click',e=>{if(!heading.contains(e.target))setOpen(false)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!popover.hidden){setOpen(false);toggle.focus()}});
  // Keep the dropdown aligned with the button and close it on direct navigation.
  action.addEventListener('click',()=>setOpen(false));
})();
