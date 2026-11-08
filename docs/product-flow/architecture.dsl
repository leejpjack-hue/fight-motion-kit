# @type-parts
# 1. PO Product Backlog and 50 Stories (user) -> Cursor Overall Architecture Contract: 1. PO specs -> Cursor architecture
# PO Product Backlog and 50 Stories (user) -> PO camera-grammar and Storyboard Specs: prioritize ~50 HM stories
# PO camera-grammar and Storyboard Specs -> PO sprite-gen and IMPACT Scope Gates: lock grammar & SG/FX gates
# 2. Cursor Overall Architecture Contract -> Codex UI Studio Shell and Inspector: 2. schema & boundaries -> Codex UI
# Cursor Overall Architecture Contract -> Cursor Show Atom and Pose Schemas: frontend-only static boundaries
# Cursor Show Atom and Pose Schemas -> Cursor IndexedDB and Portable .motion.json (db): {show,layouts,media,assets} contract
# 3. Codex UI Studio Shell and Inspector -> ZCode camera-grammar and Cam Move Logic: 3. UI hooks -> ZCode cam/FX logic
# Codex UI Studio Shell and Inspector -> Codex UI Scrub Peek and Catalog Controls: mount timeline, peek & scrub
# Codex UI Scrub Peek and Catalog Controls -> Codex UI sprite-gen SG-01 Staged Picker: local File API stage (NOT PLAYABLE)
# 4. ZCode camera-grammar and Cam Move Logic -> Antigravity Overflow character/OpenPose Prep: 4. overflow & OpenPose/sprite prep
# ZCode camera-grammar and Cam Move Logic -> ZCode IMPACT / COMPOSER-FX Runtime: cam presets + fx_hooks
# ZCode IMPACT / COMPOSER-FX Runtime -> ZCode Rhythm Beat Blocks and Cut Logic: Wave 1 impacts + cut transitions
# 5. Antigravity Overflow character/OpenPose Prep -> HTML Motion Bot Compose Pipeline: 5. local assets -> HM bot compose
# Antigravity Overflow character/OpenPose Prep -> Antigravity External sprite-gen Prep (tool): skeleton poses -> external strip prep
# Antigravity External sprite-gen Prep (tool) -> Antigravity Overflow SG-02/03 and Frame QA: DESIGNED SG-02/03 & capscreen QA
# HTML Motion Bot Compose Pipeline -> HTML Motion Shared Canvas Renderer: composeShow timeline & plates
# 6. HTML Motion Shared Canvas Renderer -> HTML Motion Local Bake HTML PNG Video: 6. bake standalone HTML, PNG & video
# inside Lane1POProduct: PO Product Backlog and 50 Stories (user), PO camera-grammar and Storyboard Specs, PO sprite-gen and IMPACT Scope Gates
# inside Lane2CursorArchitecture: Cursor Overall Architecture Contract, Cursor Show Atom and Pose Schemas, Cursor IndexedDB and Portable .motion.json (db)
# inside Lane3CodexUI: Codex UI Studio Shell and Inspector, Codex UI Scrub Peek and Catalog Controls, Codex UI sprite-gen SG-01 Staged Picker
# inside Lane4ZCodeLogic: ZCode camera-grammar and Cam Move Logic, ZCode IMPACT / COMPOSER-FX Runtime, ZCode Rhythm Beat Blocks and Cut Logic
# inside Lane5AntigravityOverflow: Antigravity Overflow character/OpenPose Prep, Antigravity External sprite-gen Prep (tool), Antigravity Overflow SG-02/03 and Frame QA
# inside Lane6HMBotComposeBake: HTML Motion Bot Compose Pipeline, HTML Motion Shared Canvas Renderer, HTML Motion Local Bake HTML PNG Video
# @type-parts-end
diagram: architecture
title: "HTML Motion Product-Design APPROVAL Architecture — 6 Locked Role Swimlanes (Design Ownership, Not All Shipped)"
direction: LR
edges: orthogonal

