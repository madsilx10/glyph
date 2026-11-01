const fs = require('fs');
const readline = require('readline');

const BASE_URL = 'https://askglyph.chat';
const REF = 'madsilxx';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function randomStatus() {
  return Math.floor(1e18 + Math.random() * 9e18).toString();
}

function parseCookies(setCookieArr) {
  return setCookieArr.map(c => c.split(';')[0]).join('; ');
}

async function request(path, options = {}, cookies = '') {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Origin': BASE_URL,
      'Referer': `${BASE_URL}/`,
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      ...(cookies ? { Cookie: cookies } : {}),
      ...(options.headers || {}),
    },
  });
  return res;
}

async function login(handle) {
  const res = await request('/api/login', {
    method: 'POST',
    body: JSON.stringify({ handle, ref: REF }),
  });
  const cookies = parseCookies(res.headers.getSetCookie());
  const data = await res.json();
  return { ok: data.ok, cookies };
}

async function chat(text, cookies) {
  const res = await request('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ text }),
    headers: { Cookie: cookies },
  });
  return res.json();
}

async function taskOpen(task_id, cookies) {
  const res = await request('/api/task/open', {
    method: 'POST',
    body: JSON.stringify({ task_id }),
    headers: { Cookie: cookies },
  });
  return res.json();
}

async function getMe(cookies) {
  const res = await request('/api/me', { method: 'GET', headers: { Cookie: cookies } });
  return res.json();
}

const TASK_CONFIRM = {
  'follow':   'done — follow @askglyph on x',
  'like-1':   'done — like the pinned post',
  'repost-1': 'done — repost the pinned post',
};

async function runAccount(handle, wallet) {
  console.log(`\n[${handle}] Login...`);
  const { ok, cookies } = await login(handle);
  if (!ok) { console.log(`[${handle}] Login gagal`); return; }
  console.log(`[${handle}] Login OK`);

  // Init chat
  await chat('go', cookies);
  await sleep(1000);

  const me = await getMe(cookies);
  const tasks = me.tasks || [];

  for (const task of tasks) {
    if (task.status === 'done') {
      console.log(`[${handle}] Task ${task.id} udah done, skip`);
      continue;
    }

    console.log(`[${handle}] Task: ${task.id} (${task.type})`);

    if (task.type === 'invite') {
      console.log(`[${handle}] Skip task invite`);
      continue;
    }

    // Open task
    await taskOpen(task.id, cookies);

    if (task.verification === 'timer') {
      const wait = (task.waitSec || 5) * 1000 + 500;
      console.log(`[${handle}] Tunggu ${task.waitSec}s...`);
      await sleep(wait);
      const confirmText = TASK_CONFIRM[task.id] || `done — ${task.id}`;
      await chat(confirmText, cookies);
      console.log(`[${handle}] Konfirm: "${confirmText}"`);

    } else if (task.verification === 'reply_url') {
      const fakeUrl = `https://x.com/${handle}/status/${randomStatus()}`;
      await chat(fakeUrl, cookies);
      console.log(`[${handle}] Submit fake URL: ${fakeUrl}`);
    }

    await sleep(1500);
  }

  // Submit wallet
  if (wallet) {
    console.log(`[${handle}] Submit wallet: ${wallet}`);
    await chat(wallet, cookies);
    await sleep(1000);
  }

  console.log(`[${handle}] Selesai ✓`);
}

async function main() {
  const usernames = fs.readFileSync('usn.txt', 'utf8').trim().split('\n').map(s => s.trim()).filter(Boolean);
  const wallets   = fs.readFileSync('wallet.txt', 'utf8').trim().split('\n').map(s => s.trim()).filter(Boolean);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  console.log('\n=== AskGlyph Bot ===');
  console.log('1. 1 akun');
  console.log('2. Semua akun');
  console.log('3. From X to end');
  const pilihan = (await ask('Pilih: ')).trim();

  let targets = [];

  if (pilihan === '1') {
    usernames.forEach((u, i) => console.log(`${i + 1}. ${u}`));
    const idx = parseInt(await ask('Pilih akun (nomor): ')) - 1;
    targets = [[usernames[idx], wallets[idx]]];

  } else if (pilihan === '2') {
    targets = usernames.map((u, i) => [u, wallets[i]]);

  } else if (pilihan === '3') {
    const from = parseInt(await ask('From (nomor): ')) - 1;
    targets = usernames.slice(from).map((u, i) => [u, wallets[from + i]]);
  }

  rl.close();

  for (const [handle, wallet] of targets) {
    await runAccount(handle, wallet);
    await sleep(2000);
  }

  console.log('\nSemua akun selesai.');
}

main().catch(console.error);
