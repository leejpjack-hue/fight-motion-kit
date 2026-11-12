/* Show-clock, selected clip, and export duration share one composer surface.
 * A path that cannot match the show clock still reports its existing error. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/ui/index.html', 'utf8');
const app = fs.readFileSync('public/ui/app.js', 'utf8');
const exportsSrc = fs.readFileSync('public/ui/exports.js', 'utf8');

function surface() {
  const start = html.indexOf('id="durationLiteracy"');
  const end = html.indexOf('</p>', start);
  assert.ok(start > 0 && end > start, 'duration literacy surface');
  return html.slice(start, end);
}

test('one composer surface names show clock, selected clip, and export duration', () => {
  const row = surface();
  assert.match(row, /id="showClockTotal"/);
  assert.match(row, /id="selectedClipLength"/);
  assert.match(row, /id="exportDuration"/);
  assert.match(row, /Show clock 5\.00s/);
  assert.match(row, /Selected clip 0\.50s/);
  assert.match(row, /Export 5\.00s/);
  assert.equal(html.indexOf('id="durationLiteracy"') < html.indexOf('<section class="timeline-panel"'), true);
  assert.equal((html.match(/id="durationLiteracy"/g) || []).length, 1);
});

test('interrupted record and non-integer frames still fail instead of shortening the bake', () => {
  assert.match(exportsSrc, /if\(visibilityChanged\)throw new Error\('Recording interrupted because the tab was hidden\. Keep this tab visible and retry\.'\)/);
  assert.match(exportsSrc, /if\(document\.hidden\)throw new Error\('Recording needs this tab visible\. Keep this tab visible and retry\.'\)/);
  const record = exportsSrc.slice(exportsSrc.indexOf("on('exportVideo'"));
  assert.ok(record.indexOf('visibilityChanged)throw') < record.indexOf('download('), 'record throws before a short file is saved');
  assert.match(exportsSrc, /const duration=S\.duration;const plan=HMXExport\.framePlan\(duration,preset\.fps\)/);
  assert.doesNotMatch(html, /contact-sheet|contactSheet|bakePop|post-export pop/i);
  assert.equal(/\/api\/compose|api\.teqcon|wrangler deploy|:8770/.test(html + '\n' + app), false);
});
