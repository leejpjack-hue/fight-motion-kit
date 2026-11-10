# HM-PF-49 skill invoke

Local assist HTTP in front of kit scripts that already exist. n8n still only orders gates. This is not a compose, save, or upload API. It does not write `public/shows/baijia-elfmage-void-array.json`.

The server is `ops/n8n/skill-invoke/server.cjs`. It listens on `HM_SKILL_PORT` (default 8787). The workflow HTTP nodes call `http://172.18.0.1:8787/skills/...`, the compose-network gateway for the running n8n container on this host. `HM_EXPORT_FPS` defaults to 24. `HM_PACK_DIR`, when set, is the root that holds the real `layout.json` and `cutout/` files. Those files stay out of git.

| Step | Route | What it actually does |
|---|---|---|
| 1 | `/skills/character-openpose` | Reads the existing cast names. No lock-pack CLI. `ok: false`. |
| 2 | `/skills/storyboard-draft` | No approved board file. Does not emit a new board. `ok: false`. |
| 3 | `/skills/rhythm-frame-qa` | `rhythm.cjs` needs a human GO. GO is not manufactured. `ok: false`. |
| 4 | `/skills/cam-grammar-plan` | `grammar.cjs` needs an approved camera-input file. `ok: false`. |
| 5 | `/skills/cam-preset-tune` | `author.cjs` needs the step-4 grammar. `ok: false`. |
| 6 | `/skills/sprite-gen-cli` | No strip PNG/JSON. SG-01 stays NOT PLAYABLE. `ok: false`. |
| 7 | `/skills/bg-frame` | Runs `hm-bg-scene-author`. The pack already has motion, so the tool refuses. Source show unchanged. |
| 8 | `/skills/fg-fx` | Foreground skill is a stub with no script. `ok: false`. |
| 9 | `/skills/hm-composer-assist` | Binds `HM_PACK_DIR` or the checkout asset dir. If the layout is still the `board-slate.png` stub, or hero cutouts are missing, returns `ok: false` and does not encode. When the real cutouts are present, runs `build-project.cjs` then `export-project.cjs` as a 30s 1280×720 24fps H.264 MP4 with `+faststart`. |
| 10 | none | Voice HOLD stays disabled and unwired. |

`SHOW-PLACEHOLDER` resolves to `baijia-elfmage-void-array` because that is the only pack this server reads. Any other show id is refused.
