import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Greenlit control tower", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="en-SG">/);
  assert.match(html, /<title>Project Greenlit — Control Tower<\/title>/);
  assert.match(html, /Greenlit/);
  assert.match(html, /Action Required/);
  assert.match(html, /Document Intake/);
  assert.match(html, /Chassis Fleet/);
  assert.match(html, /Skip to main content/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/);
});

test("ships the browser-local document-intake contract", async () => {
  const [component, reader, parser, layout] = await Promise.all([
    readFile(new URL("../GreenlitControlTower.jsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/read-pdf.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/arrival-notice-parser.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(component, /Processed on this device/);
  assert.match(component, /Review extracted facts/);
  assert.match(component, /Apply to control tower/);
  assert.match(component, /Planning dates require confirmation/);
  assert.match(component, /Choose PDF/);
  assert.match(component, /20 container limit/);
  assert.match(component, /Add container/);
  assert.match(component, /Container identity/);
  assert.match(component, /containerDrafts/);
  assert.match(component, /Do this now/);
  assert.match(component, /Save and recalculate/);
  assert.match(component, /Manage container/);
  assert.match(component, /Add trip/);
  assert.match(component, /Job activity/);
  assert.match(reader, /15 \* 1024 \* 1024/);
  assert.match(reader, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
  assert.match(reader, /pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs/);
  assert.doesNotMatch(reader, /pdf\.worker\.min\.mjs\?url/);
  assert.match(reader, /Reading page/);
  assert.match(reader, /No selectable text was found/);
  assert.match(parser, /REQUIRED_JOB_FIELDS/);
  assert.match(layout, /browser-local arrival-notice intake/);
  assert.doesNotMatch(component, /localStorage|sessionStorage/);
});
