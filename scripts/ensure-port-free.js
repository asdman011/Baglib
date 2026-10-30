#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Baglib Dev Port & Process Sanitizer
 *
 * Ensures port 3000 is clear before `next dev` starts, preventing
 * `Error: listen EADDRINUSE: address already in use :::3000` when a
 * previous dev session or background process didn't terminate cleanly.
 */

const { execSync } = require('child_process');

const PORT = 3000;

function freePort(port) {
  try {
    if (process.platform === 'win32') {
      // Find PID listening on the specified port
      const output = execSync(`netstat -ano -p tcp`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      const lines = output.split('\n');
      const pids = new Set();

      for (const line of lines) {
        if (line.includes(`:${port}`) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && parseInt(pid, 10) !== process.pid) {
            pids.add(pid);
          }
        }
      }

      for (const pid of pids) {
        try {
          console.log(`[baglib] Freeing port ${port}: terminating orphaned process PID ${pid}...`);
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        } catch {
          // Process may have already exited
        }
      }
    } else {
      // Unix: lsof or fuser
      try {
        const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (pids) {
          for (const pid of pids.split('\n')) {
            if (pid && parseInt(pid, 10) !== process.pid) {
              console.log(`[baglib] Freeing port ${port}: terminating orphaned process PID ${pid}...`);
              execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
            }
          }
        }
      } catch {
        // No process on port
      }
    }
  } catch (err) {
    // Non-fatal warning
    console.warn(`[baglib] Port sanitizer notice:`, err?.message || err);
  }
}

// Free port 3000 before boot
freePort(PORT);
