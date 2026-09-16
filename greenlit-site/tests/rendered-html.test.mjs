import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * Next prerenders the page at build time, so the test reads that output rather
 * than booting a server.
 *
 * This previously imported the Cloudflare Worker entry and called
 * worker.fetch(request, env, ctx). That interface disappeared with the move to
 * Next on Vercel (ADR-0008); the assertions below are unchanged.
 */
async function render() {
  const html = await readFile(new URL("../.next/server/app/index.html", import.meta.url), "utf8");
  return { text: async () => html };
}

test("server-renders the Greenlit control tower", async () => {
  const response = await render();
  // No status or content-type assertions: this reads build output rather than
  // making a request, so faking a Response to keep them would assert nothing.
  const html = await response.text();
  assert.match(html, /<html lang="en-SG">/);
  assert.match(html, /<title>Project Greenlit — Control Tower<\/title>/);
  assert.match(html, /Greenlit/);
  assert.match(html, /Action Required/);
  assert.match(html, /Document Intake/);
  // The rail carries the PM's section names now. "Chassis Fleet" became his
  // "Chassis Master", so asserting the old label would fail on a rename rather
  // than on a regression — what is worth pinning is that the rail still ships
  // its sections server-rendered.
  assert.match(html, /Chassis Master/);
  assert.match(html, /Jobs/);
  assert.match(html, /Planning Board/);
  assert.match(html, /Customer Master/);
  assert.match(html, /Billing Ready/);
  assert.match(html, /Skip to main content/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/);
});

test("ships the document-intake contract", async () => {
  const [component, reader, parser, layout, jobDetail] = await Promise.all([
    readFile(new URL("../GreenlitControlTower.jsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/read-pdf.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/arrival-notice-parser.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ZhtJobDetail.jsx", import.meta.url), "utf8"),
  ]);

  // Intake posts the document to /api/extract, which is what lets it read a
  // scan or an unfamiliar carrier. The badge has to say so: the screen
  // previously claimed "Processed on this device", and a privacy claim that
  // has quietly stopped being true is worse than none.
  assert.doesNotMatch(component, /Processed on this device/,
    "the browser-local claim is no longer true and must not be shown");
  assert.match(component, /Read on Greenlit&rsquo;s server, not stored/);
  assert.match(component, /api\/extract/, "intake must call the extraction route");
  assert.match(component, /Review extracted facts/);
  assert.match(component, /Apply to control tower/);
  assert.match(component, /Planning dates require confirmation/);
  assert.match(component, /Choose documents/);
  // §29. There is no container cap any more — a single notice routinely lists
  // thirty to forty, and the old ceiling of twenty refused exactly the job
  // such a document creates. What is asserted instead is that nothing
  // reintroduces one in the screen that adds containers.
  assert.doesNotMatch(jobDetail, /container limit|MAX_CONTAINERS_PER_JOB/,
    "a cap here would refuse the long manifests operations actually receives");
  assert.match(component, /containerDrafts/);
  assert.match(component, /Save and recalculate/);

  // The job detail copy these used to assert belonged to the screen the PM's
  // markup replaced, and asserting his words against our old file is how a
  // test starts failing for a rename rather than a regression. What is worth
  // pinning is that the screen still reaches each capability, so each one is
  // asserted where it now lives and in his wording.
  assert.match(jobDetail, /Add Container/);
  assert.match(jobDetail, /Edit Container/);
  assert.match(jobDetail, /Movements/);
  assert.match(jobDetail, /Job Activity Log/);
  assert.match(jobDetail, /nextAction/,
    "§31: the next action is read from the engine, never decided on the screen");
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
