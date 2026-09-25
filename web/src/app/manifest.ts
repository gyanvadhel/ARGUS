import type { MetadataRoute } from "next";

// "Add to home screen": Argus opens like an app, with its own icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Argus",
    short_name: "Argus",
    description: "Scan links, files, emails, texts and phone numbers against real threat intelligence.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#08080a",
    theme_color: "#08080a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
