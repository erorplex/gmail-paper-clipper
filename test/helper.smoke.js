// End-to-end check of the macOS helper over the native messaging protocol.
// Needs a built helper (./install.sh or `npm run build:helper`) and overwrites the clipboard.
// Run: npm run test:helper
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const HELPER = path.join(__dirname, '..', 'host', 'build', 'paper-clipper-helper');
const skip = process.platform !== 'darwin' ? 'macOS only' : !fs.existsSync(HELPER) ? 'helper not built' : false;

function talk(messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(HELPER);
    let buf = Buffer.alloc(0);
    const replies = [];
    child.stdout.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32LE(0)) {
        const n = buf.readUInt32LE(0);
        replies.push(JSON.parse(buf.subarray(4, 4 + n)));
        buf = buf.subarray(4 + n);
      }
    });
    child.on('error', reject);
    child.on('close', () => resolve(replies));
    for (const m of messages) {
      const body = Buffer.from(typeof m === 'string' ? m : JSON.stringify(m));
      const head = Buffer.alloc(4);
      head.writeUInt32LE(body.length);
      child.stdin.write(Buffer.concat([head, body]));
    }
    child.stdin.end();
  });
}

function pasteboard() {
  const script = `ObjC.import('AppKit');
    const items = $.NSPasteboard.generalPasteboard.pasteboardItems;
    const out = [];
    for (let i = 0; i < items.count; i++) {
      const item = items.objectAtIndex(i);
      const url = item.stringForType('public.file-url');
      out.push(url.isNil() ? 'text:' + item.stringForType('public.utf8-plain-text').js : url.js);
    }
    JSON.stringify(out);`;
  return JSON.parse(execFileSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8' }));
}

const b64 = (s) => Buffer.from(s).toString('base64');

test('helper puts text and every file on the pasteboard', { skip }, async () => {
  const big = Buffer.alloc(20 * 1024 * 1024, 7).toString('base64');
  const replies = await talk([
    { type: 'ping' },
    { type: 'begin' },
    { type: 'file', name: 'Mail.txt', data: b64('Betreff: Test') },
    { type: 'file', name: '../scan.pdf', data: b64('%PDF-1') },
    { type: 'file', name: 'invoice‮fdp.exe', data: b64('MZ') },
    { type: 'file', name: 'big.bin', data: big },
    { type: 'commit', text: 'Betreff: Test' },
    { type: 'nope' },
  ]);
  assert.equal(replies.length, 8);
  assert.equal(replies[0].ok, true);
  assert.equal(replies[6].files, 4);
  assert.deepEqual(replies[7], { ok: false, error: 'unknown message type' });

  const items = pasteboard();
  assert.equal(items[0], 'text:Betreff: Test');
  const files = items.slice(1).map((u) => decodeURIComponent(new URL(u).pathname));
  assert.deepEqual(
    files.map((f) => path.basename(f)),
    ['Mail.txt', 'attachment.._scan.pdf', 'invoicefdp.exe', 'big.bin']
  );
  assert.equal(fs.statSync(files[3]).size, 20 * 1024 * 1024);
  const xattr = execFileSync('xattr', ['-p', 'com.apple.quarantine', files[1]], { encoding: 'utf8' });
  assert.match(xattr, /^[0-9a-f]{4};[0-9a-f]+;/); // quarantined like a browser download
});

test('file before begin is rejected', { skip }, async () => {
  const [reply] = await talk([{ type: 'file', name: 'a.txt', data: b64('x') }]);
  assert.equal(reply.ok, false);
});

test('invalid JSON gets an error reply and the helper keeps going', { skip }, async () => {
  // Chrome serialises a lone surrogate as "\ud800", which Foundation's JSON parser rejects.
  const replies = await talk(['{"type":"ping","x":"\\ud800"}', { type: 'ping' }]);
  assert.equal(replies.length, 2);
  assert.deepEqual(replies[0], { ok: false, error: 'invalid message' });
  assert.equal(replies[1].ok, true);
});
