import { getSettings } from "./lib/api.js";

const $ = (id) => document.getElementById(id);

(async () => {
  const s = await getSettings();
  $("api").value = s.api;
  $("app").value = s.app;
  $("token").value = s.token;
  $("protect").checked = s.protect;
})();

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await chrome.storage.sync.set({
    api: $("api").value.trim(),
    app: $("app").value.trim(),
    token: $("token").value.trim(),
    protect: $("protect").checked,
  });
  $("saved").textContent = "Saved";
  setTimeout(() => ($("saved").textContent = ""), 1800);
});
