/* HealthCheck v7.64.27 — advanced personal appearance settings. */
(function(){
  'use strict';
  var root=document.documentElement,panel=document.getElementById('hcAppearancePanel'),trigger=document.getElementById('hcAppearanceToggle');
  if(!panel||!trigger)return;
  var KEYS={theme:'healthcheck.appearance.theme.v1',effects:'healthcheck.appearance.effects.v1',cursorSize:'healthcheck.appearance.cursorSize.v1',cursorStyle:'healthcheck.appearance.cursorStyle.v1',sparkle:'healthcheck.appearance.sparkle.v1',soundStyle:'healthcheck.appearance.soundStyle.v1'};
  var ALLOWED={theme:{current:1,premium:1,warm:1},cursorSize:{small:1,medium:1,large:1},cursorStyle:{hand3d:1,minimal:1,clinic:1,wand:1,paw:1,sailfish:1},sparkle:{gold:1,ice:1,violet:1},soundStyle:{soft:1,crystal:1,digital:1}};
  function saved(key,fallback){try{return localStorage.getItem(key)||fallback}catch(_){return fallback}}
  function persist(key,value){try{localStorage.setItem(key,value)}catch(_){}}
  function choose(group,value,save){
    var fallback={theme:'current',cursorSize:'medium',cursorStyle:'hand3d',sparkle:'gold',soundStyle:'soft'}[group],selected=ALLOWED[group][value]?value:fallback;
    var attribute={theme:'data-hc-theme',cursorSize:'data-hc-cursor-size',cursorStyle:'data-hc-cursor-style',sparkle:'data-hc-sparkle',soundStyle:'data-hc-sound-style'}[group];
    var selector={theme:'[data-hc-theme-choice]',cursorSize:'[data-hc-cursor-size]',cursorStyle:'[data-hc-cursor-style]',sparkle:'[data-hc-sparkle-style]',soundStyle:'[data-hc-sound-style]'}[group];
    var dataset={theme:'hcThemeChoice',cursorSize:'hcCursorSize',cursorStyle:'hcCursorStyle',sparkle:'hcSparkleStyle',soundStyle:'hcSoundStyle'}[group];
    root.setAttribute(attribute,selected);panel.querySelectorAll(selector).forEach(function(button){var active=button.dataset[dataset]===selected;button.classList.toggle('active',active);button.setAttribute('aria-checked',String(active))});if(save)persist(KEYS[group],selected);if(group==='cursorStyle'||group==='cursorSize')root.dispatchEvent(new CustomEvent('hc-cursor-change'));return selected;
  }
  function setEffects(enabled,save){root.setAttribute('data-hc-effects',enabled?'on':'off');var button=document.getElementById('hcEffectsToggle');if(button){button.textContent=enabled?'เปิด':'ปิด';button.setAttribute('aria-pressed',String(enabled))}if(save)persist(KEYS.effects,enabled?'on':'off')}
  function updatePanelBounds(){
    if(panel.hidden)return;
    var rect=panel.getBoundingClientRect(),scale=rect.width/panel.offsetWidth||1;
    var viewport=window.visualViewport,bottom=viewport?viewport.offsetTop+viewport.height:window.innerHeight;
    var width=viewport?viewport.width:window.innerWidth;
    panel.style.setProperty('--hc-appearance-max-height',Math.max(0,(bottom-rect.top-12)/scale)+'px');
    panel.style.setProperty('--hc-appearance-max-width',Math.max(0,(width-24)/scale)+'px');
  }
  function openPanel(open){panel.hidden=!open;trigger.setAttribute('aria-expanded',String(open));if(open){updatePanelBounds();panel.querySelector('[data-hc-theme-choice].active')?.focus({preventScroll:true})}}
  window.addEventListener('resize',updatePanelBounds);
  window.addEventListener('scroll',updatePanelBounds,true);
  window.visualViewport?.addEventListener('resize',updatePanelBounds);
  window.visualViewport?.addEventListener('scroll',updatePanelBounds);
  document.getElementById('globalUiDensity')?.addEventListener('change',function(){requestAnimationFrame(updatePanelBounds)});
  choose('theme',saved(KEYS.theme,'current'),false);choose('cursorSize',saved(KEYS.cursorSize,'medium'),false);choose('cursorStyle',saved(KEYS.cursorStyle,'hand3d'),false);choose('sparkle',saved(KEYS.sparkle,'gold'),false);choose('soundStyle',saved(KEYS.soundStyle,'soft'),false);setEffects(saved(KEYS.effects,'on')!=='off',false);
  trigger.addEventListener('click',function(event){event.stopPropagation();openPanel(panel.hidden)});
  document.getElementById('hcAppearanceClose')?.addEventListener('click',function(){openPanel(false)});
  document.getElementById('hcAppearanceDone')?.addEventListener('click',function(){openPanel(false)});
  var choiceDefinitions=[['theme','[data-hc-theme-choice]','hcThemeChoice'],['cursorSize','[data-hc-cursor-size]','hcCursorSize'],['cursorStyle','[data-hc-cursor-style]','hcCursorStyle'],['sparkle','[data-hc-sparkle-style]','hcSparkleStyle'],['soundStyle','[data-hc-sound-style]','hcSoundStyle']];
  choiceDefinitions.forEach(function(item){panel.querySelectorAll(item[1]).forEach(function(button){button.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();choose(item[0],button.dataset[item[2]],true)})})});
  document.getElementById('hcEffectsToggle')?.addEventListener('click',function(){setEffects(root.getAttribute('data-hc-effects')==='off',true)});
  document.getElementById('hcAppearanceReset')?.addEventListener('click',function(){choose('theme','current',true);choose('cursorSize','medium',true);choose('cursorStyle','hand3d',true);choose('sparkle','gold',true);choose('soundStyle','soft',true);setEffects(true,true);var density=document.getElementById('globalUiDensity');if(density){density.value='compact';density.dispatchEvent(new Event('change',{bubbles:true}))}var sound=document.getElementById('soundToggle');if(sound&&sound.getAttribute('aria-pressed')==='false')sound.click()});
  document.addEventListener('click',function(event){if(!panel.hidden&&!event.target.closest('.hc-appearance-control'))openPanel(false)});
  document.addEventListener('keydown',function(event){if(event.key==='Escape')openPanel(false)});
})();