# ============================================================================
# SWIMLANE 1: PO — product / ~50 stories [APPROVAL / Design Ownership]
# ============================================================================
service "PO Product Backlog and 50 Stories" {
  type: api
  tech: "APPROVAL | PO — product / ~50 stories (<=3/day cap)"
  icon: "👤"
  color: "#0284c7"
  at: 80, 175
}

service "PO camera-grammar and Storyboard Specs" {
  type: microservice
  tech: "RESEARCH/SHIPPED | camera-grammar + 10s/30s specs"
  color: "#0284c7"
  at: 500, 175
}

service "PO sprite-gen and IMPACT Scope Gates" {
  type: microservice
  tech: "APPROVAL GATE | sprite-gen SG-00..04 + IMPACT / COMPOSER-FX"
  color: "#0284c7"
  at: 920, 175
}

# ============================================================================
# SWIMLANE 2: Cursor  overall architecture [APPROVAL / Design Ownership]
# ============================================================================
service "Cursor Overall Architecture Contract" {
  type: api
  tech: "APPROVAL/SHIPPED | Cursor  overall architecture (8219598c)"
  color: "#2563eb"
  at: 80, 365
}

service "Cursor Show Atom and Pose Schemas" {
  type: microservice
  tech: "SHIPPED/DESIGN | show/atom/pose_library.schema.json"
  color: "#2563eb"
  at: 500, 365
}

database "Cursor IndexedDB and Portable .motion.json" {
  type: "SHIPPED | asset-store.js + exports.js"
  data: "html-motion-studio/projects, .motion.json"
  color: "#2563eb"
  at: 920, 365
}

# ============================================================================
# SWIMLANE 3: Codex — UI [APPROVAL / Design Ownership]
# ============================================================================
service "Codex UI Studio Shell and Inspector" {
  type: api
  tech: "SHIPPED/DESIGN | Codex — UI (app.js, index.html, HF-07)"
  color: "#15803d"
  at: 80, 555
}

service "Codex UI Scrub Peek and Catalog Controls" {
  type: microservice
  tech: "SHIPPED | HM-HF-01 peek (#46) + HF-02 scrub (#47) + HF-05"
  color: "#15803d"
  at: 500, 555
}

service "Codex UI sprite-gen SG-01 Staged Picker" {
  type: microservice
  tech: "SIGNED/GATED | sprite-gen SG-01 (NOT PLAYABLE until SG-02)"
  color: "#d97706"
  at: 920, 555
}

# ============================================================================
# SWIMLANE 4: ZCode — effect / cam move / impact logic [APPROVAL / Design Ownership]
# ============================================================================
service "ZCode camera-grammar and Cam Move Logic" {
  type: microservice
  tech: "RESEARCH/SHIPPED | ZCode — effect / cam move / impact logic"
  color: "#7c3aed"
  at: 80, 745
}

service "ZCode IMPACT / COMPOSER-FX Runtime" {
  type: microservice
  tech: "RESEARCH/SHIPPED | IMPACT / COMPOSER-FX (pixelfx Wave 1)"
  color: "#7c3aed"
  at: 500, 745
}

service "ZCode Rhythm Beat Blocks and Cut Logic" {
  type: microservice
  tech: "SHIPPED/DESIGN | beat_blocks.json (HF-04) + HF-08 cuts"
  color: "#7c3aed"
  at: 920, 745
}

# ============================================================================
# SWIMLANE 5: Antigravity — overflow [APPROVAL / Design Ownership]
# ============================================================================
service "Antigravity Overflow character/OpenPose Prep" {
  type: microservice
  tech: "RESEARCH/DESIGN | Antigravity — overflow (character/OpenPose)"
  color: "#d97706"
  at: 80, 935
}

service "Antigravity External sprite-gen Prep" {
  type: microservice
  tech: "EXTERNAL 6a3f4c47 | sprite-gen CLI (optional RIFE, outside HM)"
  icon: "🔧"
  color: "#475569"
  at: 500, 935
}

service "Antigravity Overflow SG-02/03 and Frame QA" {
  type: microservice
  tech: "DESIGNED (NOT SIGNED) | SG-02 clip + SG-03 atlas + capscreens"
  color: "#7c3aed"
  at: 920, 935
}

