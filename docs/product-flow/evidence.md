# Validation and execution evidence (`hm-approval-boards-2026-11-08`)

Date: 2026-11-08
Deliverables directory: `/workspace/deliverables/hm-approval-boards-2026-11-08`
Generator and validator: `/workspace/deliverables/hm-approval-boards-2026-11-08/generate-and-verify.mjs`
Validation receipt: `/workspace/deliverables/hm-approval-boards-2026-11-08/validation-receipt.json`

## 1. Model pin and boundary proof

- **Active model pin**: `opencode-go/gemini-4-argon` only.
- **External model / provider calls**: `0`. No subagents on other models, no Jev external model review calls, no image/video/sprite provider calls.
- **Repository mutations / installs / PRs / SIGN**: `0`. No `npm install`, no `npx`, no edits outside `/workspace/deliverables/hm-approval-boards-2026-11-08`, no git commits or PRs, and no `SIGN`.
- **Live browser claim**: None. Per instructions, no live browser GUI proof is invented; all validation is executed locally against DiagramTool's actual TypeScript parser and portable board modules via Node `v22.20.0 --experimental-strip-types`.

## 2. Observed repository revisions

```bash
node --version
git -C /workspace/repos/diagram-tool rev-parse HEAD
git -C /workspace/diagram-tool rev-parse HEAD
git -C /workspace/repos/fight-motion-kit rev-parse HEAD
git -C /workspace/repos/fight-motion-kit-sg01-20261107-1441 rev-parse HEAD
```

Observed output:

| Target | Observed Version / Git SHA | Path | Notes |
|---|---|---|---|
| Node.js runtime | `v22.20.0` | `/usr/local/bin/node` | Supports `--experimental-strip-types` and `node:module` `registerHooks` natively. |
| DiagramTool primary checkout | `3dd1658e8fa0aaab9501f661f85b38271509eddd` | `/workspace/repos/diagram-tool` | Source of `src/parser/parser.ts`, `src/parser/plainArchitecture.ts`, `src/parser/architectureWalk.ts`, `src/parser/flowToPlainSteps.ts`, `src/utils/boardFormat.ts`, `src/utils/boardFile.ts`, and `src/utils/localMcpBoards.ts`. |
| DiagramTool alias checkout | `7bdad92465868f770183deff07716896a5e99b99` | `/workspace/diagram-tool` | Older checkout inspected read-only; all validation uses `/workspace/repos/diagram-tool` (`3dd1658e`). |
| HTML Motion authoritative `main` pin | `8219598c2749daeeb3719840087964422ba46fa2` | `leejpjack-hue/fight-motion-kit` | Authoritative `main` base cited across all shipped HM component labels. |
| HTML Motion `HM-SG-01` branch worktree | `a066fb9ed3b22e8e5732fcf1e8220506696762e8` | `/workspace/repos/fight-motion-kit-sg01-20261107-1441` | Feature branch `codex/hm-sg01-20261107-1441` (staged-only, `NOT PLAYABLE` until `HM-SG-02`). |
| HTML Motion drifted local checkout | `97428ee5882034f548e14a71a93692f2c503f191` | `/workspace/repos/fight-motion-kit` | Local drift documented and excluded from shipped claims. |
| `sprite-gen` authoritative upstream pin | `6a3f4c47d7f8745853cc06fe66b252636976a442` | `aldegad/sprite-gen` | External CLI pipeline cited in `companion-notes.md` and both boards. |

## 3. Reproducible validation command

```bash
node --experimental-strip-types /workspace/deliverables/hm-approval-boards-2026-11-08/generate-and-verify.mjs
```

What `generate-and-verify.mjs` executes and proves:

