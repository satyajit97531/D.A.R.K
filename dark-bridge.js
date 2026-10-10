// D.A.R.K. Local Hardware Bridge for Wireless & USB ADB
// Run this on your PC to relay commands from Dark to your wirelessly connected phone!
// Usage: node dark-bridge.js

import http from 'http';
import { exec } from 'child_process';

const PORT = 9999;

const server = http.createServer((req, res) => {
  // Enable CORS so the Dark web interface can communicate with local ADB
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/adb') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { command } = JSON.parse(body);
        if (!command) {
          res.writeHead(400);
          res.end('Missing command');
          return;
        }

        console.log(`[D.A.R.K. Bridge] Executing: adb shell "${command}"`);
        exec(`adb shell "${command}"`, (err, stdout, stderr) => {
          if (err) {
            console.error(`[D.A.R.K. Bridge Error]:`, err.message);
            res.writeHead(500);
            res.end(err.message);
          } else {
            console.log(`[D.A.R.K. Bridge Output]:`, stdout || 'OK');
            res.writeHead(200);
            res.end(stdout || 'OK');
          }
        });
      } catch (e) {
        res.writeHead(400);
        res.end(e.message);
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  D.A.R.K. Hardware Bridge Active on port ${PORT} `);
  console.log(`  Relaying commands to wirelessly connected phone! `);
  console.log(`===============================================`);
});
