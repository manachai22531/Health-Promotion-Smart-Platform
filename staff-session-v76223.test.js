'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=__dirname,app=fs.readFileSync(path.join(root,'assets','app.js'),'utf8'),server=fs.readFileSync(path.join(root,'server.js'),'utf8');
test('staff login uses an HttpOnly server session that survives refresh',()=>{assert.match(server,/STAFF_SESSION_COOKIE='hc_staff_session'/);assert.match(server,/HttpOnly; SameSite=Lax/);assert.match(server,/app\.get\('\/api\/auth\/session'/);assert.match(server,/app\.post\('\/api\/auth\/logout'/);assert.match(app,/fetch\('\/api\/auth\/session'/);assert.match(app,/fetch\('\/api\/auth\/login'/);assert.match(app,/fetch\('\/api\/auth\/logout'/)});
test('remember login changes only session lifetime and never stores password',()=>{assert.match(server,/remember\?30\*24\*60\*60\*1000:12\*60\*60\*1000/);assert.doesNotMatch(app,/localStorage\.setItem\([^\n]*password/i)});
