# Companion notes for HTML Motion product-design approval boards

Date: 2026-11-08
Deliverables directory: `/workspace/deliverables/hm-approval-boards-2026-11-08`
Validation receipt: `/workspace/deliverables/hm-approval-boards-2026-11-08/validation-receipt.json`
Model pin: `opencode-go/gemini-4-argon`

## 1. Authoritative source pins and approval boundary

These two DiagramTool v3.0 portable boards support the HTML Motion product-design APPROVAL Page. They map design ownership, research surfaces, and creation workflow steps without claiming that every slice is shipped in production. No product code, repository state, or pull request was modified, and no story was signed (`SIGN`).

The boards cite the following pinned revisions and workspace briefs:

- **DiagramTool repository checkout**: `/workspace/repos/diagram-tool` at Git SHA `3dd1658e8fa0aaab9501f661f85b38271509eddd` (portable board format `"3.0"` in `docs/board-format.md` and `docs/board-format.schema.json`).
- **HTML Motion (`fight-motion-kit`) authoritative `main` pin**: Git SHA `8219598c2749daeeb3719840087964422ba46fa2` (`https://github.com/leejpjack-hue/fight-motion-kit/blob/8219598c2749daeeb3719840087964422ba46fa2/`).
- **HTML Motion `HM-SG-01` feature branch pin**: Git SHA `a066fb9ed3b22e8e5732fcf1e8220506696762e8` on `codex/hm-sg01-20261107-1441` (`/workspace/repos/fight-motion-kit-sg01-20261107-1441` and `/workspace/hr/briefs/hm-sg01-final-evidence-2026-11-07.md`). Browser tests were skipped at push time, and staged strips remain gated `NOT PLAYABLE` until `HM-SG-02` is separately signed, implemented, verified, and shipped.
- **HTML Motion local checkout drift notice**: `/workspace/repos/fight-motion-kit` is at `97428ee5882034f548e14a71a93692f2c503f191` and has drifted from `8219598c2749daeeb3719840087964422ba46fa2`. All shipped claims cite `8219598c2749daeeb3719840087964422ba46fa2`.
- **`sprite-gen` authoritative upstream pin**: Git SHA `6a3f4c47d7f8745853cc06fe66b252636976a442` (`https://github.com/aldegad/sprite-gen/blob/6a3f4c47d7f8745853cc06fe66b252636976a442/`).
- **`pixelfx` fork pin**: Git SHA `679844a6e45b7dbdc4b3d1f76f2dd0fdcc2bc892` (`https://github.com/leejpjack-hue/pixelfx/blob/679844a6e45b7dbdc4b3d1f76f2dd0fdcc2bc892/`).

## 2. Board 1 (`architecture.board.json` and `architecture.dsl`) role swimlanes and research surfaces

Board 1 (`mode: "architecture"`, `direction: LR`, `edges: orthogonal`) organizes `18` pinned architecture components (`17` services and `1` database) into `6` non-overlapping horizontal `group` bands (`x = 50`, `width = 1260`, `height = 165`, spaced vertically at `y = 130, 320, 510, 700, 890, 1080`) plus `3` top sticky-note callouts (`y = 10`).

### Swimlane 1: `PO — product / ~50 stories` (`Lane1POProduct`, `#0284c7`)

- **`PO Product Backlog and 50 Stories` (`po_product_backlog_and_50_stories`, `at: 80, 175`)**: Represents Product Owner backlog governance across roughly 50 HTML Motion stories under the `<= 3` signed stories per repo per day cap (`/workspace/hr/PEOPLE.md`, `/workspace/hr/briefs/po-routines-ownership-2026-10-29.md`).
- **`PO camera-grammar and Storyboard Specs` (`po_camera_grammar_and_storyboard_specs`, `at: 500, 175`)**: Reuses the `camera-grammar` research surface (`/workspace/hr/html-motion/templates/fight-camera-grammar-template-2026-11-01.md`, `/workspace/hr/briefs/cloudagent-hm-cam-grammar-starter-2026-11-01.md`) and Cantonese 10s and 30s storyboard specifications.
- **`PO sprite-gen and IMPACT Scope Gates` (`po_sprite_gen_and_impact_scope_gates`, `at: 920, 175`)**: Holds PO scope and approval gates for `sprite-gen` (`HM-SG-00` through `HM-SG-04` in `/workspace/hr/briefs/sprite-gen-html-motion-2026-11-07.md`) and `IMPACT / COMPOSER-FX` (`/workspace/hr/briefs/cloudagent-hm-pixelfx-impact-wave1-2026-11-01.md`, `/workspace/hr/briefs/cloudagent-hm-pixelfx-composer-fx-2026-11-02.md`).

### Swimlane 2: `Cursor  overall architecture` (`Lane2CursorArchitecture`, `#2563eb`)

