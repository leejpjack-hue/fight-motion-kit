/* Rebuild static players with the same browser composer; no Python render backend. */
const fs = require('node:fs');
const path = require('node:path');
require('../public/ui/compose-client.js');
const root = path.resolve(__dirname, '../public');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
(async () => {
  for (const id of ['daiyu-wang-five-seconds', 'daiyu-wang-ten-seconds', 'daiyu-wang-codex-import']) {
    const show = read('shows/' + id + '.json');
    const result = await HMComposeClient.composeShow(show, {
      cameraPresets: read('presets/camera_presets.json'), fxPresets: read('presets/fx_presets.json'),
      loadJson: async p => {
        const layout = read(p);
        if (id === 'daiyu-wang-codex-import') for (const l of Object.values(layout)) {if(l.full)l.full=l.full.replace(/(plates\/[^/]+)\.png$/, '$1.jpg');for (const part of l.parts || []) part.src = part.src.replace(/(cutout\/[^/]+)\.png$/, '$1.webp');}
        return layout;
      },
    });
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const dir = path.join(root, 'out', id); fs.mkdirSync(dir, { recursive: true });
    for (const key of ['timeline', 'layout']) fs.writeFileSync(path.join(dir, key + '.json'), JSON.stringify(result[key], null, 2) + '\n');
    console.log(`${id}: ${result.duration_s}s, ${result.stats.plates} plates`);
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
