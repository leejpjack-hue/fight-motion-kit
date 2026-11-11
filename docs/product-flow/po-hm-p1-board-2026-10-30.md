<!-- provenance
source: /workspace/hr/logs/po-hm-p1-board-2026-10-30.md
copied: 2026-11-11 01:08 JST (Asia/Tokyo)
audit: /workspace/deliverables/hm-issue-cleanup-2026-11-11/
review: no secrets, credentials, n8n login, contact, desk, or HR private context found
note: historical DESIGNED/HOLD board SoT for issues #38 #40 #41 (and shipped #39, already closed). Status lines in the body are as of 2026-10-30 / forge note 2026-11-01. Do not treat as a new SIGN.
-->

# PO board — HM P1 composer enhance — 30 Oct 2026

> **2026-11-01 forge lock:** new SIGNED/urgent HM coding → `https://github.com/patch-gg/pixelfx.git`. Issues #38–41 below were boarded on fight-motion-kit; treat as boarding IDs until reboarded on pixelfx. Cap/DESIGNED status unchanged.

**Written:** 2026-10-30 ~09:30 JST (Asia/Tokyo) · Product Owner (executor)  
**Ask:** Jack → HTML Motion → PO — board P1 from win4r/video-director vs HTML Motion analysis (2026-10-30).  
**Status of pack:** **DESIGNED** (items 6–8) · **HOLD** (item 9 SFX) — **not SIGNED**. Do **not** launch CloudAgent / Antigravity from this file.

---

## 1. Header

| Item | Value |
|------|--------|
| **Pack size** | 4 stories · 3 DESIGNED · 1 HOLD |
| **Caps** | Fri prior-pack one-shot owns ≤3 SIGN today (FG scroll · parallax · pan span). **These P1 are not SIGNED tonight.** |
| **Builder (when SIGN later)** | Development → Cursor CloudAgent (Antigravity Argon) |
| **Tip (gh main, locked)** | HM `73570a617b65` — `HM-FX-PATH-EDIT: author fist, leg, and tornado path points (#34)` · 2026-10-26 |
| **SI** | **SKIP** |
| **SoT path** | `/workspace/hr/logs/po-hm-p1-board-2026-10-30.md` |
| **Source Page** | https://cursor.com/canvas/store-4b196c92-d1a3-4894-af76-47a03d56f6ce/57d953c6-33e1-4e41-ba93-fdd38b265235 |
| **QA writeup** | `/workspace/hr/html-motion/qa/win4r-video-director-vs-html-motion-2026-10-30.md` §C P1 |

### Goal path

| App | Goal |
|-----|------|
| **HM** | Jack bar ≤60s FE composer for fight videos — review/lint/QA without scrubbing full MP4 |

### Standing locks (do not invent against)

- **FE-only:** no compose/save HTTP backend; Workers static; persistence localStorage/FS.
- **Do not invent:** Remotion/GSAP shot libraries; hook-text≥84px CTA for fight comics; FACTS.md truth whitelists.
- **P0** = Motion skill harness (Motion owns) — not this pack.
- **P2** = park — not this pack.
- Prior DESIGNED pack HM (FG scroll / parallax / pan span / CAM-10R / undo) remains separate; Fri one-shot may SIGN ≤3 of those — **not** these P1.

---

## 2. Stories

### HM-CONTACT-SHEET-EXPORT (P1 #6)

| Field | Content |
|-------|---------|
| **ID** | `HM-CONTACT-SHEET-EXPORT` |
| **Feature name** | Export beat contact sheet / strip from show JSON |
| **Description** | One-click or scripted path from `.motion.json` → sheet PNGs (beat +0.3s, transition strips, phone sheet) so Jack can review without scrubbing full MP4. |
| **App** | pixelfx (HM urgent forge; boarded ids on fight-motion-kit) |
| **Goal path** | Jack bar ≤60s FE composer for fight videos |
| **Builder** | Development → Cursor CloudAgent (Antigravity Argon) |
| **Cap bucket** | HM ≤3/weekday (when SIGN — not tonight) |
| **Must** | (1) From loaded show/project JSON, export beat sheets at +0.3s inside each atom. (2) Transition strips across cuts/fast moves. (3) Phone-width sheet (~360px). (4) FE-only or local script in kit — no new compose/save HTTP backend. (5) Document how to run from composer UI and/or script. |
| **Out of scope** | Remote compose; Remotion pipeline; claiming loudness QA; inventing shot libraries. |
| **Acceptance / proof** | Fixture show → PNGs land in predictable paths; PR shows sample sheets. |
| **Status** | **DESIGNED** · boarded issue (see §3) · **not SIGNED** |
| **Source** | QA §C P1 item 6 |

### HM-RHYTHM-LINT (P1 #7)

