// Argus for Android is published as GitHub releases tagged "android-v<version>" with an "argus-<version>.apk".

export type GithubAsset = { name: string; browser_download_url: string };
export type GithubRelease = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  body?: string | null;
  published_at?: string | null;
  assets: GithubAsset[];
};
export type AndroidRelease = { version: string; apk: string; smsHelperApk: string | null; notes: string; publishedAt: string };

const TAG = "android-v";
const RELEASES_URL = "https://api.github.com/repos/gyanvadhel/ARGUS/releases?per_page=20";

export function pickAndroidRelease(releases: GithubRelease[]): AndroidRelease | null {
  for (const r of releases) {
    if (r.draft || r.prerelease || !r.tag_name.startsWith(TAG)) continue;
    const apk = r.assets.find((a) => /^argus-\d[\w.-]*\.apk$/.test(a.name));
    if (!apk) continue;
    const helper = r.assets.find((a) => /^argus-sms-helper-\d[\w.-]*\.apk$/.test(a.name));
    return {
      version: r.tag_name.slice(TAG.length),
      apk: apk.browser_download_url,
      smsHelperApk: helper?.browser_download_url ?? null,
      notes: (r.body ?? "").slice(0, 2000),
      publishedAt: r.published_at ?? "",
    };
  }
  return null;
}

/** The newest release, asked of GitHub at most once an hour. */
export async function latestAndroidRelease(): Promise<AndroidRelease | null> {
  const res = await fetch(RELEASES_URL, {
    headers: {
      accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return pickAndroidRelease((await res.json()) as GithubRelease[]);
}
