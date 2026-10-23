# HTML Motion — coding path (Cursor cloud agent)

**Decision:** Jack via CoS, 2026-10-23 ~08:55 HKT — **use Cursor cloud agents for HTML Motion coding and verification.**

## Was
HM-COMPOSE-01…07 (incl. FE-only 07) were built by Development on the **box kit**  
`/workspace/deliverables/html-motion-template-kit-2026-10-19/` (no `.git`) + `wrangler deploy` to Workers.  
**Not** via Cursor CloudAgent / PR.

## Now (standing)
1. **Code** for HTML Motion product / kit / Workers deploy path → **Cursor cloud agent** (`CloudAgent` launch/reply), not box-inline edits as the product path.
2. **Verification** (proof scripts, QA acceptance, CI/checks the agent can run) → same cloud agent (or a follow-up reply on that agent), with proof in the PR / agent report. Motion user-seat stays after PO ACCEPT when the story says so.
3. **Forge:** prefer a Cursor-launchable repo. Available today:
   - GitHub `https://github.com/leejpjack-hue/fight-motion-kit` (PO/CoS merge forge)
   - Origin `https://cursor.com/codebase/jack-lee-jp/fight-motion-kit` (Jack UI merge only if Origin is SoT for that PR)
   - No dedicated `html-motion*` repo yet — Development + PO: put the composer kit on a launchable forge (fight-motion-kit subtree **or** new private repo) before the next SIGNED HM coding story; do not keep “box-only kit” as the coding SoT.
4. **Keep local:** box kit / `serve.py` as optional QA oracle only (unchanged from FE-only arch). Sync from merged forge → box for Motion QA / Workers publish as needed.
5. CoS does not merge. Jack / forge rules unchanged (Origin Origin-token merge limits still apply).

## Owners
- **Build:** Development launches/supervises CloudAgent.
- **Product:** PO keeps stories SIGNED against this path.
- **User-test:** HTML Motion on deployed Workers URL after ACCEPT.
- **CoS:** enforce handoff; no box-side product coding as default.
