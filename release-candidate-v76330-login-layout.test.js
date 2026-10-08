const fs=require('fs');
const assert=require('assert');
const app=fs.readFileSync('assets/app.js','utf8');
const css=fs.readFileSync('assets/style.css','utf8');
const html=fs.readFileSync('app.html','utf8');
const server=fs.readFileSync('server.js','utf8');

assert(app.includes("document.body.classList.toggle('login-unscaled'"),'login visibility must control the 100% scale class');
assert(app.includes('new MutationObserver(syncLoginScale)'),'login/logout transitions must update scaling');
assert(css.includes('body.login-unscaled{zoom:1'),'login must render at true 100% on desktop');
assert(css.includes('grid-template-columns:minmax(0,54%) minmax(460px,46%)'),'desktop login columns must remain orderly');
assert(css.includes('max-height:calc(100vh - 64px)'),'login card must fit inside the viewport');
assert(/v=7\.63\.\d+-(?:login-100-layout|workspace-width|workspace-edge-alignment|top5-first-screen)/.test(html));
assert(/const RELEASE_NAME = 'v7\.63\.\d+-production'/.test(server));
console.log('v7.63.30 login 100% layout regression: PASS');
