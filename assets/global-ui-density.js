/* v7.64.18: visual-only density preference (never changes patient/order data). */
(function () {
  'use strict';
  var STORAGE_KEY = 'healthcheck.uiDensity.v1';
  var allowed = {normal: true, compact: true, dense: true};
  function getSaved() {
    try { var v = window.localStorage.getItem(STORAGE_KEY); return allowed[v] ? v : 'compact'; }
    catch (_) { return 'compact'; }
  }
  function setDensity(value, persist) {
    var chosen = allowed[value] ? value : 'compact';
    document.documentElement.setAttribute('data-hc-density', chosen);
    var selector = document.getElementById('globalUiDensity');
    if (selector && selector.value !== chosen) selector.value = chosen;
    if (persist) { try { window.localStorage.setItem(STORAGE_KEY, chosen); } catch (_) {} }
  }
  function initialize() {
    var selector = document.getElementById('globalUiDensity');
    setDensity(getSaved(), false);
    if (selector && !selector.dataset.hcDensityBound) {
      selector.dataset.hcDensityBound = '1';
      selector.addEventListener('change', function () { setDensity(selector.value, true); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY) setDensity(getSaved(), false);
  });
})();