- **`Cursor Overall Architecture Contract` (`cursor_overall_architecture_contract`, `at: 80, 365`)**: Owns the browser-only static frontend boundary (`docs/FRONTEND-ONLY-2026-10-23.md`, `docs/CODING-CURSOR-AGENT-2026-10-23.md`), prohibiting any compose, generation, save, or upload HTTP backend.
- **`Cursor Show Atom and Pose Schemas` (`cursor_show_atom_and_pose_schemas`, `at: 500, 365`)**: Owns `kit/schema/show.schema.json`, `kit/schema/atom.schema.json`, and `kit/schema/pose_library.schema.json` across `{ show, layouts, media, assets }`.
- **`Cursor IndexedDB and Portable .motion.json` (`cursor_indexeddb_and_portable__motion_json`, `at: 920, 365`)**: Owns local browser IndexedDB persistence (`public/ui/asset-store.js`, store `html-motion-studio/projects`) and portable `.motion.json` serialization and reopen (`public/ui/exports.js#L36-L55`, `public/ui/app.js#L98-L112`).

### Swimlane 3: `Codex — UI` (`Lane3CodexUI`, `#15803d`)

- **`Codex UI Studio Shell and Inspector` (`codex_ui_studio_shell_and_inspector`, `at: 80, 555`)**: Owns the HTML Motion Studio shell (`public/ui/app.js`, `public/ui/index.html`) and timeline JSON inspector (`HM-HF-07`, issue `#56`).
- **`Codex UI Scrub Peek and Catalog Controls` (`codex_ui_scrub_peek_and_catalog_controls`, `at: 500, 555`)**: Owns frame peek (`HM-HF-01`, issue `#46`), seekable preview scrub (`HM-HF-02`, issue `#47`), show JSON lint (`HM-HF-03`, issue `#48`), and catalog query (`HM-HF-05`, issue `#54`).
- **`Codex UI sprite-gen SG-01 Staged Picker` (`codex_ui_sprite_gen_sg_01_staged_picker`, `at: 920, 555`)**: Reuses the `sprite-gen` surface for `HM-SG-01` (`public/ui/project-media.js` on `codex/hm-sg01-20261107-1441` at `a066fb9e`), staging one `.strip.png` (`<= 32 MiB`) and one `.strip.json` (`<= 256 KiB`) with `cell_record` SHA-256 verification. Explicitly labeled `SIGNED/GATED` and `NOT PLAYABLE` until `HM-SG-02` is separately signed, implemented, verified, and shipped.

### Swimlane 4: `ZCode — effect / cam move / impact logic` (`Lane4ZCodeLogic`, `#7c3aed`)

- **`ZCode camera-grammar and Cam Move Logic` (`zcode_camera_grammar_and_cam_move_logic`, `at: 80, 745`)**: Reuses `camera-grammar` (`kit/templates/fight-cam-grammar-starter.json`, `HM-CAM-10R`, `HM-CAM-CHAIN`, `HM-PAN-SPAN-UI`) for camera preset curves (`low_rise`, `eye_hold`, `ots_L_hold`, `eye_push`, `ots_R_hold`, `ecu_jitter`, `eye_lateral`, `whip_A_to_B`, `pull_aftermath`, `eye_orbit`).
- **`ZCode IMPACT / COMPOSER-FX Runtime` (`zcode_impact___composer_fx_runtime`, `at: 500, 745`)**: Reuses `IMPACT / COMPOSER-FX` (`public/vendor/pixelfx/wave1.js`, `kit/presets/pixelfx_wave1.json`, `HM-PIXELFX-IMPACT-WAVE1`, `HM-PIXELFX-COMPOSER-FX`, `HM-FX-COMIC-PROFILE`, `HM-FX-LOC-SIZE`) wiring the 12 Wave 1 impact effects onto `fx_hooks`.
- **`ZCode Rhythm Beat Blocks and Cut Logic` (`zcode_rhythm_beat_blocks_and_cut_logic`, `at: 920, 745`)**: Owns beat block registry (`HM-HF-04`, `kit/blocks/beat_blocks.json`) and cut transition block pack (`HM-HF-08`, `/workspace/hr/briefs/hm-hf-08-peel-cut-transitions-2026-11-05.md`).

### Swimlane 5: `Antigravity — overflow` (`Lane5AntigravityOverflow`, `#d97706`)

