/* HM-PF-46: this browser's export matrix.
 * Playable HTML and PNG frames stay ready.
 * WebM and MP4 are probed. MP4 is not universal.
 * Alpha video is not offered. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const M=require('../public/ui/export-matrix.js');
const X=require('../public/ui/x-export.js');

function row(matrix, id) {return matrix.rows.find(item=>item.id===id);}
function caps(supported, captureStream) {
  const allow=new Set(supported);
  return M.browserCaps({captureStream:captureStream!==false, isTypeSupported:type=>allow.has(type)});
}
function assertNoPromise(text) {
  assert.equal(/universal MP4 export|alpha video works|always exports MP4|transparent MP4 export|every browser records/i.test(text), false);
  const lower=text.toLowerCase();
  let from=0;
  while (from<lower.length) {
    const at=lower.indexOf('universal', from);
    if (at<0) break;
    assert.equal(lower.slice(Math.max(0, at-4), at), 'not ');
    from=at+9;
  }
}

test('HM-PF-46: HTML and frames stay ready when the browser cannot record', ()=>{
  const matrix=M.matrix(caps([], false));
  assert.equal(matrix.kind, 'hm-pf-46-export-honesty');
  assert.equal(matrix.universal_mp4, false);
  assert.equal(matrix.universal_alpha, false);
  assert.equal(matrix.record_mime, '');
  assert.equal(matrix.summary, M.SUMMARY);
  assert.match(matrix.summary, /MP4 is not universal\./);
  assert.match(matrix.summary, /Alpha video is not offered\./);
  assert.equal(row(matrix, 'html').offered, true);
  assert.equal(row(matrix, 'html').scope, 'always');
  assert.equal(row(matrix, 'frames').offered, true);
  assert.equal(row(matrix, 'frames').scope, 'always');
  assert.equal(row(matrix, 'webm').offered, false);
  assert.equal(row(matrix, 'mp4').offered, false);
  assert.equal(row(matrix, 'alpha').offered, false);
  assert.equal(row(matrix, 'alpha').scope, 'never');
  assert.equal(row(matrix, 'frames').note.includes('white stage fill'), true);
  matrix.rows.forEach(item=>assertNoPromise(item.note+' '+matrix.summary));
});

test('HM-PF-46: WebM is preferred, MP4 stays this-browser, alpha MIME is still refused', ()=>{
  const both=M.matrix(caps(['video/webm;codecs=vp9', 'video/mp4', 'video/webm;codecs=vp9,alpha']));
  assert.equal(both.record_mime, 'video/webm;codecs=vp9');
  assert.equal(row(both, 'webm').offered, true);
  assert.equal(row(both, 'webm').here, 'This browser');
  assert.equal(row(both, 'mp4').offered, true);
  assert.equal(row(both, 'mp4').here, 'This browser only');
  assert.match(row(both, 'mp4').note, /prefers WebM/);
  assert.match(row(both, 'mp4').note, /MP4 is not universal\./);
  assert.equal(row(both, 'alpha').offered, false);
  assert.match(row(both, 'alpha').note, /reports video\/webm;codecs=vp9,alpha/);
  assert.match(row(both, 'alpha').note, /Alpha video is not offered\./);
  assert.equal(both.record_mime.includes('alpha'), false);

  const mp4Only=M.matrix(caps(['video/mp4']));
  assert.equal(mp4Only.record_mime, 'video/mp4');
  assert.equal(row(mp4Only, 'webm').offered, false);
  assert.match(row(mp4Only, 'mp4').note, /this browser only/);
  assert.match(row(mp4Only, 'mp4').note, /MP4 is not universal\./);

  const mimeWithoutCanvas=M.matrix(caps(['video/webm;codecs=vp9', 'video/mp4'], false));
  assert.equal(mimeWithoutCanvas.record_mime, '');
  assert.equal(row(mimeWithoutCanvas, 'webm').offered, false);
  assert.equal(row(mimeWithoutCanvas, 'mp4').offered, false);
  assert.equal(row(mimeWithoutCanvas, 'html').offered, true);
  assert.equal(row(mimeWithoutCanvas, 'frames').offered, true);
});

test('HM-PF-46: five-second demo frame zip and standalone HTML markers stay in place', ()=>{
  const show=JSON.parse(fs.readFileSync('public/shows/daiyu-wang-five-seconds.json', 'utf8'));
  assert.equal(show.show_id, 'daiyu-wang-five-seconds');
  assert.equal(show.atoms.length, 8);
  const duration=show.atoms.reduce((sum, atom)=>sum+atom.duration_s, 0);
  assert.equal(duration, 5);
  const plan=X.framePlan(duration, 30);
  assert.equal(plan.length, 150);
  assert.equal(plan[0].file, 'frames/000000.png');
  assert.equal(plan[0].t, 0);
  assert.equal(plan[149].file, 'frames/000149.png');
  assert.equal(plan[149].t, 149/30);
  const frames=X.framePlan(0.1, 30);
  const doc=X.timingDocument({showId:show.show_id, preset:X.presetById('720p30'), durationS:0.1, frames});
  assert.equal(doc.encode, 'local-skill');
  assert.equal(doc.ffmpeg.where, 'local-skill');
  assert.equal(doc.honesty, X.HONESTY);
  assert.equal(doc.ffmpeg.argv.includes('libvpx'), true);
  assert.equal(doc.ffmpeg.argv.includes('mp4'), false);
  const png=Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const zip=X.zipStore([{name:'timing.json', data:new TextEncoder().encode(JSON.stringify(doc))}, ...frames.map(frame=>({name:frame.file, data:png}))]);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-46-'));
  const file=path.join(dir, 'frames.zip');
  fs.writeFileSync(file, zip);
  const out=execFileSync('python3', ['-c', `
import json,sys,zipfile
z=zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
assert z.namelist()==['timing.json','frames/000000.png','frames/000001.png','frames/000002.png']
doc=json.loads(z.read('timing.json'))
assert doc['show_id']=='daiyu-wang-five-seconds'
assert doc['encode']=='local-skill'
assert 'mp4' not in doc['ffmpeg']['argv']
assert 'alpha' not in doc['honesty'].lower()
print('ok')
`, file], {encoding:'utf8'});
  assert.match(out, /ok/);

  const exportsSrc=fs.readFileSync('public/ui/exports.js', 'utf8');
  const page=fs.readFileSync('public/ui/index.html', 'utf8');
  const renderer=fs.readFileSync('public/ui/motion-renderer.js', 'utf8');
  const preset=fs.readFileSync('public/ui/x-export.js', 'utf8');
  assert.match(exportsSrc, /function standalonePlayer/);
  assert.match(exportsSrc, /window\.renderAt=/);
  assert.match(exportsSrc, /source:'standalone-player'/);
  assert.match(exportsSrc, /Plays offline/);
  assert.match(exportsSrc, /on\('exportHtml'/);
  assert.match(exportsSrc, /on\('exportFrames'/);
  assert.match(exportsSrc, /HMXExport\.framePlan/);
  assert.match(exportsSrc, /HMExportMatrix\.matrix\(exportCaps\(\)\)/);
  assert.match(page, /id="exportMatrix"/);
  assert.match(page, /id="exportHtml"/);
  assert.match(page, /id="exportFrames"/);
  assert.match(page, /export-matrix\.js/);
  assert.match(renderer, /ctx\.fillStyle = '#ffffff'; ctx\.fillRect\(0, 0, 1280, 720\)/);
  assert.equal(preset.includes('HM-PF-46'), false);
  assert.equal(preset.includes('exportMatrix'), false);
  assert.equal(X.HONESTY, 'Real-time Record still needs this tab visible. Deterministic ffmpeg stays on the local skill.');
  const joined=[exportsSrc, page, fs.readFileSync('public/ui/export-matrix.js', 'utf8')].join('\n');
  assert.equal(/\/api\/compose|api\.teqcon|wrangler deploy|:8770/.test(joined), false);
  assertNoPromise(M.SUMMARY);
});
