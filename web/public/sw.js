// Argus's service worker. It caches nothing and lets every request through, except one: a screenshot, link or
// message shared to Argus from another app's Share menu (Android, once Argus is installed). A shared image is held
// here, on the device, for the scanner page to read; links and messages go on to /share.
const SHARED_CACHE = "argus-shared";
const SHARED_IMAGE = "/shared-image";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.origin !== self.location.origin || url.pathname !== "/share") return;
  event.respondWith(
    (async () => {
      const form = await event.request.formData();
      const image = form.get("image");
      if (image instanceof File && image.size) {
        const cache = await caches.open(SHARED_CACHE);
        await cache.put(SHARED_IMAGE, new Response(image, {
          headers: { "content-type": image.type || "image/png", "x-file-name": encodeURIComponent(image.name || "screenshot") },
        }));
        return Response.redirect(new URL("/scan?shared=image", self.location.origin).href, 303);
      }
      const params = new URLSearchParams();
      for (const key of ["title", "text", "url"]) {
        const value = form.get(key);
        if (typeof value === "string" && value) params.set(key, value);
      }
      return Response.redirect(new URL(`/share?${params}`, self.location.origin).href, 303);
    })(),
  );
});