- **`Antigravity Overflow character/OpenPose Prep` (`antigravity_overflow_character_openpose_prep`, `at: 80, 935`)**: Reuses the `character/OpenPose` research surface (`/workspace/hr/briefs/hm-10s-openpose-kicks-2026-11-01.md`, `/workspace/hr/html-motion/prompting/2026-11-01-locked/JOINT-GEOMETRY.md`) for OpenPose and DWPose skeleton plates and joint-geometry constraints.
- **`Antigravity External sprite-gen Prep` (`antigravity_external_sprite_gen_prep`, `at: 500, 935`)**: Reuses external `sprite-gen` (`6a3f4c47`, CPython 3.11+, Pillow, NumPy, `ffmpeg`, optional RIFE) running outside HTML Motion.
- **`Antigravity Overflow SG-02/03 and Frame QA` (`antigravity_overflow_sg_02_03_and_frame_qa`, `at: 920, 935`)**: Holds `DESIGNED (NOT SIGNED)` overflow slices (`HM-SG-02` deterministic clip playback, `HM-SG-03` optional native atlas `manifest.json` adapter, and `HM-SG-04` comparative motion QA) plus capscreen verification (`/workspace/hr/PEOPLE.md`).

### Swimlane 6: `HTML Motion bot — compose / bake` (`Lane6HMBotComposeBake`, `#0f766e`)

- **`HTML Motion Bot Compose Pipeline` (`html_motion_bot_compose_pipeline`, `at: 80, 1125`)**: Owns show compilation (`public/ui/compose-client.js#L1183-L1193`) alongside the agent skill scripts in `skills/html-motion-composer/scripts/build-project.cjs`.
- **`HTML Motion Shared Canvas Renderer` (`html_motion_shared_canvas_renderer`, `at: 500, 1125`)**: Owns deterministic 1280x720 stage rendering (`public/ui/motion-renderer.js#L405-L509`) and `sampleStageFrameAt` (`public/ui/app.js#L974-L983`).
- **`HTML Motion Local Bake HTML PNG Video` (`html_motion_local_bake_html_png_video`, `at: 920, 1125`)**: Owns standalone playable HTML (`window.renderAt`), lossless PNG frame sequence export, and browser `captureStream` / `MediaRecorder` video bake (`public/ui/exports.js#L87-L166`) alongside `skills/html-motion-composer/scripts/export-project.cjs` and `frame-qa.cjs`.

## 3. Board 2 (`workflow.board.json` and `workflow.dsl`) exact 1..10 dual-path creation workflow

Board 2 (`mode: "flow"`, `direction: TB`, `showStepNumbers: true`) models Jack's exact 10-step creation order across two pinned vertical columns (`x = 100` for Steps 1..5, `x = 680` for Steps 6..10, `y = 160..800`) with `3` top sticky-note callouts (`y = 10`). Every step is declared with explicit `type: process` before edges, with `start Step1CharacterCreation` on Step 1 and `end Step10Voice` on Step 10, so DiagramTool's `flowStepNumbers()` assigns exact badge numbers `1..10` and `identifyDecisionNodes()` does not coerce any step into a decision diamond.

Each step enforces the dual-path design rule: users view and edit the artifact inside the HTML Motion UI while AI-agent skills sit beside human editing as an assistive path rather than replacing human control.

