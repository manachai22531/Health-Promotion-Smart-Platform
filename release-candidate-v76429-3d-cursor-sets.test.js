const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('v7.64.29 runtime and package versions agree',()=>{
  const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version,'7.64.29');assert.equal(lock.version,'7.64.29');assert.equal(lock.packages[''].version,'7.64.29');
  assert.equal(read('VERSION.txt').trim(),'v7.64.29');assert.match(read('server.js'),/v7\.64\.29-production/);
});

test('premium session text is readable on its light pill',()=>{
  const css=read('assets/appearance-settings.css');
  assert.match(css,/data-hc-theme="premium"\] \.user-session\{[^}]*background:#fff!important/);
  assert.match(css,/data-hc-theme="premium"\] \.user-session strong\{color:#103f62!important/);
});

test('appearance panel exposes cursor sizes and keeps hand 3D as migration default',()=>{
  const html=read('app.html'),js=read('assets/appearance-settings.js'),css=read('assets/appearance-settings.css');
  for(const size of ['small','medium','large'])assert.match(html,new RegExp(`data-hc-cursor-size="${size}"`));
  for(const style of ['standard','hand3d','minimal','clinic'])assert.match(html,new RegExp(`data-hc-cursor-style="${style}"`));
  assert.match(js,/cursorStyle:'hand3d'/);assert.match(js,/healthcheck\.appearance\.cursorSize\.v1/);
  for(const size of [32,48,64]){assert.ok(fs.existsSync(path.join(root,'assets',`cursor-hand-pointer-${size}.png`)));assert.match(css,new RegExp(`cursor-hand-pointer-${size}\\.png`))}
});

test('three sparkle palettes and three click sounds are wired',()=>{
  const html=read('app.html'),js=read('assets/appearance-settings.js'),css=read('assets/appearance-settings.css'),app=read('assets/app.js');
  for(const style of ['gold','ice','violet']){assert.match(html,new RegExp(`data-hc-sparkle-style="${style}"`));assert.match(css,new RegExp(`data-hc-sparkle="${style}"`))}
  for(const style of ['soft','crystal','digital']){assert.match(html,new RegExp(`data-hc-sound-style="${style}"`));assert.match(app,new RegExp(`${style}:\\{type:`))}
  assert.match(app,/data-hc-sound-preview/);assert.match(js,/healthcheck\.appearance\.sparkle\.v1/);
});

test('every option card receives a direct click handler',()=>{
  const js=read('assets/appearance-settings.js');
  assert.match(js,/choiceDefinitions\.forEach/);
  assert.match(js,/panel\.querySelectorAll\(item\[1\]\)\.forEach/);
  assert.match(js,/button\.addEventListener\('click'/);
  assert.match(js,/event\.preventDefault\(\);event\.stopPropagation\(\);choose/);
});

test('default theme label and dimensional cursor assets are packaged',()=>{
  const html=read('app.html'),css=read('assets/appearance-settings.css');
  assert.match(html,/data-hc-theme-choice="current"[^>]*>[\s\S]*?<b>ค่าเริ่มต้น<\/b>/);
  for(const name of ['standard','minimal','clinic']){
    const asset=`assets/cursor-${name}-3d.svg`;
    assert.ok(fs.existsSync(path.join(root,asset)));
    assert.match(html,new RegExp(`cursor-${name}-3d\\.svg`));
    assert.match(css,new RegExp(`cursor-${name}-3d\\.svg`));
  }
  assert.match(css,/cursor-text-3d\.png/);assert.match(css,/cursor-hourglass-loading\.png/);assert.match(css,/cursor-hand-disabled\.png/);
});

test('legacy global sparkle accuracy and effect toggle remain intact',()=>{
  const app=read('assets/app.js');
  assert.match(app,/const x=\(event\.clientX-rect\.left\)\/\(scaleX\|\|1\)/);
  assert.match(app,/const count=6\+Math\.floor\(Math\.random\(\)\*5\)/);
  assert.match(app,/distance=20\+Math\.random\(\)\*25/);
  assert.match(app,/data-hc-effects'\)==='off'/);
});
