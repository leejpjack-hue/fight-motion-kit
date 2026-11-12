const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/ui/index.html', 'utf8');
const css = fs.readFileSync('public/ui/styles.css', 'utf8');
const app = fs.readFileSync('public/ui/app.js', 'utf8');

test('first path names open, watch, edit, export, and playable HTML', () => {
  const nav = html.match(/<nav id="firstPath"[\s\S]*?<\/nav>/);
  assert.ok(nav, 'first path nav');
  const steps = ['Open demo', 'Watch', 'Edit one beat', 'Export', 'Playable HTML'];
  for (const label of steps) assert.match(nav[0], new RegExp(label));
  assert.match(nav[0], /id="firstPathFilm"/);
  assert.match(nav[0], /data-first-path="html"/);
  assert.equal(html.indexOf('id="firstPath"') < html.indexOf('id="abContainer"'), true);
});

test('advanced composer surfaces stay in the page', () => {
  for (const id of ['backgroundMotionDetails', 'foregroundPanel', 'pf09GatePanel', 'hmBoardSurface', 'openMarketSpritegenProof', 'importStrip', 'exportHtml', 'exportHonesty']) {
    assert.equal(html.includes('id="' + id + '"'), true, id);
  }
});

test('first open reads the teaching film before advanced panels', () => {
  assert.match(css, /\.library>\.library-bottom\{order:2\}/);
  assert.match(css, /\.library>\.background-panel,\.library>#foregroundPanel\{order:5\}/);
  assert.match(css, /\.timeline-panel>\.timeline-scroll[^{]*\{order:1\}/);
  assert.match(css, /\.timeline-panel>#pf09GatePanel[^{]*\{order:2\}/);
  assert.match(css, /\.inspector>#catalogQuery\{order:3\}/);
  assert.match(app, /show_id === DEMO/);
  assert.match(app, /5\.00s eight-plate teaching film/);
  assert.doesNotMatch(app, /fetch\(['"]\/api/);
});
