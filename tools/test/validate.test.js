/*
 * validate.test.js - one rejecting case per validation rule
 * Run all tests from the repo root:   node --test tools/test/
 *
 * The validator script itself is run as a child process (it is a CLI, not
 * a library) against mutated copies of the spine written to a temp dir.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const spine = require('../legal-data/index.js');

// The golden entry every mutation starts from (Catalunya banded seed).
function goldenFigure() {
  return JSON.parse(JSON.stringify(spine.getFigure('itp.catalunya.resale')));
}

/*
 * Run the real validator against a spine containing exactly the given
 * figures, by staging a copy of tools/ in a temp dir with itp.js replaced.
 * Returns { code, out }.
 */
function runValidator(figures, args = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'els-spine-test-'));
  const legalDir = path.join(dir, 'legal-data');
  fs.mkdirSync(legalDir);
  fs.copyFileSync(path.join(REPO, 'tools', 'legal-data', 'index.js'), path.join(legalDir, 'index.js'));
  fs.writeFileSync(
    path.join(legalDir, 'itp.js'),
    'module.exports = ' +
      JSON.stringify({ domain: 'itp', domainLabel: 'test', figures }, null, 2) +
      ';\n'
  );
  fs.copyFileSync(path.join(REPO, 'tools', 'validate-legal-data.js'), path.join(dir, 'validate-legal-data.js'));
  try {
    const out = execFileSync('node', [path.join(dir, 'validate-legal-data.js'), ...args], {
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function expectRejected(fig, fragment) {
  const { code, out } = runValidator([fig]);
  assert.equal(code, 1, `expected exit 1, got ${code}\n${out}`);
  assert.match(out, /REJECTED/);
  assert.ok(out.includes(fig.id || '(figure with no id)'), 'error names the figure id:\n' + out);
  if (fragment) assert.ok(out.includes(fragment), `expected "${fragment}" in:\n` + out);
}

// --- the golden entry passes -----------------------------------------------------

test('the real spine validates clean', () => {
  const { code, out } = runValidator(spine.domains.itp.figures);
  assert.equal(code, 0, out);
  assert.match(out, /spine OK/);
});

// --- one rejecting case per rule ---------------------------------------------------

test('missing source.url is rejected', () => {
  const f = goldenFigure();
  delete f.source.url;
  expectRejected(f, 'source.url');
});

test('http (non-https) source.url is rejected', () => {
  const f = goldenFigure();
  f.source.url = 'http://atc.gencat.cat/ca/tributs/itpajd/';
  expectRejected(f, 'source.url');
});

test('missing source entirely is rejected', () => {
  const f = goldenFigure();
  delete f.source;
  expectRejected(f, 'cannot enter the spine');
});

test('missing note is rejected', () => {
  const f = goldenFigure();
  f.note = '   ';
  expectRejected(f, 'note');
});

test('both value and bands is rejected', () => {
  const f = goldenFigure();
  f.value = 10;
  expectRejected(f, 'exactly one');
});

test('neither value nor bands is rejected', () => {
  const f = goldenFigure();
  delete f.bands;
  delete f.bandType;
  expectRejected(f, 'exactly one');
});

test('non-ascending bands are rejected', () => {
  const f = goldenFigure();
  f.bands[1].upTo = 500000; // below band 1's 600000
  expectRejected(f, 'ascending');
});

test('last band not open-ended is rejected', () => {
  const f = goldenFigure();
  f.bands[f.bands.length - 1].upTo = 9999999;
  expectRejected(f, 'upTo must be null');
});

test('banded figure without bandType is rejected', () => {
  const f = goldenFigure();
  delete f.bandType;
  expectRejected(f, 'bandType');
});

test('reviewBy before effectiveFrom is rejected', () => {
  const f = goldenFigure();
  f.reviewBy = '2020-01-01';
  f.effectiveFrom = '2025-06-27';
  expectRejected(f, 'must be after');
});

test('unknown region is rejected', () => {
  const f = goldenFigure();
  f.region = 'gotham';
  expectRejected(f, 'canonical region list');
});

test('bad status is rejected', () => {
  const f = goldenFigure();
  f.status = 'probably-fine';
  expectRejected(f, 'status');
});

test('id without domain prefix is rejected', () => {
  const f = goldenFigure();
  f.id = 'catalunya.resale';
  expectRejected(f, 'domain prefix');
});

test('duplicate ids are rejected', () => {
  const a = goldenFigure();
  const b = goldenFigure();
  const { code, out } = runValidator([a, b]);
  assert.equal(code, 1, out);
  assert.match(out, /duplicate id/);
});

test('percent value out of range is rejected', () => {
  const f = goldenFigure();
  delete f.bands;
  delete f.bandType;
  f.value = 250;
  expectRejected(f, 'between 0 and 100');
});

// --- the official-source rule -------------------------------------------------------

test("'verified' with a law-firm blog source is rejected", () => {
  const f = goldenFigure();
  f.status = 'verified';
  f.source.url = 'https://some-law-firm-blog.com/itp-rates-2026';
  expectRejected(f, 'official tax-authority');
});

test("'verified' with an official regional source passes", () => {
  const f = goldenFigure();
  f.status = 'verified'; // source is already atc.gencat.cat
  const { code, out } = runValidator([f]);
  assert.equal(code, 0, out);
});

test("'draft' with a secondary source passes but is flagged", () => {
  const f = goldenFigure();
  f.status = 'draft';
  f.source.url = 'https://some-aggregator.com/spain-tax-rates';
  const { code, out } = runValidator([f]);
  assert.equal(code, 0, out);
  assert.match(out, /NON-OFFICIAL SOURCE/);
});

// --- freshness (the guard) ------------------------------------------------------------

test('stale figure: warning on default run, exit 1 under --check', () => {
  const f = goldenFigure();
  f.effectiveFrom = '2019-01-01';
  f.reviewBy = '2020-01-01'; // long past
  const plain = runValidator([f]);
  assert.equal(plain.code, 0, plain.out);
  assert.match(plain.out, /STALE/);
  const check = runValidator([f], ['--check']);
  assert.equal(check.code, 1, check.out);
  assert.match(check.out, /stale figure/);
});

test('--list prints the verification worklist', () => {
  const f = goldenFigure();
  f.status = 'draft'; // the worklist lists drafts; the real spine may have none
  const { code, out } = runValidator([f], ['--list']);
  assert.equal(code, 0, out);
  assert.match(out, /Verification worklist/);
  assert.match(out, /itp\.catalunya\.resale/);
});
