import { evidenceUrl, fullCheck, getSettings, quickCheck } from "./lib/api.js";
import { isCheckable, levelOf, topReasons, vouchers } from "./lib/verdict.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let run = 0; // a newer check replaces an older one still in flight

function status(text, scanning) {
  $("status").textContent = text;
  $("scan").dataset.on = scanning ? "1" : "0";
}

function render(verdict) {
  const { label, color } = levelOf(verdict);
  document.documentElement.style.setProperty("--tone", color);
  $("score").textContent = String(verdict.score);
  $("label").textContent = label;
  const verified = verdict.level === "SAFE" && verdict.verified;
  $("threat").textContent =
    verdict.threat_type !== "None" ? verdict.threat_type : verified ? "Positive evidence it's legitimate" : "Nothing suspicious found";
  const lines = verdict.score >= 30 ? topReasons(verdict) : vouchers(verdict).slice(0, 2);
  $("reasons").replaceChildren(
    ...lines.map((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      return li;
    }),
  );
}

function fail(message) {
  document.documentElement.style.setProperty("--tone", "#8f8b93");
  $("score").textContent = "··";
  $("label").textContent = "No verdict";
  $("threat").textContent = "";
  $("reasons").replaceChildren();
  status(message, false);
}

async function check(url) {
  const mine = ++run;
  $("subject").textContent = url;
  $("evidence").hidden = true;
  if (!isCheckable(url)) {
    fail("Argus checks web pages: open a site, or paste a link below.");
    return;
  }
  document.documentElement.style.setProperty("--tone", "#8f8b93");
  $("score").textContent = "··";
  $("label").textContent = "Checking";
  $("threat").textContent = "";
  $("reasons").replaceChildren();
  status("Checking live phishing and malware feeds…", true);
  try {
    const quick = await quickCheck(url);
    if (mine !== run) return;
    render(quick);
  } catch (e) {
    if (mine === run) fail(`${e.message} Start it with dev.ps1, then try again.`);
    return;
  }
  $("evidence").href = await evidenceUrl(url);
  $("evidence").hidden = false;
  status("Visiting the site safely for the full check…", true);
  try {
    const full = await fullCheck(url);
    if (mine !== run) return;
    render(full);
    const answered = full.signals.filter((s) => !["unavailable", "error"].includes(s.status)).length;
    status(`Full check done: ${answered} sources answered.`, false);
  } catch (e) {
    if (mine === run) status(`Showing the instant check. ${e.message}`, false);
  }
}

async function currentUrl() {
  if (params.get("u")) return params.get("u");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ?? "";
}

$("check").addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = $("link").value.trim();
  if (!raw) return;
  void check(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
});

$("protect").addEventListener("change", (e) => {
  void chrome.storage.sync.set({ protect: e.target.checked });
});

(async () => {
  $("protect").checked = (await getSettings()).protect;
  await check(await currentUrl());
})();
