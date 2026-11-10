# HM-PF-46 — export honesty matrix

Jack reads this before clicking Export. The dialog probes the open browser. It does not promise a container the browser did not report.

| Path | When it is ready | Alpha |
| --- | --- | --- |
| Playable HTML | Always. One offline file. `window.renderAt` plays the plate animation. | Composited on the canvas. Not an alpha video. |
| PNG frames | Always. Zip of frames plus timing JSON. ffmpeg stays on the local skill (`HM-EXPORT-X-PRESET`). | Composited on the white stage fill. Not a transparent plate. |
| WebM | This browser, when `captureStream` and a WebM `MediaRecorder` type both succeed. Real time. The tab stays visible. | No. |
| MP4 | This browser only, when it reports `video/mp4`. Record video still prefers WebM when WebM is supported. | No. MP4 is not universal. |
| Alpha video | Not offered, even if the browser reports an alpha MIME. | Not offered. Alpha is not universal. |

The preset list, bitrate hint, and ffmpeg argv stay in `public/ui/x-export.js`. This story only adds the probe and the matrix.

## Workers UI smoke

Document only. Do not deploy from this change. Do not merge it. CoS merges after the HM-PF-42 Cap-gate, onto the tip that already contains that preset work.

Run this only after that tip is deployed to the static Workers UI host, and only when that gate is open:

1. Open `/ui/` on the deployed host.
2. Open the 5.00s eight-plate demo and confirm it is still 5.00s.
3. Open Export. The matrix lists Playable HTML, PNG frames, WebM, MP4, and Alpha video.
4. Playable HTML and the frame zip stay available. Alpha video stays "Not offered". The note says MP4 is not universal.
5. Record video matches the WebM or MP4 row for that browser. If the row says unavailable, the button stays disabled.
6. The page does not call a compose API. No `api.teqcon.uk`. No `:8770`.

This file does not perform that smoke.
