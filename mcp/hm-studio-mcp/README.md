# `fight-motion-kit-mcp` — Local Offline Stdio MCP Server

Zero-network, zero-HTTP, zero-dependency Node.js **stdio** Model Context Protocol server wrapping Fight Motion Kit's deterministic composer engine (`HMComposeClient`, `HMFxStack`, `HMSceneAction`, `HMImpactStudio`, `HMCamActionPicker`, `HMImportSecurity`, `HMHtmlImport`).

## Quick Setup

Run via npm script (from the repo root):

```bash
npm run mcp -- --workspace /path/to/fight-motion-kit
```

### Antigravity / Claude Desktop / Cursor Config

Add to your client's MCP server config (replace `/abs/path/to/fight-motion-kit` with your checkout path):

```json
{
  "mcpServers": {
    "fight-motion-kit": {
      "command": "node",
      "args": [
        "/abs/path/to/fight-motion-kit/mcp/hm-studio-mcp/server.cjs",
        "--workspace",
        "/abs/path/to/fight-motion-kit",
        "--repo",
        "/abs/path/to/fight-motion-kit"
      ]
    }
  }
}
```

Supports both standard newline-delimited JSON-RPC 2.0 (`\n`) and `Content-Length` framed stdio messages.

## Exposed Tools

| Tool | Purpose |
| --- | --- |
| `hm_catalog_list` | Lists live shipped IDs from `public/presets/`: `camera`, `fx`, `pixelfx`, `cuts` (gold + extended), `bg`, `run_presets`, `scene_recipes`, `mood`, `density` (1–2f actions + profiles), `impact`, and `cam_cards`. |
| `hm_show_inspect` | Parses `.json`, `.motion.json`, or editable `.html` (`HMHtmlImport.parseMotionHtml`) and returns clips, BG/FG state, mood, total duration, and missing asset references. |
| `hm_show_validate` | Runs `HMComposeClient.composeShow()`, `lintShow()`, and `framePeekPlan()` without touching disk. |
| `hm_show_patch` | Atomically applies `set_bg_motion`, `set_bg_locations`, `upsert_fg_prop`, `set_fg_cam`, `set_clip_camera`, `set_clip_cut`, `add_clip_fx`, `set_mood`, `apply_scene_recipe`, and `apply_motion_density`, running `composeShow()` BEFORE writing (`out_path`, or in-place `.bak` guarded when omitted). |
| `hm_export_editable_html` | Validates with `composeShow()`, embeds local images within `HMImportSecurity` asset budgets, and writes a CSP-hardened offline Playable + Re-openable Motion HTML containing `<script id="hm-project-data" type="application/json">`. |

`node scripts/proof-authored-motion-html.cjs --via mcp` writes that HTML, opens it in the local composer (`npm run dev`, or `COMPOSER_URL`), edits the first clip, and triggers Export Video. The same command with `--via skill` uses `build-project.cjs --emit-html`. Exit 2 is a recorded failure. The command does not add an HTTP server to this MCP process.

## Security & Scope Guardrails

- **FE/CLI-only & Offline**: Zero HTTP servers, zero sockets, zero `api.teqcon.uk`, zero `:8770`, zero `wrangler deploy`.
- **Workspace Sandbox**: Every input/output path is resolved through `fs.realpathSync` and confined strictly inside `--workspace` (blocks `..` traversal and escaping symlinks).
- **5.00s Gold Demo Lock**: Any attempt to overwrite `public/shows/daiyu-wang-five-seconds.json` is rejected.
- **Fail-Closed Content Filter**: Rejects nonexistent preset IDs, photo fire/light/dust overlays, voice/`#41` HOLD keys, and remote image URIs before writing disk.
