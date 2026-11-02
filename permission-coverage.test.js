const fs=require('fs');
const assert=require('assert');

const app=fs.readFileSync('assets/app.js','utf8');
const html=fs.readFileSync('app.html','utf8');
const server=fs.readFileSync('server.js','utf8');
const assets=fs.readdirSync('assets').filter(name=>name.endsWith('.js')).map(name=>fs.readFileSync(`assets/${name}`,'utf8')).join('\n');
const slice=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const catalogBlock=slice(app,'const PERMISSION_GROUPS=','const PERMISSIONS=');
const menuBlock=slice(app,'const MENU_PERMISSION_TREE=','const LEGACY_PERMISSION_MAP=');
const catalog=new Set([...catalogBlock.matchAll(/\[\s*['"]([A-Za-z][A-Za-z0-9]+)['"]\s*,/g)].map(match=>match[1]));
const menu=new Set([...menuBlock.matchAll(/(?:master\s*:\s*|\[\s*)['"]([A-Za-z][A-Za-z0-9]+)['"]/g)].map(match=>match[1]));
const client=assets+'\n'+html;
const checked=new Set([
  ...[...client.matchAll(/\b(?:can|guard)\(\s*['"]([A-Za-z][A-Za-z0-9]+)['"]/g)].map(match=>match[1]),
  ...[...client.matchAll(/data-permission(?:=|\\?=")['"]?([A-Za-z][A-Za-z0-9]+)/g)].map(match=>match[1]),
  ...[...server.matchAll(/staff(?:Page)?PermissionRequired\(\s*['"]([A-Za-z][A-Za-z0-9]+)['"]/g)].map(match=>match[1])
]);
const missing=(source,target)=>[...source].filter(key=>!target.has(key)).sort();

assert.deepStrictEqual(missing(checked,catalog),[],'พบชื่อสิทธิ์ที่ใช้งานจริงแต่ไม่มีใน PERMISSION_GROUPS');
assert.deepStrictEqual(missing(catalog,menu),[],'พบสิทธิ์ที่หน้า Role ไม่มีช่องให้ตั้งค่า');
assert.deepStrictEqual(missing(menu,catalog),[],'พบสิทธิ์ในหน้า Role ที่ไม่มีใน PERMISSION_GROUPS');
console.log(`PASS permission coverage: ${catalog.size} permissions are represented in Role settings; ${checked.size} referenced permissions are declared`);
