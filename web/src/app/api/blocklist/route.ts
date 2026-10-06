import "server-only";

const ENGINE = process.env.ARGUS_API_URL ?? "http://127.0.0.1:8000";

/**
 * Public blocklist proxy: fetches from the engine and caches aggressively
 * via Vercel's CDN (6h fresh, 24h stale-while-revalidate).
 */
export async function GET() {
  const headers = new Headers();
  const token = process.env.ARGUS_API_TOKEN;
  if (token) headers.set("authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${ENGINE}/blocklist`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return new Response("Engine unavailable\n", {
      status: 502,
      headers: { "Cache-Control": "no-cache" },
    });
  }

  if (!res.ok) {
    return new Response(`Engine error (${res.status})\n`, {
      status: 502,
      headers: { "Cache-Control": "no-cache" },
    });
  }

  const body = await res.text();
  if (!body.trim()) {
    return new Response("Blocklist warming up\n", {
      status: 503,
      headers: { "Cache-Control": "no-cache" },
    });
  }

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
