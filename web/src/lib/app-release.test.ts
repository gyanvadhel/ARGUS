import { describe, expect, it } from "vitest";
import { pickAndroidRelease, type GithubRelease } from "./app-release";

const asset = (name: string) => ({ name, browser_download_url: `https://github.com/gyanvadhel/ARGUS/releases/download/x/${name}` });
const release = (tag: string, names: string[], extra: Partial<GithubRelease> = {}): GithubRelease => ({
  tag_name: tag, draft: false, prerelease: false, body: "Notes", published_at: "2026-10-01T10:00:00Z", assets: names.map(asset), ...extra,
});

describe("pickAndroidRelease", () => {
  it("takes the newest published Android release and its APKs", () => {
    const r = pickAndroidRelease([
      release("android-v0.2.0", ["argus-0.2.0.apk", "argus-sms-helper-0.2.0.apk"]),
      release("android-v0.1.0", ["argus-0.1.0.apk"]),
    ]);
    expect(r).toEqual({
      version: "0.2.0",
      apk: asset("argus-0.2.0.apk").browser_download_url,
      smsHelperApk: asset("argus-sms-helper-0.2.0.apk").browser_download_url,
      notes: "Notes",
      publishedAt: "2026-10-01T10:00:00Z",
    });
  });
  it("skips drafts, pre-releases, other tags and releases without the app", () => {
    const r = pickAndroidRelease([
      release("android-v0.4.0", ["argus-0.4.0.apk"], { draft: true }),
      release("android-v0.3.0", ["argus-0.3.0.apk"], { prerelease: true }),
      release("extension-v1.0.0", ["argus-extension.zip"]),
      release("android-v0.2.1", ["notes.txt"]),
      release("android-v0.2.0", ["argus-0.2.0.apk"]),
    ]);
    expect(r?.version).toBe("0.2.0");
    expect(r?.smsHelperApk).toBeNull();
  });
  it("says so when there's no Android release yet", () => {
    expect(pickAndroidRelease([])).toBeNull();
  });
});
