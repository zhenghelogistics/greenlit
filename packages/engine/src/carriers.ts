/**
 * The master carriers, and where each one's answers actually come from.
 *
 * An arrival notice issued by the carrier names itself, and one issued by a
 * forwarder often does not — so the carrier has to be selectable rather than
 * only read. That is the immediate reason this exists.
 *
 * The larger reason is the third column. Operations do not look up a last free
 * day in one place: for Yang Ming it is on the notice, for OOCL it is on the
 * carrier's website, for MSC it is an email somebody has to send and wait for.
 * That knowledge decided every morning how long a job took, and it lived in
 * the heads of the people who had been there longest. Writing it down is most
 * of the value here — the dropdown is the small part.
 *
 * ## Why this is code and not a table
 *
 * A carrier's terms change on the order of years, and the standard free days
 * below are part of how free time is counted, which is a rule. Reference data
 * that rules depend on belongs where the rules are.
 *
 * The tradeoff is real: changing a carrier needs a deploy rather than a form.
 * If operations start needing to add carriers themselves — a new feeder line,
 * a renegotiated allowance — this becomes a table and the engine reads it.
 * That is a change of storage, not of shape, and the shape is what is being
 * settled here.
 */

/** Where a fact about a container is found, for this carrier. */
export type Lookup =
  /** Printed on the arrival notice. Nothing to chase. */
  | 'NOTICE'
  /** On the Portnet storing order. */
  | 'PORTNET'
  /** The carrier's own website, signed in. */
  | 'WEBSITE'
  /** Somebody has to ask, and wait. */
  | 'EMAIL';

export interface Carrier {
  /** The two-letter code operations use. It is what appears on screen. */
  code: string;
  /** Short enough to read in a table. */
  name: string;
  /** The full legal name, for matching what a document prints. */
  legalName: string;
  /** Where the empty return yard is found. */
  returnYard: Lookup;
  /** Where the last free day is found. */
  lastFreeDay: Lookup;
  /**
   * The allowance this carrier gives as standard, where there is one.
   *
   * A default to count from, never a substitute for the real figure: several
   * of these carriers only publish a last free day once the container has
   * been discharged, so the standard is what a controller plans against until
   * the real one exists.
   */
  standard: { demurrageDays?: number; detentionDays?: number; combinedDays?: number } | null;
  /**
   * What somebody has to know about this carrier that the columns cannot say.
   *
   * Written as the instruction it is, because this is the part that was in
   * people's heads.
   */
  note: string | null;
}

/**
 * The carriers, as operations gave them.
 *
 * Ordered by code so the dropdown is predictable rather than by any judgement
 * about which matters more, which changes by the week.
 */
export const CARRIERS: readonly Carrier[] = [
  {
    code: 'AL', name: 'ANL', legalName: 'ANL Container Line',
    returnYard: 'PORTNET', lastFreeDay: 'WEBSITE',
    standard: { demurrageDays: 3, detentionDays: 3 },
    note: 'Last free day appears only after the container is discharged. Reefers are 3 days combined.',
  },
  {
    code: 'CC', name: 'COSCO', legalName: 'COSCO Shipping Lines',
    returnYard: 'NOTICE', lastFreeDay: 'WEBSITE',
    standard: null,
    note: 'The website needs the OBL number.',
  },
  {
    code: 'CM', name: 'CMA CGM', legalName: 'CMA CGM',
    returnYard: 'PORTNET', lastFreeDay: 'WEBSITE',
    standard: { demurrageDays: 3, detentionDays: 3 },
    note: 'Last free day appears only after the container is discharged. Reefers are 3 days combined.',
  },
  {
    code: 'CX', name: 'CNC', legalName: 'CNC Line',
    returnYard: 'PORTNET', lastFreeDay: 'WEBSITE',
    standard: { demurrageDays: 3, detentionDays: 3 },
    note: 'Last free day appears only after the container is discharged. Reefers are 3 days combined.',
  },
  {
    code: 'EA', name: 'Evergreen', legalName: 'Evergreen Marine',
    returnYard: 'EMAIL', lastFreeDay: 'EMAIL',
    standard: null,
    note: 'An empty going back to PSA Gate 4 needs an email to Evergreen to create the MTC and the smart booking.',
  },
  {
    code: 'EH', name: 'Evergreen', legalName: 'Evergreen Marine',
    returnYard: 'EMAIL', lastFreeDay: 'EMAIL',
    standard: null,
    note: 'An empty going back to PSA Gate 4 needs an email to Evergreen to create the MTC and the smart booking.',
  },
  {
    code: 'HE', name: 'Heung-A', legalName: 'Heung-A Shipping',
    returnYard: 'EMAIL', lastFreeDay: 'EMAIL',
    standard: null,
    note: 'Both the yard and the last free day have to be asked for by email.',
  },
  {
    code: 'HL', name: 'Hapag-Lloyd', legalName: 'Hapag-Lloyd',
    returnYard: 'PORTNET', lastFreeDay: 'PORTNET',
    standard: { demurrageDays: 3, detentionDays: 4 },
    note: 'Portnet carries the detention date. The demurrage one has to be asked for by email. '
      + 'Demurrage counts from discharge.',
  },
  {
    code: 'HY', name: 'Hyundai', legalName: 'HMM',
    returnYard: 'WEBSITE', lastFreeDay: 'WEBSITE',
    standard: { demurrageDays: 3 },
    note: 'The last free day appears only after the container is discharged.',
  },
  {
    code: 'IL', name: 'Interasia', legalName: 'Interasia Lines',
    returnYard: 'NOTICE', lastFreeDay: 'NOTICE',
    standard: { demurrageDays: 3, detentionDays: 3 },
    note: 'The notice needs a password login. Demurrage is 72 hours rather than 3 calendar days.',
  },
  {
    code: 'KM', name: 'KMTC', legalName: 'Korea Marine Transport Co',
    returnYard: 'PORTNET', lastFreeDay: 'WEBSITE',
    standard: { combinedDays: 6 },
    note: 'Six calendar days combined. A reefer returns to TBL1.',
  },
  {
    code: 'MD', name: 'MSC', legalName: 'Mediterranean Shipping Company',
    returnYard: 'PORTNET', lastFreeDay: 'EMAIL',
    standard: null,
    note: 'The last free day has to be asked for by email.',
  },
  {
    code: 'MS', name: 'Maersk', legalName: 'Maersk Line',
    returnYard: 'PORTNET', lastFreeDay: 'WEBSITE',
    standard: null,
    note: 'The website needs the OBL number.',
  },
  {
    code: 'NJ', name: 'Namsung Starline', legalName: 'Namsung Shipping',
    returnYard: 'NOTICE', lastFreeDay: 'NOTICE',
    standard: null,
    note: 'Demurrage and detention are given combined, never separately.',
  },
  {
    code: 'ON', name: 'ONE', legalName: 'Ocean Network Express',
    returnYard: 'PORTNET', lastFreeDay: 'WEBSITE',
    standard: null,
    note: null,
  },
  {
    code: 'OR', name: 'OOCL', legalName: 'Orient Overseas Container Line',
    returnYard: 'WEBSITE', lastFreeDay: 'WEBSITE',
    standard: null,
    note: null,
  },
  {
    code: 'PI', name: 'PIL', legalName: 'Pacific International Lines',
    returnYard: 'PORTNET', lastFreeDay: 'EMAIL',
    standard: null,
    note: 'The last free day has to be asked for by email.',
  },
  {
    code: 'QM', name: 'Sinokor', legalName: 'Sinokor Merchant Marine',
    returnYard: 'EMAIL', lastFreeDay: 'EMAIL',
    standard: null,
    note: 'Both the yard and the last free day have to be asked for by email.',
  },
  {
    code: 'RC', name: 'RCL Feeder', legalName: 'Regional Container Lines',
    returnYard: 'NOTICE', lastFreeDay: 'WEBSITE',
    standard: null,
    note: 'The notice gives the yard; the last free day is on the RCL website.',
  },
  {
    code: 'WH', name: 'Wan Hai', legalName: 'Wan Hai Lines',
    returnYard: 'PORTNET', lastFreeDay: 'PORTNET',
    standard: { demurrageDays: 3, detentionDays: 3 },
    note: 'Demurrage counts 3 calendar days from discharge. Detention counts 3 days from the '
      + 'container leaving the port, excluding Sundays and public holidays.',
  },
  {
    code: 'YM', name: 'Yang Ming', legalName: 'Yang Ming Marine Transport',
    returnYard: 'NOTICE', lastFreeDay: 'NOTICE',
    standard: null,
    note: 'The notice gives both the yard and the last free day.',
  },
];

