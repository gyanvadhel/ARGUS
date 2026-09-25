// Watches every page you open. As a page starts loading, Argus checks its address against the live feeds;
// anything Suspicious or worse is swapped for a warning page before you can type into it.
import { getSettings, quickCheck } from "./lib/api.js";
import { isCheckable, levelOf, shouldWarn } from "./lib/verdict.js";

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map(); // url -> { at, verdict }

async function check(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.verdict;
  const verdict = await quickCheck(url);
  cache.set(url, { at: Date.now(), verdict });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return verdict;
}

async function allowedThisSession(url) {
  const { allow = [] } = await chrome.storage.session.get("allow");
  return allow.includes(new URL(url).hostname);
}

async function setBadge(tabId, verdict) {
  const { badge, color } = verdict ? levelOf(verdict) : { badge: "", color: "#8f8b93" };
  try {
    await chrome.action.setBadgeText({ tabId, text: badge });
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeTextColor?.({ tabId, color: "#08080a" });
  } catch {
    // the tab closed while we were checking
  }
}

chrome.webNavigation.onBeforeNavigate.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0 || !isCheckable(url)) return;
  const { protect } = await getSettings();
  if (!protect || (await allowedThisSession(url))) return;
  let verdict;
  try {
    verdict = await check(url);
  } catch {
    return; // engine offline: never block browsing because Argus is down
  }
  await chrome.storage.session.set({ [`tab:${tabId}`]: { url, verdict } });
  if (shouldWarn(verdict)) {
    await chrome.tabs.update(tabId, { url: chrome.runtime.getURL(`warning.html?u=${encodeURIComponent(url)}`) });
  }
});

// Badges are set once the page commits, so they survive the navigation that triggered them.
chrome.webNavigation.onCommitted.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  const hit = isCheckable(url) ? cache.get(url) : null;
  await setBadge(tabId, hit?.verdict ?? null);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "argus-link", title: "Check this link with Argus", contexts: ["link"] });
  chrome.contextMenus.create({ id: "argus-page", title: "Check this page with Argus", contexts: ["page"] });
});

chrome.contextMenus.onClicked.addListener((info) => {
  const url = info.linkUrl || info.pageUrl;
  if (!url) return;
  chrome.windows.create({
    url: chrome.runtime.getURL(`popup.html?u=${encodeURIComponent(url)}`),
    type: "popup",
    width: 400,
    height: 640,
  });
});
