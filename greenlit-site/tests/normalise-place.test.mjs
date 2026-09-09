import { test } from "node:test";
import assert from "node:assert/strict";
import { normalisePlace } from "../lib/extract-claude.ts";

test("a UN/LOCODE beside the name is dropped", () => {
  // What two real documents actually printed.
  assert.equal(normalisePlace("SGSIN = Singapore, Singapore"), "Singapore");
  assert.equal(normalisePlace("CNSHA Shanghai"), "Shanghai");
  assert.equal(normalisePlace("MYPKG - Port Klang"), "Port Klang");
});

test("a plain place name is untouched", () => {
  assert.equal(normalisePlace("SINGAPORE"), "SINGAPORE");
  assert.equal(normalisePlace("NANSHA"), "NANSHA");
  assert.equal(normalisePlace("Port Klang"), "Port Klang");
});

test("a five-letter place is not mistaken for a code", () => {
  // The rule only strips when something remains after it.
  assert.equal(normalisePlace("TOKYO"), "TOKYO");
  assert.equal(normalisePlace("BUSAN"), "BUSAN");
});

test("city and country collapses to the port", () => {
  assert.equal(normalisePlace("Singapore, Singapore"), "Singapore");
  assert.equal(normalisePlace("Shanghai, China"), "Shanghai");
});

test("a bare code with no name beside it is expanded", () => {
  // The KMTC advice prints "SGSIN" and nothing else; there is no name in the
  // text to recover, so a small table for the ports this business uses.
  assert.equal(normalisePlace("SGSIN"), "SINGAPORE");
  assert.equal(normalisePlace("CNSHA"), "SHANGHAI");
});

test("an unknown code is kept rather than guessed", () => {
  // Still correct, just less readable. Better than inventing a port.
  assert.equal(normalisePlace("ZZZZZ"), "ZZZZZ");
});
