const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('app.html','utf8'),app=fs.readFileSync('assets/app.js','utf8'),css=fs.readFileSync('assets/style.css','utf8'),server=fs.readFileSync('server.js','utf8');
test('auto refresh selector is removed and refresh is fixed at five seconds',()=>{assert.doesNotMatch(html,/id="autoRefreshSeconds"/);assert.match(app,/setInterval\(runAutoRefresh,5000\)/);assert.match(app,/health-check-auto-refresh-seconds','5'/)});
test('version displays one v prefix',()=>{assert.doesNotMatch(html,/>v <b data-app-version/);assert.match(server,/v7\.63\.\d+-production/)});
test('search workspace fills the available desktop viewport',()=>{assert.match(css,/#searchView\.active/);assert.match(css,/min-height:calc\(100vh - 116px\)/);assert.match(css,/#searchView \.today-registration-panel/);assert.match(css,/height:100%!important/)});
