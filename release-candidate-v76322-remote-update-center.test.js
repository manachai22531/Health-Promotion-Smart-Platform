const fs=require('fs');
const assert=require('assert');

const server=fs.readFileSync('server.js','utf8');
const app=fs.readFileSync('assets/app.js','utf8');
const html=fs.readFileSync('app.html','utf8');

assert(/const RELEASE_NAME = 'v7\.63\.\d+-production'/.test(server));
assert(server.includes("startsWith('/api/system/update/')"),'Update Center must bypass the IP-only middleware');
assert(server.includes("app.post('/api/system/update/unlock', unlockPackageConfig)"),'remote Update Center must have a dedicated unlock route');
assert(server.includes("app.get('/api/system/update/status',packageConfigSessionRequired"),'remote status must require a short-lived token');
assert(app.includes("fetch('/api/system/update/unlock'"),'frontend must use the dedicated update unlock route');
assert(app.includes("headers:{'X-Package-Config-Token':packageConfigToken}"),'protected status polling must authenticate');
assert(/assets\/app\.js\?v=7\.63\.\d+-/.test(html));

console.log('v7.63.22 remote Update Center regression: PASS');
