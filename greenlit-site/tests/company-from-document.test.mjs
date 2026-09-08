import { test } from "node:test";
import assert from "node:assert/strict";
import { companyNameFromConsignee, suggestCode } from "../lib/company-from-document.mjs";

test("the address is dropped from a flattened consignee block", () => {
  assert.equal(
    companyNameFromConsignee(
      "DKSH SINGAPORE PTE LTD · 47, JALAN BUROH SINGAPORE 619491 · SINGAPORE SINGAPORE SINGAPORE",
    ),
    "DKSH SINGAPORE PTE LTD",
  );
});

test("an address that runs on without a separator is still dropped", () => {
  assert.equal(companyNameFromConsignee("ACME PTE LTD 47, JALAN BUROH"), "ACME PTE LTD");
});

test("a bare name survives unchanged", () => {
  assert.equal(companyNameFromConsignee("Straits Cargo Pte Ltd"), "Straits Cargo Pte Ltd");
});

test("a blank consignee yields a blank name rather than throwing", () => {
  assert.equal(companyNameFromConsignee(null), "");
  assert.equal(companyNameFromConsignee(""), "");
});

test("the suggested code is the distinctive word, not initials", () => {
  assert.equal(suggestCode("DKSH SINGAPORE PTE LTD"), "DKSH");
  assert.equal(suggestCode("Meridian Freight Pte Ltd"), "MERIDI");
});

test("a short leading word becomes initials instead", () => {
  assert.equal(suggestCode("A B Logistics"), "ABL");
});

test("a name with no letters suggests nothing rather than a bad code", () => {
  assert.equal(suggestCode("1234"), "");
  assert.equal(suggestCode(""), "");
});
