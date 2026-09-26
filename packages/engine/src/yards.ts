/**
 * The depots an empty container goes back to.
 *
 * An arrival notice names the yard in whatever words the carrier uses, and
 * operations need the one on their own list — because "Allied" is four
 * different addresses and a driver can only go to one of them.
 *
 * ## Yards and sites
 *
 * Most yards are one place and the name is enough. Three are not, and they are
 * the ones worth getting right: Allied, CWT and Eng Kong each run several
 * depots, each with its own code on the paperwork. TBL1 and ALLIED 1 are the
 * same gate at 1 Tuas Basin Lane; CWTJB is CWT's Jalan Buroh yard and CWTTUAS
 * is twenty minutes away.
 *
 * So a yard has sites, and a yard with one site is just the ordinary case.
 *
 * ## The addresses that are missing
 *
 * Most of these have no address yet, and that is recorded rather than hidden:
 * operations have the names and will fill the rest in. A yard with no address
 * is still a yard somebody can choose — it is the matching that gets better
 * when the address arrives, not the existence of the depot.
 *
 * ## What is deliberately not here
 *
 * Rates. Operations were explicit that yard rates belong to billing, and this
 * application does not do billing yet. A rate modelled now would be a number
 * nobody maintains, read by nothing, wrong by the time it matters.
 *
 * ## Why this is code and not a table, for now
 *
 * The same trade as the carriers: it ships today, it is tested, and the
 * matching below is a rule. The cost is real — adding an address needs a
 * deploy rather than a form — and the moment operations want to maintain this
 * themselves it becomes a table the engine reads. That is a change of storage,
 * not of shape.
 */

export interface YardSite {
  /** What the paperwork calls this particular gate. */
  code: string;
  /** Any other codes the same gate is written as. */
  alsoKnownAs?: readonly string[];
  /** Null until operations fill it in. */
  address: string | null;
}

export interface Yard {
  /** Short code, where operations use one. */
  code: string;
  name: string;
  /** One entry for an ordinary yard; several where the depot has branches. */
  sites: readonly YardSite[];
}

export const YARDS: readonly Yard[] = [
  {
    code: 'ADTINE', name: 'Adtine Container',
    sites: [{ code: 'ADTINE', address: null }],
  },
  {
    code: 'A', name: 'Allied Yard',
    sites: [
      {
        code: 'ALLIED 1', alsoKnownAs: ['TBL1', 'TBL 1'],
        address: '1 Tuas Basin Lane, Singapore 637066',
      },
      { code: 'ALLIED 3', address: '25 Penjuru Lane, Singapore 609194' },
      { code: 'ALLIED 5', address: '18A Penjuru Walk, Singapore 609150' },
      { code: 'ALLIED 8', address: '15 Pioneer Crescent, Singapore 628552' },
    ],
  },
  {
    code: 'AZON', name: 'Azon Container',
    sites: [{ code: 'AZON', address: null }],
  },
  {
    code: 'CUA', name: 'Chuan Li Yard',
    sites: [{ code: 'CUA', alsoKnownAs: ['CL2'], address: null }],
  },
  {
    code: 'CGC', name: 'Cogent Yard',
    sites: [{ code: 'CGC', address: null }],
  },
  {
    code: 'CC', name: 'Container Connection',
    sites: [{ code: 'CC', address: null }],
  },
  {
    code: 'CWT', name: 'CWT Yard',
    sites: [
      {
        code: 'CWTJB', alsoKnownAs: ['CWT1', 'CWT 1', 'CWT Jalan Buroh'],
        address: '47 Jalan Buroh, Singapore 619491',
      },
      {
        code: 'CWTTUAS', alsoKnownAs: ['CWT2', 'CWT 2', 'CWT Tuas'],
        address: '12 Tuas South Street 2, Singapore 638039',
      },
      {
        code: 'CWTPNR', alsoKnownAs: ['CWT3', 'CWT 3', 'CWT Pioneer'],
        address: '22 Pioneer Sector 2, Singapore 628380',
      },
    ],
  },
  {
    code: 'EK', name: 'Eng Kong Yard',
    sites: [
      {
        code: 'EK 13', alsoKnownAs: ['Eng Kong 13'],
        address: '8A Tuas Avenue 13, Singapore 638981',
      },
      {
        code: 'EK PNR', alsoKnownAs: ['Eng Kong Pioneer'],
        address: '30 Pioneer Sector 2, Singapore 628386',
      },
      {
        code: 'EK 4', alsoKnownAs: ['Eng Kong 4'],
        address: '61 Tuas South Street 5, Singapore 637382',
      },
      {
        code: 'EK 11', alsoKnownAs: ['Eng Kong 11'],
        address: '15 Tuas Avenue 11, Singapore 639081',
      },
    ],
  },
  {
    code: 'HLA', name: 'HLA Yard',
    sites: [{ code: 'HLA', address: null }],
  },
  {
    code: 'MASTERFAITH', name: 'Master Faith Yard',
    sites: [{ code: 'MASTERFAITH', address: null }],
  },
  {
    code: 'PIONEER', name: 'Pioneer Container',
    sites: [{ code: 'PIONEER', address: null }],
  },
  {
    // An Evergreen empty going back here needs an email first, to create the
    // MTC and the smart booking — see `carriers.ts`.
    code: 'PSA', name: 'PSA',
    sites: [{ code: 'PSA', address: null }],
  },
  {
    code: 'TBC', name: 'TBC Yard',
    sites: [{ code: 'TBC', address: null }],
  },
  {
    code: 'TONG', name: 'Tong Container',
    sites: [{ code: 'TONG', address: null }],
  },
  {
    code: 'WSM', name: 'Wing Seng Yard',
    sites: [{ code: 'WSM', address: null }],
  },
];

