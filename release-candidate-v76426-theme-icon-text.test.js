'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('v7.64.26 versions agree across runtime, assets and installer',()=>{
  const pkg=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version,'7.64.26');
  assert.equal(lock.version,'7.64.26');
  assert.equal(lock.packages[''].version,'7.64.26');
  assert.equal(read('VERSION.txt').trim(),'v7.64.26');
  assert.match(read('server.js'),/v7\.64\.26-production/);
  assert.match(read('app.html'),/7\.64\.26-production-theme-icon-text/g);
  assert.match(read('tools/production-installer-gui.ps1'),/v7\.64\.26 PRODUCTION/);
  assert.match(read('tools/production-installer-worker.ps1'),/v7\.64\.26/);
});

test('appearance trigger uses the production person-and-palette SVG',()=>{
  const html=read('app.html'),svg=read('assets/person-palette.svg'),css=read('assets/appearance-settings.css');
  assert.match(html,/src="assets\/person-palette\.svg\?v=7\.64\.26"/);
  assert.doesNotMatch(html,/hc-person-palette-icon/);
  assert.match(svg,/aria-label="ผู้ใช้และถาดสี"/);
  assert.match(svg,/<path[^>]+fill="url\(#p\)"/);
  assert.match(svg,/fill="#f6c84b"/);assert.match(svg,/fill="#8d63d9"/);assert.match(svg,/fill="#19b99e"/);
  assert.match(css,/\.hc-appearance-trigger>img\{display:block;width:31px;height:31px/);
});

test('premium and warm themes recolor text hierarchy, labels and tables',()=>{
  const css=read('assets/appearance-settings.css');
  for(const theme of ['premium','warm']){
    assert.match(css,new RegExp(`data-hc-theme="${theme}"[^}]+body`));
    assert.match(css,new RegExp(`data-hc-theme="${theme}"[^\n]+:is\\(h1,h2,h3,h4`));
    assert.match(css,new RegExp(`data-hc-theme="${theme}"[^\n]+:is\\(label,th`));
    assert.match(css,new RegExp(`data-hc-theme="${theme}"[^\n]+table th`));
  }
});

test('unified appearance panel exposes exactly the three selected themes',()=>{
  const html=read('app.html'),js=read('assets/appearance-settings.js'),css=read('assets/appearance-settings.css');
  assert.match(html,/id="hcAppearanceToggle"/);assert.match(html,/person-palette\.svg/);
  for(const theme of ['current','premium','warm'])assert.match(html,new RegExp(`data-hc-theme-choice="${theme}"`));
  assert.doesNotMatch(html,/data-hc-theme-choice="night"/);
  for(const label of ['ปัจจุบัน','พรีเมียม','อบอุ่นสายตา'])assert.match(html,new RegExp(`>${label}<`));
  assert.match(js,/allowed=\{current:true,premium:true,warm:true\}/);
  assert.match(css,/data-hc-theme="premium"/);assert.match(css,/data-hc-theme="warm"/);
});

test('appearance panel combines UI size, effects and sound',()=>{
  const html=read('app.html'),js=read('assets/appearance-settings.js'),css=read('assets/appearance-settings.css'),app=read('assets/app.js');
  for(const id of ['globalUiDensity','hcEffectsToggle','soundToggle'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(js,/healthcheck\.appearance\.theme\.v1/);assert.match(js,/healthcheck\.appearance\.effects\.v1/);
  assert.match(app,/data-hc-effects'\)==='off'/);
  assert.match(css,/@media print\{\.hc-appearance-control\{display:none!important\}\}/);
});

test('elevated WPF installer normalizes PowerShell and .NET working directories',()=>{
  const gui=read('tools/production-installer-gui.ps1');
  const launcher=read('tools/start-production-installer.vbs');
  assert.match(gui,/\$safeProcessRoot=Join-Path \$env:WINDIR 'Temp'/);
  assert.match(gui,/Set-Location -LiteralPath \$safeProcessRoot/);
  assert.match(gui,/\[Environment\]::CurrentDirectory=\$safeProcessRoot/);
  assert.match(gui,/\$runtimeRoot=Join-Path \$safeProcessRoot 'HealthCheck-Production-Installer'/);
  assert.doesNotMatch(gui,/\$runtimeRoot=Join-Path \$env:TEMP/);
  assert.match(launcher,/fso\.BuildPath\(shell\.ExpandEnvironmentStrings\("%SystemRoot%"\), "Temp"\)/);
});

test('Updater Helper avoids Windows rename-over-existing EPERM race',()=>{
  const helper=read('tools/app-update-helper.js');
  assert.doesNotMatch(helper,/renameSync\(tmp,status\)/);
  assert.match(helper,/fs\.writeFileSync\(status,text,'utf8'\)/);
  assert.match(helper,/\['EPERM','EBUSY','EACCES'\]/);
  assert.match(helper,/attempt<20/);
  assert.match(helper,/Atomics\.wait/);
});

test('global sparkle uses a fixed unscaled viewport layer and corrected coordinates',()=>{
  const app=read('assets/app.js'),css=read('assets/style.css');
  assert.match(css,/#hcSparkleLayer\{position:fixed;inset:0;width:100vw;height:100vh/);
  assert.match(css,/transform:none!important;zoom:1!important/);
  assert.match(app,/getBoundingClientRect\(\)/);
  assert.match(app,/rect\.width\/layer\.offsetWidth/);
  assert.match(app,/\(event\.clientX-rect\.left\)\/\(scaleX\|\|1\)/);
  assert.match(app,/\(event\.clientY-rect\.top\)\/\(scaleY\|\|1\)/);
});

test('sparkle count, distance and duration meet the release contract',()=>{
  const app=read('assets/app.js'),css=read('assets/style.css');
  assert.match(app,/const count=6\+Math\.floor\(Math\.random\(\)\*5\)/);
  assert.match(app,/const distance=20\+Math\.random\(\)\*25/);
  assert.match(app,/const duration=\.5\+Math\.random\(\)\*\.3/);
  assert.match(app,/button,\.button,\[role="button"\],input\[type="button"\],input\[type="submit"\]/);
  assert.match(app,/button\.disabled\|\|button\.getAttribute\('aria-disabled'\)==='true'/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
});
