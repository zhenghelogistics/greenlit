/**
 * §9.3. A customer's sites.
 *
 * Delivery and stuffing addresses were free text on each job, so the same
 * warehouse was typed a dozen ways and none of them matched. Two facts that
 * decide how a job is planned had nowhere to live at all: whether a
 * double-mounted chassis can get into the site, and whether the driver usually
 * waits there.
 */

export interface CustomerLocation {
  locationId: string;
  customerCode: string;
  /**
   * The company at this address.
   *
   * Usually one of the customer's own customers: the customer holds the
   * retainer and is invoiced, this company receives the container. Operations
   * put it plainly — Chong Cheong is the customer, Company A and Company B are
   * its customers, and each has its own addresses.
   *
   * A flat list of addresses under a customer could not express that, and the
   * new-job form had been written against a Delivery company picker for a
   * field that did not exist yet.
   */
  company: string;
  /** What the customer calls it. The address is what the driver needs. */
  label: string;
  address: string;
  /**
   * What is always true about delivering here.
   *
   * The gate to use, who to call, that the forklift is only there before noon.
   * It belongs to the place and not to the trip, which is why a job may still
   * override it for one delivery without changing the site.
   */
  operationalInstructions: string | null;
  isDefault: boolean;
  /** §19.1. Some sites cannot receive a double-mounted chassis. */
  doubleMountingPermitted: boolean;
  /** §21.3. A default about this site, not an instruction for this trip. */
  standbyUsual: boolean;
  active: boolean;
}

/**
 * Is this location usable on a new booking?
 *
 * Inactive sites stay on the record because old jobs point at them and a job's
 * history should still say where it went. They just stop being offered.
 */
export const selectableLocations = (
  locations: readonly CustomerLocation[],
): readonly CustomerLocation[] => locations.filter((l) => l.active);

/**
 * The one a new job should start with.
 *
 * The default if there is one, otherwise the only active site, otherwise
 * nothing — because guessing between three warehouses is worse than asking.
 */
export function defaultLocation(
  locations: readonly CustomerLocation[],
): CustomerLocation | null {
  const active = selectableLocations(locations);
  return active.find((l) => l.isDefault) ?? (active.length === 1 ? active[0]! : null);
}

/**
 * §19.1. Can a double-mounted chassis run between these two sites?
 *
 * Both ends must permit it. This was §57 gap 2.1-3: the Movement type carried
 * the flag and nothing checked it, so a double mount could be planned into a
 * site that cannot physically receive one — which is discovered by a driver,
 * at the gate, with two containers on.
 */
export function doubleMountingProblem(
  origin: CustomerLocation | null,
  destination: CustomerLocation | null,
): string | null {
  const blocked = [origin, destination]
    .filter((l): l is CustomerLocation => l !== null && !l.doubleMountingPermitted);

  if (blocked.length === 0) return null;
  return blocked.length === 2
    ? `Neither ${blocked[0]!.label} nor ${blocked[1]!.label} can receive a double-mounted chassis.`
    : `${blocked[0]!.label} cannot receive a double-mounted chassis.`;
}

/**
 * Whether a site is missing something a driver needs.
 *
 * A label with no address is a site nobody can be sent to, and it is easier to
 * catch here than at seven in the morning.
 */
export function locationProblem(
  draft: { label?: string; address?: string },
): string | null {
  if (!draft.label?.trim()) return 'Give the site a name the customer would recognise.';
  if (!draft.address?.trim()) return 'A site needs an address, or nobody can be sent to it.';
  return null;
}
