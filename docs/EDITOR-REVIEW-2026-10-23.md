# Editor redesign and control verification — 2026-10-23

## Problems found in the previous product UI

| Finding | Evidence in source / interface | Resolution |
|---|---|---|
| Five-second clips rejected | `clientCheck()` and `composeShow()` required 30–60 seconds | Validated 0.1–120 second compositions; explicit per-plate timestamps |
| Editing duration tied to 2fps | `plates_needed == duration_s * 2` and fixed 0.5-second plate end | Clip duration is distributed over its actual source plates; old 2fps inputs retain timing |
| Play/Pause used navigation | Dock controls rewrote iframe URLs; old player used reload for Space | Shared canvas transport with a clock, pause/resume, scrub and replay |
| Imported images disappeared on reload | `FE_ASSET_MAP` and blob URLs lived only in the session | IndexedDB draft includes image data; portable project embeds its assets |
| Existing image paths stale | Legacy layout has `cutout/*.png`, `plates/*.png`; deployed files are `.webp` and `.jpg` | Normalize legacy paths in editor, JSON import and static output build |
| Frontend showed unavailable server tools | Template / wording / other optional kit features did not run on static host | Product UI exposes supported image, camera, timing, caption, preview and export actions |
| Too much layered chrome | Landing screen, picker, beat focus, live preview and iframe player competed for space | One media library, one preview, one timeline, one clip inspector; responsive stacking |

## Verification

`npm test`: five compose regression tests (short/fractional clips, exact eight-plate sequence, legacy 2fps timing, invalid data, missing assets).

`npm run test:browser`: end-to-end checks of the visible workflows. Verified in isolated Chrome on macOS at desktop 1440×1000 and mobile 390×844. Checks include:

- All eight images and thumbnails load; exact 5.00-second timeline.
- Play/Pause causes no navigation; paused time remains stable.
- Scrubbing, restart, previous/next and loop.
- Timing changes, undo/redo, camera/zoom/pan/reset, effects and captions.
- Duplicate/delete/reorder, replacement, add from library, search and fitting to five seconds.
- Portable project download/reopen with embedded images.
- Exported HTML opens from `file://` with network requests blocked.
- PNG and browser video downloads are nonempty.
- Existing 31.5-second / 63-plate project loads without failed assets.
- Blank project, image import and reload persistence.
- Invalid project input leaves the active edit intact.
- Mobile playback and no page-level horizontal overflow.
- Standalone player pause/resume.
- No uncaught browser errors or failed HTTP requests during those flows.

A deterministic deliverable is rendered separately as 150 frames at 30fps, for a 5.000-second WebM. Real-time browser recordings can vary by a frame and are kept separate from the deterministic render.

## Boundaries

No live Cloudflare deployment was performed. The legacy Python kit and original assets are unchanged. The source and verification evidence are prepared locally for review; remote publication requires approval. Video recording depends on browser MediaRecorder/canvas support; unsupported browsers show a disabled control and explanation. Storage limits are browser dependent and failures direct the user to download a project. Demo/blank actions replace the active draft, so save a portable project first. This is plate animation, not generated in-between character animation.
