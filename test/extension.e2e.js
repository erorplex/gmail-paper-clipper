// Loads the real extension into Chromium (Playwright) against a mocked Gmail (test/fixtures/gmail):
// buttons, clipboard, counters, notes, the macOS helper (when built), and the self-update of
// unpacked installs. Setup once: npm install && npx playwright install chromium
// Run: npm run test:e2e
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  // reported as skip below
}

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'gmail');
const HELPER = path.join(ROOT, 'host', 'build', 'paper-clipper-helper');
const EXTENSION_ID = 'mdpkahachhfjeijgliaeinoojnfjajck';
const GMAIL = 'https://mail.google.com/mail/u/0/#inbox/FMfcg';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('real extension in Chromium', { skip: chromium ? false : 'playwright not installed', timeout: 120000 }, async (t) => {
  // A copy, because the update tests change files on disk.
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-clipper-ext-'));
  for (const entry of ['manifest.json', '_locales', 'icons', 'src']) {
    fs.cpSync(path.join(ROOT, entry), path.join(ext, entry), { recursive: true });
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-clipper-profile-'));
  const withHelper = process.platform === 'darwin' && fs.existsSync(HELPER);
  if (withHelper) {
    fs.mkdirSync(path.join(profile, 'NativeMessagingHosts'));
    fs.writeFileSync(
      path.join(profile, 'NativeMessagingHosts', 'io.github.erorplex.paper_clipper.json'),
      JSON.stringify({
        name: 'io.github.erorplex.paper_clipper',
        description: 'e2e',
        path: HELPER,
        type: 'stdio',
        allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
      })
    );
  }

  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    locale: 'de-DE',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  t.after(async () => {
    await ctx.close();
    fs.rmSync(ext, { recursive: true, force: true });
    fs.rmSync(profile, { recursive: true, force: true });
  });

  // Unpacked extensions only survive a reload with developer mode on, as in every real setup.
  const settings = await ctx.newPage();
  await settings.goto('chrome://extensions');
  await settings.evaluate(() => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }));
  await settings.close();

  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://mail.google.com' });
  await ctx.route('https://mail.google.com/**', (route) => {
    const id = /[?&]view=att&th=([0-9a-f]+)/.exec(route.request().url());
    if (id) return route.fulfill({ path: path.join(FIXTURES, `${id[1]}.eml`), contentType: 'message/rfc822' });
    return route.fulfill({ path: path.join(FIXTURES, 'thread.html'), contentType: 'text/html; charset=utf-8' });
  });

  let worker = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'));
  assert.ok(worker.url().startsWith(`chrome-extension://${EXTENSION_ID}/`), 'pinned extension id');

  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto(GMAIL);
  const waitForToast = (pattern) =>
    page.waitForFunction(
      (source) => new RegExp(source).test(document.querySelector('.paper-clipper-toast')?.textContent || ''),
      pattern.source
    );
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  const count = (selector) => page.$eval(`${selector} .paper-clipper-count`, (el) => (el.hidden ? '0' : el.textContent));

  await t.test('buttons appear in the thread and on the opened email', async () => {
    await page.waitForSelector('.paper-clipper-message');
    const labels = await page.$$eval('.paper-clipper-btn', (bs) => bs.map((b) => b.firstChild.nextSibling.textContent));
    assert.deepEqual(labels, ['Verlauf kopieren', 'Verlauf + Anhänge', 'Notiz', 'Kopieren', 'Mit Anhängen']);
  });

  await t.test('Kopieren puts the email on the clipboard and counts it', async () => {
    await page.getByRole('button', { name: /^Kopieren/ }).click();
    await waitForToast(/Mail kopiert/);
    const text = await clipboard();
    assert.match(text, /^Betreff: Re: Angebot Q4\nVon: Max Muster <max@example.org>\n/);
    assert.match(text, /Anhänge: Angebot\.pdf \(3 KB\), Skizze\.png \(3 KB\)/);
    await page.waitForFunction(() => document.querySelector('.paper-clipper-message .paper-clipper-count').textContent === '1');
  });

  await t.test('Verlauf kopieren opens older messages and strips quoted history', async () => {
    await page.getByRole('button', { name: /^Verlauf kopieren/ }).click();
    await waitForToast(/Verlauf \(3 Nachrichten\) kopiert/);
    const text = await clipboard();
    assert.match(text, /^Verlauf: Angebot Q4 \(3 Nachrichten\)/);
    assert.match(text, /\[2\/3\][\s\S]*Kannst du Position 3 noch aufschlüsseln\?/);
    assert.doesNotMatch(text, /schrieb/);
  });

  await t.test('a note is saved in extension storage', async () => {
    await page.getByRole('button', { name: 'Notiz' }).click();
    await page.keyboard.type('Rückruf Montag');
    await page.waitForFunction(() => /Gespeichert/.test(document.querySelector('.paper-clipper-note-status').textContent));
    const stored = await worker.evaluate(() => chrome.storage.local.get('note:18a0000000000001'));
    assert.equal(stored['note:18a0000000000001'].text, 'Rückruf Montag');
    assert.equal(stored['note:18a0000000000001'].subject, 'Angebot Q4');
  });

  await t.test('attachments reach the macOS pasteboard as files', { skip: withHelper ? false : 'needs macOS and a built helper' }, async () => {
    await page.getByRole('button', { name: /^Verlauf \+ Anhänge/ }).click();
    await waitForToast(/\+ 2 Anhänge kopiert/);
    const script = `ObjC.import('AppKit'); const items = $.NSPasteboard.generalPasteboard.pasteboardItems; const out = [];
      for (let i = 0; i < items.count; i++) { const u = items.objectAtIndex(i).stringForType('public.file-url'); if (!u.isNil()) out.push(decodeURIComponent(u.js.split('/').pop())); }
      JSON.stringify(out);`;
    const files = JSON.parse(execFileSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8' }));
    assert.deepEqual(files, ['Angebot Q4 (Verlauf).txt', 'Angebot.pdf', 'Skizze.png']);
  });

  await t.test('an incomplete update on disk is not loaded', async () => {
    const css = path.join(ext, 'src', 'content.css');
    const saved = fs.readFileSync(css);
    fs.rmSync(css);
    try {
      await worker.evaluate(() => reloadIfFilesChanged()); // what the alarm runs every minute
      assert.equal(await worker.evaluate(() => chrome.runtime.id), EXTENSION_ID, 'still running the loaded version');
    } finally {
      fs.writeFileSync(css, saved);
    }
  });

  await t.test('a complete update reloads the extension and takes over the open Gmail tab', async () => {
    const token = await page.evaluate(() => document.documentElement.dataset.paperClipper);
    fs.appendFileSync(path.join(ext, 'src', 'content.js'), '\n// update from main\n');
    const nextWorker = ctx.waitForEvent('serviceworker', { timeout: 30000 });
    worker.evaluate(() => reloadIfFilesChanged()).catch(() => {}); // the worker goes away on reload
    worker = await nextWorker;
    await page.waitForFunction((old) => document.documentElement.dataset.paperClipper !== old, token);
    await page.waitForSelector('.paper-clipper-message');
    assert.equal(await page.$$eval('.paper-clipper-bar', (bars) => bars.length), 2, 'old buttons replaced, not doubled');
    assert.equal(await page.$eval('.paper-clipper-note-field', (el) => el.value), 'Rückruf Montag');

    await page.evaluate(() => navigator.clipboard.writeText(''));
    await page.getByRole('button', { name: /^Kopieren/ }).click();
    await page.waitForFunction(() => navigator.clipboard.readText().then((text) => text.startsWith('Betreff:')), null, { polling: 200 });
    await sleep(200);
    assert.equal(await count('.paper-clipper-message'), '2');
  });

  assert.deepEqual(pageErrors, []);
});
