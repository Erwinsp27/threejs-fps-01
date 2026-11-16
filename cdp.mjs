// cdp.mjs — a minimal Chrome DevTools Protocol driver for the playtest and
// screenshot scripts. Node 22's built-in WebSocket client talks to a
// headless Chromium (the Playwright-cached headless shell when present,
// else any chrome on PATH). No npm packages, no network beyond localhost.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  const home = process.env.HOME || '';
  const candidates = [
    home + '/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return 'google-chrome';
}

async function waitHttpOk(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (_) { /* not up yet */ }
    await sleep(150);
  }
  throw new Error(`cdp: timed out waiting for ${url}`);
}

// Serve game/ on a port for the browser scripts.
export async function startGameServer(port) {
  const child = spawn('node', ['serve.ts', '--port', String(port)], {
    cwd: new URL('.', import.meta.url).pathname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  await waitHttpOk(`http://127.0.0.1:${port}/index.html`);
  return child;
}

export function stopServer(child) {
  if (child && !child.killed) child.kill('SIGTERM');
}

export class CDP {
  constructor(port = 9222) {
    this.port = port;
    this.nextId = 1;
    this.pending = new Map();
    this.errors = [];
    this.proc = null;
    this.ws = null;
    this.targetId = null;
  }

  async launch(startUrl = 'about:blank') {
    const chrome = findChrome();
    const isShell = chrome.includes('headless_shell');
    const args = [
      `--remote-debugging-port=${this.port}`,
      '--window-size=1280,720',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--mute-audio',
      '--hide-scrollbars',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      startUrl,
    ];
    if (!isShell) args.unshift('--headless=new');
    this.proc = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc.stderr.on('data', () => {});
    await waitHttpOk(`http://127.0.0.1:${this.port}/json/version`);
  }

  async newTarget(url) {
    const res = await fetch(
      `http://127.0.0.1:${this.port}/json/new?${encodeURIComponent(url)}`,
      { method: 'PUT' },
    );
    if (!res.ok) throw new Error(`cdp: /json/new failed: ${res.status}`);
    const target = await res.json();
    this.targetId = target.id;
    await this.connect(target.webSocketDebuggerUrl);
  }

  async connect(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = (e) => reject(new Error('cdp: websocket error: ' + String(e.message || e)));
    });
    this.ws.onmessage = (msg) => {
      let data;
      try {
        data = JSON.parse(msg.data);
      } catch (_) {
        return;
      }
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(new Error(`cdp: ${data.error.message}`));
        else resolve(data.result);
      } else if (data.method === 'Runtime.exceptionThrown') {
        const d = data.params.exceptionDetails;
        this.errors.push('exception: ' + (d.exception?.description || d.text || 'unknown'));
      } else if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
        this.errors.push('console.error: ' + data.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      } else if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error') {
        this.errors.push('log: ' + data.params.entry.text + ' ' + (data.params.entry.url || ''));
      }
    };
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Log.enable');
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`cdp: timeout waiting for ${method}`));
      }, 30000);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
  }

  // Evaluate a JS expression in the page and return its JSON value.
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error('cdp: evaluate failed: ' + (r.exceptionDetails.text || JSON.stringify(r.exceptionDetails.exception)));
    }
    return r.result.value;
  }

  async waitFor(expression, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate(expression)) return true;
      } catch (_) { /* page still loading */ }
      await sleep(400);
    }
    throw new Error(`cdp: timed out waiting for ${expression}`);
  }

  async screenshot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    await writeFile(file, Buffer.from(r.data, 'base64'));
  }

  async close() {
    try {
      if (this.ws) this.ws.close();
    } catch (_) { /* already closed */ }
    if (this.proc && !this.proc.killed) this.proc.kill('SIGTERM');
  }
}
