const fs=require('fs');
const p='tools/deploy-environment.ps1';
const s=fs.readFileSync(p,'utf8');
const checks=[
 ['version',s.includes('v7.62.58')],
 ['stop before backup',s.indexOf('Stop-TargetServer -Root $targetRoot') < s.indexOf('source-before-v7.62.58')],
 ['robocopy source backup',s.includes('Invoke-RobocopySafe -Source $targetRoot')],
 ['robocopy deployment',s.includes('Invoke-RobocopySafe -Source $sourceRoot')],
 ['exclude logs',s.includes("(Join-Path $sourceRoot 'logs')")],
 ['restart on failure',s.includes('Start-ExistingServerIfPossible -Root $targetRoot')]
];
for(const [n,ok] of checks){if(!ok) throw new Error('FAIL '+n); console.log('PASS '+n)}
