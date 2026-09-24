const fs = require("fs");
// Extracted from the demo itself, in document order, which is the order a
// browser evaluates them and therefore the order in which a later definition
// overwrites an earlier one.
const html = fs.readFileSync(
  require("path").join(__dirname, "../../pm-demo/ZHT_Operations_Demo_v12_135.html"), "utf8");
const blocks = html.match(/<script(?![^>]*\bsrc=)(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)
  .map((b) => b.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));

// His code schedules work with setTimeout, and that work touches a DOM that is
// not here. Swallowing the timers keeps the evaluation honest — the functions
// are defined, nothing pretends to render.
globalThis.setTimeout = () => 0;
globalThis.setInterval = () => 0;
globalThis.clearTimeout = () => {};

const stub = () => new Proxy({}, {
  get: (_t, k) => {
    if (k === "value" || k === "textContent" || k === "innerHTML") return "";
    if (k === "checked") return false;
    if (k === "style" || k === "dataset") return {};
    if (k === "classList") return { toggle(){}, add(){}, remove(){}, contains: () => false };
    if (k === "options" || k === "files" || k === "children") return [];
    if (typeof k === "string" && k.startsWith("querySelectorAll")) return () => [];
    return () => null;
  },
  set: () => true,
});
globalThis.document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: stub, addEventListener: () => {}, body: stub(),
  readyState: "complete", documentElement: stub(),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem(){}, removeItem(){}, key: () => null, length: 0 };
globalThis.alert = () => {}; globalThis.confirm = () => true; globalThis.prompt = () => null;
globalThis.MutationObserver = class { observe(){} disconnect(){} };
globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
globalThis.addEventListener = () => {};

let ran = 0, skipped = [];
blocks.forEach((b, i) => {
  try { (0, eval)(b); ran++; } catch (e) { skipped.push(i); }
});
// Two of his blocks have genuine syntax errors -- an unclosed forEach( and an
// unclosed Array.from( -- so they never execute in a browser either. Two more
// only fail here, because this shim has no real DOM.
module.exports.__ran = ran;
module.exports.__skipped = skipped;
module.exports = globalThis;
