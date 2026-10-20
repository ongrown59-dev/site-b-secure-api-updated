/**
 * OPTIONAL production server for Deno Deploy — security headers + correct caching.
 *
 * Why this exists: pure static hosting on Deno Deploy serves index.html with no
 * security headers and a one-year edge cache, so fixes deploy slowly and the
 * login page lacks CSP/HSTS protection.
 *
 * How to enable (one-time, in the Deno Deploy project settings):
 *   1. Set the build command to:  npm run build        (outputs ./dist)
 *   2. Set the entrypoint to:     serve.ts
 * Behavior after enabling:
 *   - Every response gets the security headers below.
 *   - /assets/* (content-hashed) is cached for one year, immutable.
 *   - index.html / SPA routes are served with Cache-Control: no-cache, so new
 *     deploys reach members immediately (assets are still cached hard).
 * If you change the API domain, update connect-src in the CSP below.
 * This file has no external dependencies (pure Deno APIs).
 */

const DIST = new URL("./dist/", import.meta.url).pathname;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; " +
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://site-b-secure-api.ongrown59-dev.deno.net; " +
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function respond(body: BodyInit | null, status: number, contentType: string, cacheControl: string, extra: Record<string, string> = {}): Response {
  const headers = new Headers(SECURITY_HEADERS);
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", cacheControl);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(body, { status, headers });
}

async function serveDistFile(req: Request, relPath: string, cacheControl: string): Promise<Response | null> {
  // Resolve inside ./dist and refuse path traversal outside it.
  const resolved = new URL(relPath, "file://" + DIST).pathname;
  if (!resolved.startsWith(DIST)) return null;

  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(resolved);
  } catch {
    return null;
  }
  if (!stat.isFile) return null;

  const ext = resolved.slice(resolved.lastIndexOf(".")).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  const lastModified = stat.mtime?.toUTCString();

  const ims = req.headers.get("if-modified-since");
  if (lastModified && ims && new Date(ims).getTime() >= Math.floor((stat.mtime?.getTime() || 0) / 1000) * 1000) {
    return respond(null, 304, contentType, cacheControl, { "Last-Modified": lastModified });
  }

  const data = await Deno.readFile(resolved);
  const extra: Record<string, string> = { "Content-Length": String(data.byteLength) };
  if (lastModified) extra["Last-Modified"] = lastModified;
  if (req.method === "HEAD") return respond(null, 200, contentType, cacheControl, extra);
  return respond(data, 200, contentType, cacheControl, extra);
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return respond("Method Not Allowed", 405, "text/plain; charset=utf-8", "no-cache");
  }

  const path = decodeURIComponent(new URL(req.url).pathname);

  if (path.startsWith("/assets/")) {
    const res = await serveDistFile(req, path.slice(1), "public, max-age=31536000, immutable");
    return res ?? respond("Not Found", 404, "text/plain; charset=utf-8", "no-cache");
  }

  if (path === "/" || !path.includes(".")) {
    // App shell and client-side routes: always revalidate so deploys land fast.
    const res = await serveDistFile(req, "index.html", "no-cache");
    return res ?? respond("Not Found", 404, "text/plain; charset=utf-8", "no-cache");
  }

  const res = await serveDistFile(req, path.slice(1), "public, max-age=86400");
  return res ?? respond("Not Found", 404, "text/plain; charset=utf-8", "no-cache");
});
