import { quickCheck } from "./lib/api.js";
import { levelOf, topReasons } from "./lib/verdict.js";

const $ = (id) => document.getElementById(id);
const url = new URLSearchParams(location.search).get("u") ?? "";
$("subject").textContent = url;

(async () => {
  try {
    const verdict = await quickCheck(url);
    const { label, color } = levelOf(verdict);
    document.documentElement.style.setProperty("--tone", color);
    $("pill").textContent = `${label} ${verdict.score}`;
    $("threat").textContent = verdict.threat_type !== "None" ? verdict.threat_type : "";
    $("reasons").replaceChildren(
      ...topReasons(verdict, 4).map((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        return li;
      }),
    );
  } catch (e) {
    $("pill").textContent = "Flagged";
    $("reasons").replaceChildren(Object.assign(document.createElement("li"), { textContent: e.message }));
  }
})();

$("back").addEventListener("click", () => {
  // Not history.back(): the entry before this one may be the dangerous page itself.
  void chrome.tabs.update({ url: "chrome://newtab/" });
});

$("continue").addEventListener("click", async () => {
  const host = new URL(url).hostname;
  const { allow = [] } = await chrome.storage.session.get("allow");
  await chrome.storage.session.set({ allow: [...new Set([...allow, host])] });
  location.href = url;
});
