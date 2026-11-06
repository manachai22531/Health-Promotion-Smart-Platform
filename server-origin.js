'use strict';
// Derive public links from the live request, never a URL copied from a database.
const os=require('node:os');
function origin(value){try{const u=new URL(String(value||''));if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)return '';return u.origin}catch{return ''}}
function localHost(value){try{return /^(localhost|127\..*|0\.0\.0\.0|\[::1\])$/i.test(new URL(value).hostname)}catch{return true}}
function resolveServerOrigin(req,{environmentKeys=[]}={}){
 const get=key=>typeof req.get==='function'?req.get(key):req.headers?.[key.toLowerCase()];
 const remote=String(req.socket?.remoteAddress||'').replace(/^::ffff:/,'');
 const trusted=['127.0.0.1','::1',...String(process.env.HR_CONNECT_TRUSTED_PROXIES||'').split(',').map(s=>s.trim())].includes(remote);
 const scheme=req.secure||trusted&&get('X-Forwarded-Proto')==='https'?'https':req.protocol||'http';
 const host=trusted&&get('X-Forwarded-Host')||get('Host');
 const current=origin(get('X-Client-Origin'))||origin(get('X-HR-Origin'))||origin(get('Origin'))||origin(scheme+'://'+host);
 if(current&&!localHost(current))return current;
 for(const key of environmentKeys){const value=origin(process.env[key]);if(value&&!localHost(value))return value}
 const hostname=String(process.env.COMPUTERNAME||os.hostname()).trim();
 if(current&&/^[a-z0-9][a-z0-9.-]*$/i.test(hostname)&&!localHost('http://'+hostname)){const u=new URL(current);return u.protocol+'//'+hostname+(u.port?':'+u.port:'')}
 if(current)return current;
 throw Object.assign(Error('ไม่พบที่อยู่ server กรุณาเปิดระบบผ่าน URL ของ server แล้วลองอีกครั้ง'),{status:400});
}
module.exports={origin,localHost,resolveServerOrigin};