# ============================================================================
# SWIMLANE 6: HTML Motion bot — compose / bake [APPROVAL / Design Ownership]
# ============================================================================
service "HTML Motion Bot Compose Pipeline" {
  type: api
  tech: "SHIPPED/DESIGN | HTML Motion bot — compose / bake"
  color: "#0f766e"
  at: 80, 1125
}

service "HTML Motion Shared Canvas Renderer" {
  type: microservice
  tech: "SHIPPED | motion-renderer.js (1280x720 sampleStageFrameAt)"
  color: "#0f766e"
  at: 500, 1125
}

service "HTML Motion Local Bake HTML PNG Video" {
  type: api
  tech: "SHIPPED | exports.js (renderAt HTML, PNG, cap-video)"
  color: "#0f766e"
  at: 920, 1125
}

# ============================================================================
# EDGES — Intra-Lane Flows & Numbered Cross-Lane Ownership Handoff (1..6)
# ============================================================================
edge "PO Product Backlog and 50 Stories" -> "Cursor Overall Architecture Contract" {
  label: "1. PO specs -> Cursor architecture"
  color: "#0284c7"
  step: 1
}

edge "PO Product Backlog and 50 Stories" -> "PO camera-grammar and Storyboard Specs" {
  label: "prioritize ~50 HM stories"
  color: "#0284c7"
}

edge "PO camera-grammar and Storyboard Specs" -> "PO sprite-gen and IMPACT Scope Gates" {
  label: "lock grammar & SG/FX gates"
  color: "#0284c7"
}

edge "Cursor Overall Architecture Contract" -> "Codex UI Studio Shell and Inspector" {
  label: "2. schema & boundaries -> Codex UI"
  color: "#2563eb"
  step: 2
}

edge "Cursor Overall Architecture Contract" -> "Cursor Show Atom and Pose Schemas" {
  label: "frontend-only static boundaries"
  color: "#2563eb"
}

edge "Cursor Show Atom and Pose Schemas" -> "Cursor IndexedDB and Portable .motion.json" {
  label: "{show,layouts,media,assets} contract"
  color: "#2563eb"
}

edge "Codex UI Studio Shell and Inspector" -> "ZCode camera-grammar and Cam Move Logic" {
  label: "3. UI hooks -> ZCode cam/FX logic"
  color: "#15803d"
  step: 3
}

edge "Codex UI Studio Shell and Inspector" -> "Codex UI Scrub Peek and Catalog Controls" {
  label: "mount timeline, peek & scrub"
  color: "#15803d"
}

edge "Codex UI Scrub Peek and Catalog Controls" -> "Codex UI sprite-gen SG-01 Staged Picker" {
  label: "local File API stage (NOT PLAYABLE)"
  color: "#d97706"
}

edge "ZCode camera-grammar and Cam Move Logic" -> "Antigravity Overflow character/OpenPose Prep" {
  label: "4. overflow & OpenPose/sprite prep"
  color: "#7c3aed"
  step: 4
}

edge "ZCode camera-grammar and Cam Move Logic" -> "ZCode IMPACT / COMPOSER-FX Runtime" {
  label: "cam presets + fx_hooks"
  color: "#7c3aed"
}

edge "ZCode IMPACT / COMPOSER-FX Runtime" -> "ZCode Rhythm Beat Blocks and Cut Logic" {
  label: "Wave 1 impacts + cut transitions"
  color: "#7c3aed"
}

edge "Antigravity Overflow character/OpenPose Prep" -> "HTML Motion Bot Compose Pipeline" {
  label: "5. local assets -> HM bot compose"
  color: "#d97706"
  step: 5
}

edge "Antigravity Overflow character/OpenPose Prep" -> "Antigravity External sprite-gen Prep" {
  label: "skeleton poses -> external strip prep"
  color: "#d97706"
}

edge "Antigravity External sprite-gen Prep" -> "Antigravity Overflow SG-02/03 and Frame QA" {
  label: "DESIGNED SG-02/03 & capscreen QA"
  color: "#7c3aed"
}

