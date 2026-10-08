const fs=require('fs');
const assert=require('assert');

const app=fs.readFileSync('assets/app.js','utf8');
const html=fs.readFileSync('app.html','utf8');
const server=fs.readFileSync('server.js','utf8');

assert(!app.includes("if(!sessionUser)sessionUser=state.users.find"),'must not trust a stale browser session as server authentication');
assert(app.includes("a[data-nav-id=\"ocrDocument\"]"),'OCR menu must have an explicit session-aware click handler');
assert(app.includes("fetch('/api/auth/session',{cache:'no-store'})"),'OCR navigation must verify the server session');
assert(app.includes('Session หมดอายุหลัง Server เริ่มใหม่'),'expired session must show a clear Thai message');
assert(server.includes("const RELEASE_NAME = 'v7.63.21-production'"),'server release must be v7.63.21-production');
assert(html.includes('assets/app.js?v=7.63.21-ocr-session-fix'),'browser cache key must be updated');

console.log('v7.63.21 OCR menu/session regression: PASS');
