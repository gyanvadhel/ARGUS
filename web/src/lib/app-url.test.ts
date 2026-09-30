import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "./app-url";

const APP = "https://askargus.app";

describe("canonicalRedirect", () => {
  it("forwards the live site's old vercel.app address to the same page on the real one", () => {
    expect(canonicalRedirect(new URL("https://argus-watcher.vercel.app/scan?input=hi&run=1"), APP, "production")).toBe(
      "https://askargus.app/scan?input=hi&run=1",
    );
    expect(canonicalRedirect(new URL("https://argus-pi-opal.vercel.app/"), APP, "production")).toBe("https://askargus.app/");
  });

  it("serves the real address, previews and local development as they are", () => {
    expect(canonicalRedirect(new URL("https://askargus.app/dashboard"), APP, "production")).toBeNull();
    expect(canonicalRedirect(new URL("https://argus-git-feature-gyanvadhels-projects.vercel.app/"), APP, "preview")).toBeNull();
    expect(canonicalRedirect(new URL("http://localhost:3000/"), "http://localhost:3000", undefined)).toBeNull();
  });

  it("leaves other addresses alone, such as www (Vercel forwards that itself)", () => {
    expect(canonicalRedirect(new URL("https://www.askargus.app/"), APP, "production")).toBeNull();
  });
});
