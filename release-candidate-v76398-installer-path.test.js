"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = path.join(__dirname,'tools');
const gui = fs.readFileSync(path.join(app,'production-installer-gui.ps1'),'utf8');
const vbs = fs.readFileSync(path.join(app,'start-production-installer.vbs'),'utf8');
const worker = fs.readFileSync(path.join(app,'installer-worker.ps1'),'utf8');
test('v7.63.99 release metadata is consistent', () => {
 assert.match(require('./package.json').version,/^7\.(?:63\.99|64\.\d+)$/);
 assert.match(fs.readFileSync('VERSION.txt','utf8'),/v7\.(?:63\.99|64\.\d+)/);
 assert.match(fs.readFileSync('server.js','utf8'),/RELEASE_NAME = 'v7\.(?:63\.99|64\.\d+)-production'/);
});
test('VBS launcher elevates from real Windows system folder, not Downloads profile', () => {
 assert.match(vbs,/safeWorkDir = shell\.ExpandEnvironmentStrings\("%SystemRoot%"\)/);
 assert.match(vbs,/If Not fso\.FolderExists\(safeWorkDir\) Then/);
 assert.match(vbs,/ShellExecute "powershell\.exe", args, safeWorkDir, "runas"/);
 assert.doesNotMatch(vbs,/ShellExecute "powershell\.exe", args, rootDir/);
});
test('WPF GUI worker uses verified temp directory instead of sourceRoot', () => {
 assert.match(gui,/Start-Process -FilePath \$powershellExe.*-WorkingDirectory \$runtimeRoot.*-ErrorAction Stop/);
 assert.doesNotMatch(gui,/Start-Process .*?-WorkingDirectory \$sourceRoot/);
 for(const p of ['sourceRoot','workerPath','runtimeRoot','powershellExe']) assert.match(gui,new RegExp('Test-Path -LiteralPath \\$'+p));
});
test('WPF callback and ShowDialog handle exceptions, log errors and preserve working installer', () => {
 assert.match(gui,/\$InstallButton\.Add_Click\(\{\s*try \{/);
 assert.match(gui,/Show-Result \$false \$message/);
 assert.match(gui,/try \{ \$window\.ShowDialog\(\) \| Out-Null \} catch/);
 assert.match(gui,/Production files were not changed/);
 assert.match(worker,/-WorkingDirectory \$env:TEMP/);
});
