const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('manifest, package.json and helper share one version', () => {
  const manifest = JSON.parse(read('manifest.json')).version;
  const pkg = JSON.parse(read('package.json')).version;
  const helper = /let version = "([^"]+)"/.exec(read('host/PaperClipperHelper.swift'))[1];
  assert.equal(pkg, manifest);
  assert.equal(helper, manifest);
  assert.match(read('CHANGELOG.md'), new RegExp(`## \\[${manifest.replace(/\./g, '\\.')}\\]`));
});
