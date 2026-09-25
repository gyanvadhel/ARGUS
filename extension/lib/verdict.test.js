import assert from "node:assert/strict";
import { test } from "node:test";
import { isCheckable, levelOf, shouldWarn, topReasons, vouchers } from "./verdict.js";

test("checks web pages but never local, private or browser pages", () => {
  assert.equal(isCheckable("https://www.google.com/"), true);
  assert.equal(isCheckable("http://paypal-security-alert.net/verify"), true);
  for (const url of [
    "chrome://newtab/",
    "chrome-extension://abc/warning.html",
    "http://localhost:3000/",
    "http://127.0.0.1:8000/health",
    "http://192.168.1.1/",
    "http://10.0.0.8/router",
    "file:///C:/page.html",
    "about:blank",
    "not a url",
  ]) {
    assert.equal(isCheckable(url), false, url);
  }
});

test("only says Safe when something vouched for it", () => {
  assert.equal(levelOf({ level: "SAFE", verified: true, score: 0 }).label, "Safe");
  assert.equal(levelOf({ level: "SAFE", verified: false, score: 0 }).label, "No red flags");
  assert.equal(levelOf({ level: "SAFE", score: 0 }).label, "No red flags");
  assert.equal(levelOf({ level: "HIGH RISK", score: 96 }).label, "High risk");
});

test("warns at suspicious or worse", () => {
  assert.equal(shouldWarn({ score: 60 }), true);
  assert.equal(shouldWarn({ score: 59 }), false);
});

test("badges: a mark for danger, a tick for verified, nothing for no red flags", () => {
  assert.equal(levelOf({ level: "HIGH RISK", score: 90 }).badge, "!");
  assert.equal(levelOf({ level: "LOW/MODERATE", score: 40 }).badge, "!");
  assert.equal(levelOf({ level: "SAFE", verified: true, score: 0 }).badge, "✓");
  assert.equal(levelOf({ level: "SAFE", verified: false, score: 0 }).badge, "");
});

test("top reasons are the strongest red flags; vouchers are the positive evidence", () => {
  const verdict = {
    signals: [
      { status: "suspicious", score: 40, summary: "weaker" },
      { status: "malicious", score: 96, summary: "strongest" },
      { status: "clean", score: 0, summary: "one of the world's most visited sites", trust: 0.9 },
      { status: "clean", score: 0, summary: "ordinary clean result" },
    ],
  };
  assert.deepEqual(topReasons(verdict), ["strongest", "weaker"]);
  assert.deepEqual(vouchers(verdict), ["one of the world's most visited sites"]);
});
