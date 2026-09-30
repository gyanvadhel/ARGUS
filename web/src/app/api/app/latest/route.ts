import { latestAndroidRelease } from "@/lib/app-release";

export const revalidate = 3600;

export async function GET() {
  try {
    const release = await latestAndroidRelease();
    if (!release) return Response.json({ error: "No Android release yet." }, { status: 404 });
    return Response.json(release, { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return Response.json({ error: "Couldn't check for updates right now." }, { status: 502 });
  }
}
