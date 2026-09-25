import { getSettings } from "./lib/api.js";

const $ = (id) => document.getElementById(id);

(async () => {
  const s = await getSettings();
  $("api").value = s.api;
  $("app").value = s.app;
  $("protect").checked = s.protect;
})();

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await chrome.storage.sync.set({ api: $("api").value.trim(), app: $("app").value.trim(), protect: $("protect").checked });
  $("saved").textContent = "Saved";
  setTimeout(() => ($("saved").textContent = ""), 1800);
});