1. Registers an in-memory `node:module` `registerHooks` hook so DiagramTool's extensionless TypeScript relative imports resolve directly to `.ts` files under `/workspace/repos/diagram-tool/src/` with zero package installs.
2. Parses `architecture.dsl` via `assertValidSource(archDsl, 'architecture')` and `parseDiagram(archDsl)` (`src/parser/parser.ts`), verifying:
   - `# @type-parts` refill block extracts cleanly via `plainPartsFromBoardSource(archDsl)` with `0` warnings in `typePartsPreviewRows()`.
   - Exactly `6` non-overlapping swimlane `group` blocks exist in Jack's locked role order (`PO — product / ~50 stories`, `Cursor  overall architecture`, `Codex — UI`, `ZCode — effect / cam move / impact logic`, `Antigravity — overflow`, `HTML Motion bot — compose / bake`), each labeled `[APPROVAL / Design Ownership]` with explicit `at:` and `size:` geometry.
   - All `4` HM research surfaces (`camera-grammar`, `sprite-gen`, `IMPACT / COMPOSER-FX`, `character/OpenPose`) are explicitly labeled.
   - All `18` architecture component nodes (`17` `service` + `1` `database`) have explicit `at: x, y` pins, plus `3` sticky-note annotations (`21` total nodes) and `17` edges (`6` numbered cross-lane walk-through hops `step: 1..6`).
3. Parses `workflow.dsl` via `assertValidSource(flowDsl, 'flow')` and `parseDiagram(flowDsl)` (`src/parser/parser.ts`), verifying:
   - `start Step1CharacterCreation` and `end Step10Voice` are declared before edges (`isStart: true` on Step 1, `isEnd: true` on Step 10).
   - Exactly `10` flow graph nodes (`n.type === 'flow'`) exist in Jack's exact order `1..10` (`1 Character creation`, `2 Story`, `3 Rhythm`, `4 Scene cam-shot design`, `5 Per-scene cam shots`, `6 Sprite gen`, `7 Background scene`, `8 Foreground`, `9 HTML Motion cam-shot compose`, `10 Voice`).
   - All `10` flow nodes preserve explicit `nodeType === 'process'` (`0` decision-diamond coercions), carry explicit 2-column `at: x, y` pins (`x = 100` for Steps 1..5, `x = 680` for Steps 6..10), show `HM UI show/edit + AI skill beside human edit` in `system:`, and include the full dual-path note in `note:`.
   - `flowStepNumbers(parsedFlow)` (`src/parser/flowToPlainSteps.ts`) maps the `10` nodes to exact badge numbers `1..10`, and `flowStepList(parsedFlow)` returns `10` ordered walk-through steps.
4. Serializes `architecture.board.json` and `workflow.board.json` via `serializeBoardFile()` (`src/utils/boardFile.ts`) and validates both files through DiagramTool's portable v3.0 and MCP board utilities:
   - `validatePortableDocument(doc)` returns `{ ok: true, errors: [] }`.
   - `containsWatermark(raw)` returns `false`.
   - `parseOpenedBoardText(raw)` and `interpretOpenedFile(fname, raw)` return `format: "board-json"`.
   - `parsePortableImport(doc)` returns `boards.length === 1` and `skipped.length === 0`.
   - `layoutDelta(before, after)` is `0 px` (`<= 2 px` threshold).
   - `setSource()`, `getBoard()`, and `listBoards()` (`src/utils/localMcpBoards.ts`) succeed on both boards.
5. Writes `/workspace/deliverables/hm-approval-boards-2026-11-08/validation-receipt.json` with full structural counts and SHA-256 file digests, then prints `VALIDATION_RECEIPT_WRITTEN_OK=1`.

## 4. Verification summary matrix

| Check | `architecture.board.json` | `workflow.board.json` |
|---|---|---|
| Schema version / kind / mode | `"3.0"` / `"board"` / `"architecture"` | `"3.0"` / `"board"` / `"flow"` (`showStepNumbers: true`) |
| `validatePortableDocument` | `{ ok: true, errors: [] }` | `{ ok: true, errors: [] }` |
| `containsWatermark` | `false` | `false` |
| `interpretOpenedFile` | `"board-json"` | `"board-json"` |
| `parsePortableImport` | `boards: 1`, `skipped: 0` | `boards: 1`, `skipped: 0` |
| `layoutDeltaPx` | `0` | `0` |
| Total nodes | `21` (`17` service + `1` database + `3` annotation notes) | `13` (`10` `process` flow nodes + `3` annotation notes) |
| Total edges | `17` (`6` numbered cross-lane hops `step: 1..6`) | `9` (`1 -> 2 -> ... -> 10`) |
| Groups / step badges | `6` non-overlapping swimlane `group` bands | `10` walk-through steps, badges `1..10` |