/** Every site, with the yard it belongs to, for matching and for pickers. */
export const YARD_SITES: readonly { yard: Yard; site: YardSite }[] =
  YARDS.flatMap((yard) => yard.sites.map((site) => ({ yard, site })));

const flatten = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Which yard and gate a document is naming.
 *
 * Matched on every name a gate goes by — its code, the codes it is also
 * written as, the yard's own code and name, and the address.
 *
 * Two directions, because documents get it wrong in two directions. A notice
 * writes more than the name ("EMPTY RETURN: CWT TUAS YARD"), so the name has
 * to be findable inside the text. And a notice writes less than the name
 * ("22 Pioneer Sector 2" against a master address that carries the postcode),
 * so the text has to be findable at the start of the name. Only at the start:
 * "Tuas" appears in the middle of half this list and matches nothing useful.
 *
 * The longest match wins, so "CWT" does not answer a document that said
 * "CWT1" and send a driver to the wrong end of the island.
 *
 * Returns null rather than a guess, and that includes a match that lands on
 * more than one gate: "Eng Kong" names four depots and answering with any one
 * of them is a coin flip with a container on it. Operations correct this field
 * by hand, so an empty one costs a moment and a wrong one costs a trip.
 */
export function matchYard(printed: string | null | undefined):
  { yard: Yard; site: YardSite } | null {
  const text = flatten(String(printed ?? ''));
  if (!text) return null;

  const candidates = YARD_SITES.flatMap(({ yard, site }) => [
    ...(site.alsoKnownAs ?? []).map((name) => ({ name, yard, site })),
    { name: site.code, yard, site },
    { name: site.address ?? '', yard, site },
    { name: yard.name, yard, site },
    { name: yard.code, yard, site },
  ]).flatMap((c) => {
    const needle = flatten(c.name);
    if (!needle) return [];
    // A name inside the text, or the text at the head of a name. Both floors
    // exist to stop a fragment deciding: "CC" is two letters and appears in
    // plenty of prose, and a four-letter opening like "TUAS" opens several of
    // these addresses.
    // An exact name is always evidence, however short: "CC" is Container
    // Connection's whole code. The floors below only govern partial matches.
    const hit = needle === text
      || (needle.length >= 3 && text.includes(needle))
      || (text.length >= 5 && needle.startsWith(text));
    return hit ? [{ ...c, needle }] : [];
  });
  if (!candidates.length) return null;

  // Three kinds of evidence, strongest first, because more text matched is not
  // the same as better matched.
  //
  //   exact    the document wrote the name and nothing else.
  //   prefix   the document wrote less than the name — every character it did
  //            write is accounted for. "22 Pioneer Sector 2" is the whole of
  //            what the notice said and the head of one master address.
  //   inside   the document wrote more than the name, and the name was found
  //            in it. Weakest, because it is also how "Pioneer Container" gets
  //            found inside "22 Pioneer Sector 2" — the wrong yard entirely.
  //
  // Prefix beats inside for that reason: a partial name that explains all of
  // the text is better evidence than a whole name that explains a seventh of
  // it. Within `inside`, the longest name wins, so "CWT" cannot answer a
  // document that said "CWT1".
  const exact = candidates.filter((c) => c.needle === text);
  const prefix = candidates.filter((c) => c.needle !== text && c.needle.startsWith(text));
  const inside = candidates.filter((c) => c.needle !== text && text.includes(c.needle));

  const longest = (group: typeof candidates) => {
    const most = Math.max(...group.map((c) => c.needle.length));
    return group.filter((c) => c.needle.length === most);
  };

  const best = exact.length ? exact
    // Every prefix hit explains exactly as much of the text as every other, so
    // they are weighed together rather than by name length: the longest name
    // is the one with the most left unmatched, not the best fit.
    : prefix.length ? prefix
    : inside.length ? longest(inside)
    : [];
  if (!best.length) return null;

  const first = best[0]!;
  return best.every((c) => c.site === first.site)
    ? { yard: first.yard, site: first.site }
    : null;
}

/** How a gate is written on screen: the yard, then which of its gates. */
export function yardLabel(yard: Yard, site: YardSite): string {
  if (yard.sites.length === 1) return yard.name;
  return `${yard.name} — ${site.code}`;
}
