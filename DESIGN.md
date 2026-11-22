# Stitch Design System — HTML Motion Studio (`DESIGN.md`)

Extracted directly from [`public/ui/styles.css`](public/ui/styles.css) and [`public/ui/index.html`](public/ui/index.html) following the Stitch `DESIGN.md` specification.

## 1. Visual Theme and Atmosphere
- **Aesthetic**: Dark-slate NLE studio designed around crisp stage geometry, zero decorative clutter, and tactile direct-manipulation surfaces (`AI Motion HTML -> Edit -> Video` in `<= 60s`).
- **Lightness & Contrast**: Deep slate-navy foundations (`#0A0E14` / `#0E121A`) pair with clean white canvas letterboxes (`#FFFFFF` stage backing for plate fidelity) and luminous teal-cyan / lime interactive accents (`#5EEAD4` in the composer shell, `#CCF17B` in exported standalone players).
- **Materiality**: Hairline `1px` borders (`#243041`), subtle `inset` structural dividers, tabular monospaced timecodes (`ui-monospace`), and high-visibility warning/hit states (`#FF8A1E`, `#FF9E44`, `#FFB1A8`).

## 2. Color Palette and Roles
- **Primary Foundations**:
  - `--shell-bg`: `#0A0E14` (Studio canvas backdrop and well)
  - `--shell-bar`: `#0E121A` (Top bar, left focus rail, footer bar)
  - `--shell-panel`: `#121821` (Library sidebar, Inspector sidebar, Timeline deck, Modal background)
  - `--shell-raised`: `#171E28` (Buttons, group cards, secondary pills)
  - `--shell-line`: `#243041` (Primary `1px` structural borders and hairlines)
- **Accent & Interactive**:
  - `--shell-accent` / `--accent`: `#5EEAD4` (Primary CTAs, active playhead, checked rail pill, focus-visible ring)
  - `--shell-accent-2` / `--mint`: `#68EDE8` (Clip spine indicator bar, local-device status dot)
  - `--shell-accent-ink`: `#06221E` (High-contrast text on primary accent fills)
  - `--shell-accent-dim`: `#12352F` (Toggled chips, fit chips, pressed states)
  - `--shell-shot`: `#102824` (Resting timeline clip surface)
  - `--shell-shot-line`: `#2A6B62` (Clip card border, export receipt border)
  - `--shell-shot-active`: `#164840` (Selected timeline clip fill)
  - **Offline Standalone Player Accent**: `#CCF17B` on `#101315` (`public/ui/exports.js`)
- **Typography Hierarchy**:
  - `--shell-text` / `--text`: `#E7EEF6` (Primary copy, active labels, headings)
  - `--shell-muted` / `--muted`: `#8B9BB0` (Eyebrows, hints, secondary metadata, muted timecodes)
- **Functional Status States**:
  - `--shell-danger` / `--danger`: `#FFB1A8` (Validation errors, blocked/missing receipts, Cancel export)
  - `--hit`: `#FF8A1E` (Timeline impact beat ticks & markers)
  - `--warn`: `#FF9E44` and `--warn-ink`: `#FFE4BF` (Cadence warnings, compose-only honesty badges)

## 3. Typography Rules
- **Base Sans Stack**: `14px / 1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` (100% offline system fonts — zero external font CDNs).
- **Monospace Telemetry**: `ui-monospace, SFMono-Regular, monospace` with `font-variant-numeric: tabular-nums` for `#timecode`, `#projectTitle`, clip durations (`9px–11px`), playhead pills, show IDs, and `#exportFfmpegCmd`.
- **Hierarchy**:
  - Studio Heading (`h1`): `25px`, weight `550`, tracking `-0.8px` (`18px` on compact `<1150px` viewports)
  - Modal / Preview Headings (`h2`): `17px–24px`, weight `500`, tracking `-0.2px` to `-0.7px`
  - Eyebrow Kickers (`.eyebrow`): `10px`, weight `650`, uppercase tracking `1.6px`, `--muted`
  - Inspector Group Titles (`.group-title`): `10px`, weight `650`, uppercase tracking `1.1px`
  - Field Hints (`.field-hint`): `10px`, line-height `1.5`, `--shell-muted`

## 4. Component Stylings
- **Buttons (`button`)**: Border radius `7px`, padding `8px 12px`, `--surface` fill with `1px solid var(--border)`. Primary CTAs (`.primary`) use `--accent` fill with `--shell-accent-ink` weight `650`.
- **Focus Ring (`:focus-visible`)**: Explicit `2px solid var(--accent)` outline with `2px` offset across buttons, links, inputs, selects, textareas, summaries, and focusable controls.
- **Stage Surround (`.stage-surround`)**: `10px` radius framed with radial vignette `#1A2432` to `#0E141C` and corner viewfinder hairlines around the `1280×720` (`16:9`) canvas. Non-canvas DOM overlays (`#stageMissingOverlay`, `#safeGuidesOverlay`) layer above without polluting exported video frames.
- **Timeline Clip Cards (`.timeline-clip`)**: Height `91px`, `5px` radius, left `3px` inset spine in `--shell-accent-2`, thumbnail box + monospaced duration badge + direct right-edge `.clip-trim-handle`.
- **Modals & Drawers (`dialog`)**: `15px` radius, `#121821` surface with `#070B0DBB` backdrop blur. Desktop `#exportDialog` uses a two-column grid separating primary export actions (`310px`) from Bake QA & `ffmpeg` handoff (`1fr`).

## 5. Layout Principles
- **Desktop 3-Pane NLE Deck (`>1150px`, validated at `1440×900`)**:
  - Sticky `52px` topbar (`Open project`, `Save project`, `Export ↗`)
  - Left `68px` focus rail (All / Media / Preview / Timeline / Clip / QA)
  - `268px` Plate/Media sidebar + fluid `minmax(0, 1fr)` Stage well + `300px` Clip Settings Inspector
  - Clamped bottom Timeline ribbon (`clamp(220px, 32vh, 380px)`) and `32px` footer status bar
- **Compact & Mobile Shell (`<=600px`, validated at `390×844`)**:
  - Sticky top stage preview paired with bottom navigation tab bar and bottom-sheet modal flow (`Export` primary CTA always visible above collapsible Bake QA drawers).

## 6. Stitch Generation Notes
- **Keywords**: Dark-slate NLE studio, crisp hairline borders, high-contrast cyan-teal accents (`#5EEAD4`), offline single-file HTML/video export workflow, direct-manipulation timeline, zero glassmorphism clutter.
- **Guardrails for Future Screen Edits**:
  - Never add external CDN scripts/fonts (strict CSP `default-src 'self'`).
  - Keep `#stage` canvas pure (diagnostics like missing-asset prompts belong in DOM overlays, never rendered into pixels).
  - Keep primary Edit → Export Video path reachable within `<= 60s` on desktop and mobile.