edge "HTML Motion Bot Compose Pipeline" -> "HTML Motion Shared Canvas Renderer" {
  label: "composeShow timeline & plates"
  color: "#0f766e"
}

edge "HTML Motion Shared Canvas Renderer" -> "HTML Motion Local Bake HTML PNG Video" {
  label: "6. bake standalone HTML, PNG & video"
  color: "#0f766e"
  step: 6
}

# ============================================================================
# VISUALLY SEPARATED ROLE SWIMLANE GROUPS (6 Non-Overlapping Horizontal Bands)
# ============================================================================
group Lane1POProduct {
  label: "SWIMLANE 1: PO — product / ~50 stories [APPROVAL / Design Ownership]"
  color: "#0284c7"
  at: 50, 130
  size: 1260, 165
  contains: po_product_backlog_and_50_stories, po_camera_grammar_and_storyboard_specs, po_sprite_gen_and_impact_scope_gates
}

group Lane2CursorArchitecture {
  label: "SWIMLANE 2: Cursor  overall architecture [APPROVAL / Design Ownership]"
  color: "#2563eb"
  at: 50, 320
  size: 1260, 165
  contains: cursor_overall_architecture_contract, cursor_show_atom_and_pose_schemas, cursor_indexeddb_and_portable__motion_json
}

group Lane3CodexUI {
  label: "SWIMLANE 3: Codex — UI [APPROVAL / Design Ownership]"
  color: "#15803d"
  at: 50, 510
  size: 1260, 165
  contains: codex_ui_studio_shell_and_inspector, codex_ui_scrub_peek_and_catalog_controls, codex_ui_sprite_gen_sg_01_staged_picker
}

group Lane4ZCodeLogic {
  label: "SWIMLANE 4: ZCode — effect / cam move / impact logic [APPROVAL / Design Ownership]"
  color: "#7c3aed"
  at: 50, 700
  size: 1260, 165
  contains: zcode_camera_grammar_and_cam_move_logic, zcode_impact___composer_fx_runtime, zcode_rhythm_beat_blocks_and_cut_logic
}

group Lane5AntigravityOverflow {
  label: "SWIMLANE 5: Antigravity — overflow [APPROVAL / Design Ownership]"
  color: "#d97706"
  at: 50, 890
  size: 1260, 165
  contains: antigravity_overflow_character_openpose_prep, antigravity_external_sprite_gen_prep, antigravity_overflow_sg_02_03_and_frame_qa
}

group Lane6HMBotComposeBake {
  label: "SWIMLANE 6: HTML Motion bot — compose / bake [APPROVAL / Design Ownership]"
  color: "#0f766e"
  at: 50, 1080
  size: 1260, 165
  contains: html_motion_bot_compose_pipeline, html_motion_shared_canvas_renderer, html_motion_local_bake_html_png_video
}

# ============================================================================
# STICKY NOTE CALLOUTS (Approval Ownership, Reused Research Surfaces & Caveats)
# ============================================================================
note "APPROVAL / DESIGN OWNERSHIP VIEW: Maps Jack's 6 locked swimlanes (PO — product / ~50 stories | Cursor  overall architecture | Codex — UI | ZCode — effect / cam move / impact logic | Antigravity — overflow | HTML Motion bot — compose / bake). Does NOT claim every slice is shipped." {
  color: "#fef08a"
  at: 50, 10
}

note "REUSED HM RESEARCH SURFACES: camera-grammar (HM-CAM-GRAMMAR-STARTER, HM-CAM-10R), sprite-gen (external 6a3f4c47 + HM-SG-01..03), IMPACT / COMPOSER-FX (pixelfx Wave 1 12 impacts), and character/OpenPose (JOINT-GEOMETRY + skeleton plates)." {
  color: "#bae6fd"
  at: 480, 10
}

note "STATUS & BOUNDARY CAVEATS: HM static frontend (8219598c) has no backend (FRONTEND-ONLY-2026-10-23.md). SG-01 (a066fb9e) is staged-only and NOT PLAYABLE until SG-02 is separately signed, implemented, verified & shipped. SG-02/03 are DESIGNED, NOT SIGNED." {
  color: "#fed7aa"
  at: 910, 10
}
