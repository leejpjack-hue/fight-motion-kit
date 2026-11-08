diagram: flow
title: "HTML Motion End-to-End Product-Design APPROVAL Workflow (Steps 1..10: HM UI Human Edit + Beside AI-Agent Skills)"
direction: TB

# ============================================================================
# NODES (1..10 in EXACT Jack order)
# Declared before edges with explicit `type: process` and `start`/`end` so
# src/parser/parser.ts preserves start/end flags, ProcessNode cards, and 1..10
# step badges without decision-diamond coercion.
# ============================================================================
start Step1CharacterCreation
node Step1CharacterCreation {
  type: process
  label: "1 Character creation"
  system: "HM UI show/edit + AI skill beside human edit (character/OpenPose)"
  role: human
  color: "#0284c7"
  note: "Show/edit inside HM UI; AI-agent skills sit beside human edit (dual path, not replace). Reuses character/OpenPose skeleton plates (JOINT-GEOMETRY.md, pose_library.schema.json) and locked costume sheets alongside manual HM UI character/plate inspection."
  at: 100, 160
}

node Step2Story {
  type: process
  label: "2 Story"
  system: "HM UI show/edit + AI skill beside human edit (storyboard & show.atoms)"
  role: human
  color: "#0284c7"
  note: "Show/edit inside HM UI; AI-agent skills sit beside human edit (dual path, not replace). Story beats (10s/30s Cantonese storyboard and show.schema.json atom list) are shown and edited in HM UI (including HM-HF-07 timeline JSON inspector) alongside AI story-drafting skills."
  at: 100, 320
}

node Step3Rhythm {
  type: process
  label: "3 Rhythm"
  system: "HM UI show/edit + AI skill beside human edit (beat_blocks, scrub, lint)"
  role: check
  color: "#2563eb"
  note: "Show/edit inside HM UI; AI-agent skills sit beside human edit (dual path, not replace). Atom duration_s, HM-HF-04 beat_blocks.json, HM-HF-01 frame peek (#46), HM-HF-02 seekable scrub (#47), and #39 rhythm lint work inside HM UI beside AI rhythm/frame-QA skills."
  at: 100, 480
}

node Step4SceneCamShotDesign {
  type: process
  label: "4 Scene cam-shot design"
  system: "HM UI show/edit + AI skill beside human edit (camera-grammar triplets)"
  role: model
  color: "#7c3aed"
  note: "Show/edit inside HM UI; AI-agent skills sit beside human edit (dual path, not replace). Reuses camera-grammar (HM-CAM-GRAMMAR-STARTER fight-cam-grammar-starter.json: Wide open/re-establish + Intent/Action/Reaction triplets and HM-HF-08 cut transitions) in HM UI beside AI scene-blocking skills."
  at: 100, 640
}

node Step5PerSceneCamShots {
  type: process
  label: "5 Per-scene cam shots"
  system: "HM UI show/edit + AI skill beside human edit (camera.preset, CAM-10R)"
  role: tool
  color: "#7c3aed"
  note: "Show/edit inside HM UI; AI-agent skills sit beside human edit (dual path, not replace). Per-scene/per-atom camera.preset (low_rise, ots_L_hold, eye_push, whip_A_to_B, pull_aftermath, eye_orbit), HM-CAM-10R fit chips, and HM-PAN-SPAN-UI are editable in HM UI beside AI cam-tuning skills."
  at: 100, 800
}

node Step6SpriteGen {
  type: process
  label: "6 Sprite gen"
  system: "HM UI show/edit + AI skill beside human edit (sprite-gen + SG-01/02/03)"
  role: tool
  color: "#d97706"
  note: "Show/edit inside HM UI; AI-agent skills sit beside human edit (dual path, not replace). External sprite-gen (6a3f4c47, optional RIFE) prepares .strip.png+.strip.json or atlas; HM UI stages via SG-01 (SIGNED/pending, gated NOT PLAYABLE until SG-02 is separately signed, implemented, verified & shipped)."
  at: 680, 160
}

node Step7BackgroundScene {
  type: process
  label: "7 Background scene"
  system: "HM UI show/edit + AI skill beside human edit (BG crop/pan/span/parallax)"
  role: tool
  color: "#15803d"
  note: "Show/edit inside HM UI; AI-agent skills sit beside human edit (dual path, not replace). Background scene plates, HM-BG-CROP, HM-BG-PAN-CONT, HM-BG-SPAN-UI, and honest parallax defaults (HM-PARALLAX-DEFAULT-HONESTY) are shown and edited in HM UI beside AI background skills."
  at: 680, 320
}

