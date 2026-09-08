/**
 * Turning a consignee block into a company.
 *
 * A consignee on a bill of lading is an address block, not a name: the name is
 * the first line and the rest is where to deliver. It arrives here flattened —
 * "DKSH SINGAPORE PTE LTD · 47, JALAN BUROH SINGAPORE 619491 · SINGAPORE
 * SINGAPORE SINGAPORE" — so the name has to be recovered before it can be
 * offered as a company, or the operator is asked to confirm a company whose
 * name contains a postcode.
 */

/** Everything after the first separator is address, not name. */
export function companyNameFromConsignee(consignee) {
  const first = String(consignee ?? "")
    .split(/[·\n|]/)[0]
    .trim()
    // A street number ending the segment means the address ran on without a
    // separator: "ACME PTE LTD 47, JALAN BUROH".
    .replace(/\s+\d+[,\s].*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return first;
}

const SUFFIXES = /\b(PTE|PTY|LTD|LIMITED|LLC|INC|CO|CORP|CORPORATION|GMBH|BV|SDN|BHD|PLC)\b\.?/gi;

/**
 * A code goes on paperwork and into every job reference, and it is immutable
 * once issued — so this only ever suggests. The operator confirms or replaces
 * it, and the server is the authority on whether it is free.
 */
export function suggestCode(companyName) {
  const words = String(companyName ?? "")
    .replace(SUFFIXES, " ")
    .replace(/[^A-Za-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "";

  // A distinctive first word is the code operators would pick themselves —
  // DKSH SINGAPORE PTE LTD is "DKSH", not "DS".
  const first = words[0].toUpperCase();
  if (first.length >= 2 && first.length <= 6) return first;
  if (first.length > 6) return first.slice(0, 6);

  // A short first word ("A B Logistics") reads better as initials.
  return words.map((w) => w[0].toUpperCase()).join("").slice(0, 6);
}
