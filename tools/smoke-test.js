'use strict';

const http = require('http');
const { spawn } = require('child_process');

const port = Number(process.env.SMOKE_PORT || 3100);
const child = spawn(process.execPath, ['dist/src/server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    ENABLE_LAN_ACCESS: 'false',
    SMOKE_TEST: '1',
    PGDATABASE: process.env.PGDATABASE || 'smoke_test_not_used'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });

const finish = (code, message) => {
  if (!child.killed) child.kill();
  if (message) console.log(message);
  if (code !== 0 && output.trim()) console.error(output.trim());
  process.exitCode = code;
};

const deadline = Date.now() + 15000;
const check = () => {
  http.get(`http://127.0.0.1:${port}/api/version`, response => {
    let body = '';
    response.on('data', chunk => { body += chunk; });
    response.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        if (response.statusCode === 200 && parsed.version === 'v7.61.58') {
          finish(0, `Smoke test passed: ${parsed.release}`);
        } else {
          finish(1, `Unexpected version response (${response.statusCode}): ${body}`);
        }
      } catch (error) {
        finish(1, `Invalid version response: ${error.message}`);
      }
    });
  }).on('error', () => {
    if (child.exitCode !== null) return finish(1, 'Server exited before smoke test completed.');
    if (Date.now() >= deadline) return finish(1, 'Timed out waiting for the server.');
    setTimeout(check, 300);
  });
};

child.on('exit', code => {
  if (process.exitCode == null && code) finish(1, `Server exited with code ${code}.`);
});
setTimeout(check, 300);