node Step8Foreground {
  type: process
  label: "8 Foreground"
  system: "HM UI show/edit + AI skill beside human edit (FG cutouts + IMPACT FX)"
  role: tool
  color: "#15803d"
  note: "Show/edit inside HM UI; AI-agent skills sit beside human edit (dual path, not replace). Foreground cutouts/plates (HM-COMPOSE-FG, HM-FG-BROKEN-CUTOUT, floor_y/body_h standing-height anchor) and IMPACT / COMPOSER-FX (pixelfx Wave 1 12 impacts on fx_hooks) are edited in HM UI beside AI FX/cutout skills."
  at: 680, 480
}

node Step9HMCompose {
  type: process
  label: "9 HTML Motion cam-shot compose"
  system: "HM UI show/edit + AI skill beside human edit (compose-client + renderer)"
  role: tool
  color: "#0f766e"
  note: "Show/edit inside HM UI; AI-agent skills sit beside human edit (dual path, not replace). Compiles {show,layouts,media,assets} via compose-client.js and motion-renderer.js (1280x720 sampleStageFrameAt) in HM UI beside html-motion-composer skill scripts (build-project.cjs, export-project.cjs, frame-qa.cjs)."
  at: 680, 640
}

end Step10Voice
node Step10Voice {
  type: process
  label: "10 Voice"
  system: "HM UI show/edit + AI skill beside human edit (dialogue hold & final bake)"
  role: human
  color: "#0f766e"
  note: "Show/edit inside HM UI; AI-agent skills sit beside human edit (dual path, not replace). Dialogue hold and voice cue alignment (HM-DIALOGUE-HOLD; APPROVAL design slice — pixelfx Wave 1 has no SFX/audio) plus local HTML/PNG/capability-video bake inside HM UI beside AI voice/timing skills."
  at: 680, 800
}

# ============================================================================
# EDGES — Sequential 1..10 Flow Across Two Pinned Columns (x=100 -> x=680)
# ============================================================================
Step1CharacterCreation ->|"1 -> 2: HM UI + AI skill"| Step2Story
Step2Story ->|"2 -> 3: HM UI + AI skill"| Step3Rhythm
Step3Rhythm ->|"3 -> 4: HM UI + AI skill"| Step4SceneCamShotDesign
Step4SceneCamShotDesign ->|"4 -> 5: HM UI + AI skill"| Step5PerSceneCamShots
Step5PerSceneCamShots ->|"5 -> 6: HM UI + AI skill"| Step6SpriteGen { from: right, to: left }
Step6SpriteGen ->|"6 -> 7: HM UI + AI skill"| Step7BackgroundScene
Step7BackgroundScene ->|"7 -> 8: HM UI + AI skill"| Step8Foreground
Step8Foreground ->|"8 -> 9: HM UI + AI skill"| Step9HMCompose
Step9HMCompose ->|"9 -> 10: HM UI + AI skill"| Step10Voice

# ============================================================================
# STICKY NOTE CALLOUTS (Dual-Path Rule, 1..10 Order & Approval Caveats)
# ============================================================================
note "DUAL-PATH RULE ON ALL 10 STEPS: Every step (1..10) is shown and editable inside the HTML Motion UI, while AI-agent skills sit beside human edit as a dual path (never replacing human UI inspection or editing)." {
  color: "#fef08a"
  at: 100, 10
}

note "EXACT JACK 1..10 ORDER: (1) Character creation -> (2) Story -> (3) Rhythm -> (4) Scene cam-shot design -> (5) Per-scene cam shots -> (6) Sprite gen -> (7) Background scene -> (8) Foreground -> (9) HTML Motion cam-shot compose -> (10) Voice." {
  color: "#bae6fd"
  at: 520, 10
}

note "APPROVAL & STATUS CAVEATS: Product-design APPROVAL flow, not a claim that every slice is shipped. Step 6 sprite-gen runs externally (6a3f4c47); SG-01 is staged-only and NOT PLAYABLE until SG-02 is separately signed & shipped. Step 10 Voice is an approval/design slice (Wave 1 FX has no audio)." {
  color: "#fed7aa"
  at: 940, 10
}
