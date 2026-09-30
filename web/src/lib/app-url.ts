/** The site's own address (https://argus-watcher.vercel.app live), used for links that must come back here. */
export const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