const BY_CODE = new Map(CARRIERS.map((c) => [c.code, c]));

/** The carrier with this code, or null. */
export const carrierByCode = (code: string | null | undefined): Carrier | null =>
  BY_CODE.get(String(code ?? '').trim().toUpperCase()) ?? null;

/**
 * Which carrier a document is naming.
 *
 * A notice prints "ORIENT OVERSEAS CONTAINER LINE LTD" and a person says
 * "OOCL"; both have to land on the same carrier. Matched on the code, the
 * short name and the legal name, longest first, so "CMA CGM" is not answered
 * by "CM" matching inside it.
 *
 * Returns null rather than a guess. A carrier chosen wrongly sends somebody to
 * the wrong website for a deadline, which is worse than being asked.
 */
export function matchCarrier(printed: string | null | undefined): Carrier | null {
  const text = String(printed ?? '').trim().toUpperCase();
  if (!text) return null;

  const exact = CARRIERS.find((c) =>
    c.code === text || c.name.toUpperCase() === text || c.legalName.toUpperCase() === text);
  if (exact) return exact;

  // Longest name first: "CNC LINE" must not be beaten by a shorter name that
  // happens to appear inside it.
  const byLength = [...CARRIERS].sort((a, b) => b.legalName.length - a.legalName.length);
  const contained = byLength.find((c) =>
    text.includes(c.legalName.toUpperCase()) || text.includes(c.name.toUpperCase()));
  return contained ?? null;
}

/** What to tell somebody about where to look, in the words they would use. */
export const LOOKUP_WORDS: Record<Lookup, string> = {
  NOTICE: 'on the arrival notice',
  PORTNET: 'on the Portnet storing order',
  WEBSITE: 'on the carrier’s website',
  EMAIL: 'by email — somebody has to ask',
};

/**
 * The free-time model a carrier's standard implies.
 *
 * Namsung and KMTC give one combined pool; the rest that publish anything give
 * demurrage and detention separately. §34.3 refuses to mix the two, so this
 * answers which shape a default should be written in rather than leaving the
 * caller to guess from which fields happen to be filled.
 */
export function standardFreeTime(carrier: Carrier | null): {
  model: 'COMBINED' | 'SPLIT'; demurrageDays: number | null;
  detentionDays: number | null; combinedDays: number | null;
} | null {
  if (!carrier?.standard) return null;
  const { demurrageDays = null, detentionDays = null, combinedDays = null } = carrier.standard;
  if (combinedDays !== null) {
    return { model: 'COMBINED', demurrageDays: null, detentionDays: null, combinedDays };
  }
  return { model: 'SPLIT', demurrageDays, detentionDays, combinedDays: null };
}
