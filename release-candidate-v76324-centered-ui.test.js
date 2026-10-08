const fs=require('fs');
const assert=require('assert');
const css=fs.readFileSync('assets/style.css','utf8');
const html=fs.readFileSync('app.html','utf8');
const server=fs.readFileSync('server.js','utf8');
assert(css.includes('zoom:1.1;width:100%'),'110% application scale must fill the viewport');
assert(/assets\/app\.js\?v=7\.63\.\d+-/.test(html),'browser cache key must change');
assert(/const RELEASE_NAME = 'v7\.63\.\d+-production'/.test(server));
console.log('v7.63.24 centered UI regression: PASS');