| Step # | Node ID | Exact Label | Pinned `(x, y)` | HM UI Human Edit Surface | Beside AI-Agent Skill Surface | Approval & Shipped Caveats |
|---|---|---|---|---|---|---|
| `1` | `step1charactercreation` | `1 Character creation` | `(100, 160)` | Plate and character asset picker, costume-lock inspection, pose reference cards in HM UI | `character/OpenPose` skeleton generator (`hm-10s-openpose-kicks-2026-11-01.md`, `JOINT-GEOMETRY.md`, `pose_library.schema.json`) | Grok `GenerateImage` has no native ControlNet; OpenPose skeleton plates are staged as reference images. |
| `2` | `step2story` | `2 Story` | `(100, 320)` | Atom sequence editor and `HM-HF-07` timeline JSON inspector (`#56`) over `show.schema.json` | Cantonese 10s and 30s storyboard drafting skill (`html-motion-fight-video.SKILL.md`) | Storyboard text and costume locks require human review before plate generation. |
| `3` | `step3rhythm` | `3 Rhythm` | `(100, 480)` | Per-atom `duration_s` controls, `HM-HF-01` frame peek (`#46`), `HM-HF-02` seekable scrub (`#47`), `HM-HF-04` `beat_blocks.json` | Rhythm lint (`#39`) and agent frame-QA loop (`HM-HF-06` `frame-qa.cjs`, `#58`/`#59`) | Sub-frame `.1s` storyboard beats do not map to integer frames at 24fps (`sprite-gen-html-motion-2026-11-07.md`). |
| `4` | `step4scenecamshotDesign` | `4 Scene cam-shot design` | `(100, 640)` | Templates picker (`fight-cam-grammar-starter.json`) and `HM-HF-08` cut transition blocks (`#61`/`#62`) in HM UI | `camera-grammar` triplet planner (`Wide` open/re-establish + `Intent -> Action -> Reaction` triplets) | Uses existing tip camera presets without inventing unverified `wide_*` curve primitives. |
| `5` | `step5perscenecamshots` | `5 Per-scene cam shots` | `(100, 800)` | Per-atom `camera.preset`, `HM-CAM-10R` fit chips, `HM-PAN-SPAN-UI`, and `HM-CAM-CHAIN` controls in HM UI | AI camera-preset tuning and hook-alignment skill (`build-project.cjs`) | Camera curves evaluate deterministically through `motion-renderer.js`. |
| `6` | `step6spritegen` | `6 Sprite gen` | `(680, 160)` | Local File API staged strip picker (`HM-SG-01` `project-media.js`) and state/timing provenance viewer in HM UI | External `sprite-gen` CLI (`6a3f4c47`, optional RIFE) producing `.strip.png` + `.strip.json` or native `manifest.json` atlas | External `sprite-gen` is never embedded in HM. `HM-SG-01` (`a066fb9e`) is staged-only and gated `NOT PLAYABLE` until `HM-SG-02` is separately signed, implemented, verified, and shipped. Final `once`/`once-return`/`one-shot` sidecars carry `root_motion` and are rejected under `HM-SG-01`. No cleared real assets exist in cited evidence (`Visual Quality: INSUFFICIENT`). |
| `7` | `step7backgroundscene` | `7 Background scene` | `(680, 320)` | Background plate selector, `HM-BG-CROP`, `HM-BG-PAN-CONT`, `HM-BG-SPAN-UI`, and `HM-PARALLAX-DEFAULT-HONESTY` controls in HM UI | AI background plate framing and continuity skill | Static browser frontend only; all background plates are stored locally in IndexedDB and `.motion.json`. |
| `8` | `step8foreground` | `8 Foreground` | `(680, 480)` | Foreground actor cutout placement (`HM-COMPOSE-FG`, `HM-FG-BROKEN-CUTOUT`, `floor_y` / `body_h` anchor) and `IMPACT / COMPOSER-FX` (`pixelfx` Wave 1) chip picker in HM UI | `rembg` cutout prep and AI `fx_hooks` selector over `kit/presets/pixelfx_wave1.json` (12 Wave 1 impacts) | Standing-height floor anchor (`scale = H / body_h`, `top = floor_y - h * scale`) for sprite strips belongs to `HM-SG-02` (`DESIGNED, NOT SIGNED`). |
| `9` | `step9hmcompose` | `9 HTML Motion cam-shot compose` | `(680, 640)` | Interactive HM Studio compose and 1280x720 canvas preview (`compose-client.js`, `motion-renderer.js`, `sampleStageFrameAt`, `.motion.json` save/reopen) | `skills/html-motion-composer` (`build-project.cjs`, `frame-qa.cjs`) | Merely attaching sprite metadata to `media` or `layouts` does not animate strips in `compose-client.js` until `HM-SG-02` is signed and shipped. |
| `10` | `step10voice` | `10 Voice` | `(680, 800)` | Dialogue hold and voice cue timing alignment (`HM-DIALOGUE-HOLD`) plus local HTML, PNG, and video bake (`exports.js`) in HM UI | AI dialogue/voice cue timing alignment and `export-project.cjs` bake helper | Voice and audio cue alignment is an APPROVAL/design workflow step; `pixelfx` Wave 1 explicitly excludes SFX/audio, and browser `MediaRecorder` video output is MIME capability-dependent (not universal MP4 or alpha video). |

## 4. Technical and product caveats

1. **Approval design vs shipped runtime**: Both boards represent Jack's locked product-design architecture and 1..10 workflow for the APPROVAL Page. They do not authorize unsigned stories or claim that `HM-SG-02`, `HM-SG-03`, `HM-SG-04`, or full voice track synthesis are shipped on `fight-motion-kit` `main` (`8219598c`).
2. **Why native DSL with explicit pins was used over `type-to-flow` heuristics**: DiagramTool's static `type-to-flow` seed converter (`skills/type-to-flow/scripts/type-to-flow.js` v1.0.0) is a linear text heuristic that cannot emit `system:` dual-path captions, `role:` chips, `note:` annotations, or 2-column `at: x, y` pins, and `DiagramCanvas.tsx` stacks unpinned flow nodes into a single vertical column (`x = 400`). Authoring native `diagram: architecture` and `diagram: flow` DSL with explicit `at:` pins guarantees zero layout drift (`layoutDeltaPx: 0`) across portable v3.0 import and reopen.
3. **No live browser proof claimed**: `exportedAt` (`"2026-11-08T00:00:00.000Z"`) in `architecture.board.json` and `workflow.board.json` is deterministic local generator metadata required by `board-format.schema.json`, not a live browser GUI export receipt.