| Field | Content |
|-------|---------|
| **ID** | `HM-RHYTHM-LINT` |
| **Feature name** | Adjacent-camera / freeze / pop soft warnings in composer |
| **Description** | Soft lint in composer: same cam preset on adjacent atoms; atom duration outliers vs density bar; extend beyond missing-plate 404 to rhythm lint. |
| **App** | pixelfx (HM urgent forge) |
| **Goal path** | Jack bar ≤60s FE composer for fight videos |
| **Builder** | Development → Cursor CloudAgent (Antigravity Argon) |
| **Cap bucket** | HM ≤3/weekday (when SIGN — not tonight) |
| **Must** | (1) Warn when adjacent atoms share same cam preset. (2) Warn duration outliers (tie to STREET-ish density: flag atoms clearly sparse vs median~0.5s / max≤1.4s guidance — soft, not hard block). (3) Keep/extend missing plate 404 visibility. (4) Soft = visible warnings, does not block bake. (5) FE-only. |
| **Out of scope** | Hard-fail gate replacing Jack GO; inventing new camera modes; remote APIs. |
| **Acceptance / proof** | Fixture with adjacent same-cam + long atom shows warnings; bake still works. |
| **Status** | **DESIGNED** · boarded issue (see §3) · **not SIGNED** |
| **Source** | QA §C P1 item 7 |

### HM-BAKE-POP-SCAN (P1 #8)

| Field | Content |
|-------|---------|
| **ID** | `HM-BAKE-POP-SCAN` |
| **Feature name** | Pop/flash scan on exported MP4 (local QA oracle) |
| **Description** | After bake, run a frame-diff spike check (howseen/qa_video idea) as local QA oracle — no loudness claim. |
| **App** | pixelfx (HM urgent forge) |
| **Goal path** | Jack bar ≤60s FE composer for fight videos |
| **Builder** | Development → Cursor CloudAgent (Antigravity Argon) |
| **Cap bucket** | HM ≤3/weekday (when SIGN — not tonight) |
| **Must** | (1) Local script/tool scans exported mp4 for flash/pop frame-diff spikes. (2) Readable report (timestamps of spikes). (3) Document run command in kit. (4) Optional wire from composer export path without requiring network. (5) No loudness/−14 LUFS claims. |
| **Out of scope** | Claiming audio QA; Remotion; remote encode service. |
| **Acceptance / proof** | Known-pop fixture fails loudly; clean fixture passes or explains; sample report in PR. |
| **Status** | **DESIGNED** · boarded issue (see §3) · **not SIGNED** |
| **Source** | QA §C P1 item 8 |

### HM-SFX-SAME-CLOCK (P1 #9) — OPTIONAL HOLD

| Field | Content |
|-------|---------|
| **ID** | `HM-SFX-SAME-CLOCK` |
| **Feature name** | Sound-on-same-clock for clash atoms (optional) |
| **Description** | Only if Jack wants SFX on clash atoms; place by peak; silence before hero beat. Not blocking silent STREET. |
| **App** | pixelfx (HM urgent forge) |
| **Goal path** | Jack bar ≤60s FE composer for fight videos |
| **Builder** | Development → Cursor CloudAgent (Antigravity Argon) — **only after Jack explicit SFX GO** |
| **Cap bucket** | HM ≤3/weekday (when unblocked + SIGN) |
| **Must (when unblocked)** | (1) Place SFX on clash atoms by peak. (2) Silence before hero beat. (3) Same timeline clock as picture. (4) Silent path remains default. (5) FE-local or documented asset path — no required backend. |
| **Out of scope** | Blocking silent STREET; inventing full score system as Must; SIGN without Jack SFX yes. |
| **Acceptance / proof** | (Deferred) Clash atom SFX on peak; silence before hero; silent default still works. |
| **Status** | **HOLD / optional** · boarded for visibility · **WAITING Jack explicit SFX GO** · do not SIGN |
| **Source** | QA §C P1 item 9 |

---

## 3. Issues (filled after create)

| ID | Issue | Status |
|----|-------|--------|
| HM-CONTACT-SHEET-EXPORT | [#38](https://github.com/leejpjack-hue/fight-motion-kit/issues/38) | DESIGNED |
| HM-RHYTHM-LINT | [#39](https://github.com/leejpjack-hue/fight-motion-kit/issues/39) | DESIGNED |
| HM-BAKE-POP-SCAN | [#40](https://github.com/leejpjack-hue/fight-motion-kit/issues/40) | DESIGNED |
| HM-SFX-SAME-CLOCK | [#41](https://github.com/leejpjack-hue/fight-motion-kit/issues/41) | HOLD |

---

## 4. HOLD / process caveats

1. **Not SIGNED tonight.** Fri prior-pack one-shot (FG scroll · parallax · pan span) owns the ≤3 HM SIGN slot for 2026-10-30. These P1 stay DESIGNED/HOLD until a later Jack GO that names them.
2. Do **not** launch CloudAgent / Antigravity / OpenCode from this board alone.
3. Parent (PO seat) messages Development / HTML Motion — this executor does not.
4. FE-only lock stands; no Remotion/GSAP libraries / hook CTA / FACTS.md into fight craft.
5. Item 9 stays HOLD until Jack says SFX yes.

---

## 5. One-liners

| ID | Feature (one line) |
|----|--------------------|
| HM-CONTACT-SHEET-EXPORT | `.motion.json` → beat +0.3s / transition / phone sheet PNGs |
| HM-RHYTHM-LINT | Soft adjacent-cam + duration outlier warnings; bake not blocked |
| HM-BAKE-POP-SCAN | Local frame-diff pop/flash scan on exported mp4 |
| HM-SFX-SAME-CLOCK | (HOLD) SFX on clash by peak; silence before hero; silent default |

*End of pack · boarded 2026-10-30 ~09:30 JST · DESIGNED/HOLD only*
