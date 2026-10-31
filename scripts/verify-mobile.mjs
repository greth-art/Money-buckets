// Headless Chromium mobile-viewport regression checks for Money Buckets 2.
// This is a browser emulation test; it is not a physical iPhone/Safari certification.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const profile = await mkdtemp(join(tmpdir(), 'buckets-chrome-'));
const output = 'browser-artifacts';
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['scripts/serve.mjs', 'dist'], {
  env: { ...process.env, PORT: '31428', HOST: '127.0.0.1', FINNHUB_API_KEY: '', APP_VARIANT: 'mobile-v2' },
  stdio: 'ignore'
});
const chrome = spawn(process.env.CHROME_BIN || 'google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, 'about:blank'
], { stdio: 'ignore' });
let ws;
let sequence = 0;
const pending = new Map();

async function waitUntil(check, description) {
  let last;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const answer = await check();
      if (answer) return answer;
    } catch (error) { last = error; }
    await delay(125);
  }
  throw new Error('Timed out waiting for ' + description + ': ' + (last?.message || 'no response'));
}

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Browser command timed out: ' + method));
    }, 15000);
    pending.set(id, { resolve, reject, timeout });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await cdp('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true
  });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result?.result?.value;
}

async function state() {
  return evaluate(`({
    cards: document.querySelectorAll('.pick-card').length,
    symbols: [...document.querySelectorAll('.ticker')].map(el => el.textContent),
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    status: document.getElementById('message')?.textContent,
    mode: document.getElementById('mode')?.textContent,
    refresh: !!document.querySelector('button[aria-label="Refresh all stock data"]'),
    hasSearch: !!document.querySelector('input[type="search"]'),
    hasSourceDisclosure: !!document.querySelector('details summary')
  })`);
}

try {
  await waitUntil(async () => (await fetch('http://127.0.0.1:31428/')).ok, 'Node server');
  const portFile = join(profile, 'DevToolsActivePort');
  const port = await waitUntil(async () => {
    const file = await readFile(portFile, 'utf8');
    return Number(file.split('\n')[0]) || null;
  }, 'Chrome debug port');
  const tabs = await waitUntil(async () => {
    const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    return tabs.filter(tab => tab.type === 'page' && tab.webSocketDebuggerUrl);
  }, 'Chrome tab');
  ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timeout);
    if (message.error) task.reject(new Error(JSON.stringify(message.error)));
    else task.resolve(message);
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');

  for (const width of [320, 390, 768]) {
    await cdp('Emulation.setDeviceMetricsOverride', {
      width, height: 844, deviceScaleFactor: 3, mobile: true
    });
    await cdp('Page.navigate', { url: 'http://127.0.0.1:31428/' });
    const page = await waitUntil(async () => {
      const current = await state();
      return current.cards === 5 && current.mode === 'SAMPLE MODE' ? current : null;
    }, 'five demo stock cards at ' + width + 'px');

    assert.equal(page.cards, 5);
    assert.ok(page.refresh && page.hasSearch && page.hasSourceDisclosure);
    assert.equal(page.scrollWidth <= page.width + 1, true,
      'Horizontal page overflow at ' + width + ': ' + JSON.stringify(page));
    assert.deepEqual(page.symbols, ['MSFT', 'AAPL', 'NVDA', 'AMZN', 'GOOGL']);
    const shot = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(join(output, 'money-buckets-2-' + width + '.png'), Buffer.from(shot.result.data, 'base64'));

    await evaluate(`document.querySelector('button[data-bucket="core"]').click()`);
    const filtered = await state();
    assert.equal(filtered.cards, 2, 'Core bucket filter at ' + width);
    await evaluate(`document.querySelector('button[data-bucket="all"]').click()`);
    await evaluate(`document.getElementById('search').value='NVDA'; document.getElementById('search').dispatchEvent(new Event('input', { bubbles:true }))`);
    const searched = await state();
    assert.deepEqual(searched.symbols, ['NVDA']);
    await evaluate(`document.getElementById('search').value=''; document.getElementById('search').dispatchEvent(new Event('input', { bubbles:true }))`);
    await evaluate(`document.getElementById('refresh').click()`);
    await waitUntil(async () => (await state()).cards === 5, 'refresh completion');
    process.stdout.write('PASS ' + width + 'px: 5 stocks, no horizontal overflow, filters/search/refresh, screenshot\n');
  }
} finally {
  if (ws) ws.close();
  for (const task of pending.values()) { clearTimeout(task.timeout); task.reject(new Error('Browser closed')); }
  chrome.kill('SIGKILL');
  server.kill('SIGKILL');
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
