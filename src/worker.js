import catalog from "./catalog.json";
import platesInv from "./plates.json";

const CLOUD_OFF = {
  ok: false,
  cloud: true,
  fe_only: true,
  errors: [
    "HM-COMPOSE-07: product path is frontend-only. Compose/Save/Duplicate/Import run in the browser (localStorage). This /api/* write stub is unused — open /ui/ and use Compose.",
  ],
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" || path === "") {
      return Response.redirect(new URL("/ui/index.html", url), 302);
    }

    if (path.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "access-control-allow-headers": "content-type",
          },
        });
      }

      if (path.startsWith("/api/catalog") && request.method === "GET") {
        return json(catalog);
      }

      if (path.startsWith("/api/composed") && request.method === "GET") {
        const sid = url.searchParams.get("show") || "";
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(sid)) {
          return json({ ok: false, exists: false, errors: ["bad show id"] }, 400);
        }
        const exists = sid === platesInv.show_id;
        return json({
          ok: true,
          exists,
          player: `/player/index.html?show=${encodeURIComponent(sid)}`,
          cloud: true,
        });
      }

      if (path.startsWith("/api/plates") && request.method === "GET") {
        const sid = url.searchParams.get("show") || "";
        if (sid && sid !== platesInv.show_id) {
          return json({
            ok: true,
            show_id: sid,
            assets_dir: null,
            plates: [],
            cutouts: [],
            used_in_show: [],
            plate_count: 0,
            note: "only daiyu-wang-codex-import shipped on cloud",
          });
        }
        return json(platesInv);
      }

      // Write / compose endpoints: honest stub (do not invent compose results)
      if (
        path.startsWith("/api/compose") ||
        path.startsWith("/api/save") ||
        path.startsWith("/api/upload") ||
        path.startsWith("/api/wording") ||
        path.startsWith("/api/setup") ||
        path.startsWith("/api/qa_png") ||
        path.startsWith("/api/duplicate") ||
        path.startsWith("/api/import_pack")
      ) {
        return json(CLOUD_OFF, 501);
      }

      return json({ ok: false, errors: [`unknown api ${path}`] }, 404);
    }

    // Fall through to static assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("ASSETS binding missing", { status: 500 });
  },
};
