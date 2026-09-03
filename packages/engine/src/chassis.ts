/**
 * §35. Chassis occupancy.
 *
 * The operating fact (§35.1): containers are never grounded, because no loose
 * cargo is handled. A container sits on a chassis from collection until
 * release, so **chassis occupancy equals job duration** — not trip count, not
 * truck hours. It includes every day the customer is stuffing or unstuffing
 * and every day the box sits at the carpark.
 *
 * That makes the chassis fleet the real ceiling on concurrent jobs, and §35.6
 * calls measuring it the clearest financial case in the project.
 */

export const CHASSIS_SIZE = ['20FT', '40FT'] as const;
export type ChassisSize = (typeof CHASSIS_SIZE)[number];

export const CHASSIS_STATUS = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INSPECTION', 'RETIRED'] as const;
export type ChassisStatus = (typeof CHASSIS_STATUS)[number];

/** §9.1. Master data: the fleet is fixed and every unit is registered. */
export interface Chassis {
  chassisId: string;
  chassisNo: string;
  plateNo: string;
  size: ChassisSize;
  unladenWeightKg: number | null;
  maxGrossWeightKg: number | null;
  inspectionDueDate: string | null;
  /** Manual states only. AVAILABLE and IN_USE are derived, never typed. */
  manualStatus: 'MAINTENANCE' | 'RETIRED' | null;
  active: boolean;
}

/** One container's hold on a chassis. */
export interface ChassisHolding {
  chassisId: string;
  containerId: string;
  jobId: string;
  mountedAt: string | null;
  releasedAt: string | null;
  /** §19.1. True where this holding is one half of a double-mounted pair. */
  doubleMountedWith: string | null;
}

/**
 * §35.2. Size must match, with one exception.
 *
 * A forty-foot container requires a forty-foot chassis. A twenty-foot
 * container requires a twenty-foot chassis **unless it is double mounted**, in
 * which case two twenty-foot containers share one forty-foot chassis.
 */
export function isChassisSizeValid(
  containerSize: string,
  chassisSize: ChassisSize,
  doubleMounted = false,
): { valid: boolean; reason: string | null } {
  const is20 = String(containerSize).includes('20');
  const is40 = String(containerSize).includes('40');

  if (is40) {
    return chassisSize === '40FT'
      ? { valid: true, reason: null }
      : { valid: false, reason: 'A forty-foot container requires a forty-foot chassis' };
  }
  if (is20) {
    if (chassisSize === '20FT') return { valid: true, reason: null };
    if (chassisSize === '40FT' && doubleMounted) return { valid: true, reason: null };
    return { valid: false, reason: doubleMounted
      ? 'Double mounting requires a forty-foot chassis'
      : 'A twenty-foot container requires a twenty-foot chassis unless it is double mounted' };
  }
  return { valid: false, reason: `Unrecognised container size ${containerSize}` };
}

/**
 * §35.3. Chassis status is derived, never typed.
 *
 * "A stored availability flag drifts the moment someone forgets to clear it.
 * Deriving it means the count is always exactly as truthful as the job
 * records."
 */
export function chassisStatus(
  unit: Chassis,
  holdings: readonly ChassisHolding[],
  today: string,
): ChassisStatus {
  if (!unit.active || unit.manualStatus === 'RETIRED') return 'RETIRED';

  // A unit under a container IS in use, whatever else is planned for it.
  // §35.3 lists IN_USE first, and §35.8 makes a maintenance withdrawal mid-job
  // an exception precisely because the two states conflict — reporting the
  // unit as MAINTENANCE while a container sits on it would hide the container.
  const held = holdings.some((h) => h.chassisId === unit.chassisId && h.releasedAt === null);
  if (held) return 'IN_USE';

  if (unit.inspectionDueDate && unit.inspectionDueDate <= today) return 'INSPECTION';
  if (unit.manualStatus === 'MAINTENANCE') return 'MAINTENANCE';
  return 'AVAILABLE';
}

export interface FleetAvailability {
  available20ft: number;
  available40ft: number;
  inUse20ft: number;
  inUse40ft: number;
  unavailable20ft: number;
  unavailable40ft: number;
  /**
   * §35.6. Forty-foot units are partially fungible into twenty-foot capacity
   * via double mounting, so a spare 40ft is *conditionally* available for a
   * 20ft booking. Reported separately: the §19.1 constraints may not hold, so
   * it must never be presented as ordinary 20ft capacity.
   */
  conditionally20ftFrom40ft: number;
}

/**
 * §35.4. Availability, per size.
 *
 * Exposed by size because a spare forty-foot chassis does not help a
 * twenty-foot booking.
 */
export function fleetAvailability(
  fleet: readonly Chassis[],
  holdings: readonly ChassisHolding[],
  today: string,
): FleetAvailability {
  const counts = {
    available20ft: 0, available40ft: 0, inUse20ft: 0, inUse40ft: 0,
    unavailable20ft: 0, unavailable40ft: 0, conditionally20ftFrom40ft: 0,
  };

  for (const unit of fleet) {
    const status = chassisStatus(unit, holdings, today);
    const is20 = unit.size === '20FT';
    if (status === 'AVAILABLE') {
      if (is20) counts.available20ft += 1; else counts.available40ft += 1;
    } else if (status === 'IN_USE') {
      if (is20) counts.inUse20ft += 1; else counts.inUse40ft += 1;
    } else {
      if (is20) counts.unavailable20ft += 1; else counts.unavailable40ft += 1;
    }
  }
  counts.conditionally20ftFrom40ft = counts.available40ft;
  return counts;
}

/**
 * §35.4. Availability warns; it does not block.
 *
 * "A hard gate on equipment would be overridden constantly, and a gate that is
 * routinely overridden teaches people to ignore every other gate in the
 * system." This is the one place the specification deliberately departs from
 * the checkpoint pattern of §31, §41 and §44.
 */
export function checkChassisAvailability(
  containerSize: string,
  availability: FleetAvailability,
): { blocked: false; warning: string | null } {
  const needs20 = String(containerSize).includes('20');
  const free = needs20 ? availability.available20ft : availability.available40ft;
  if (free > 0) return { blocked: false, warning: null };

  const conditional = needs20 && availability.conditionally20ftFrom40ft > 0
    ? ` ${availability.conditionally20ftFrom40ft} forty-foot units are conditionally available via double mounting.`
    : '';
  return {
    blocked: false,
    warning: `No ${needs20 ? '20ft' : '40ft'} chassis is free.${conditional} Scheduling is permitted; this is a warning.`,
  };
}

const DAY = 86_400_000;

/**
 * §35.5. The third clock: our equipment held by a customer.
 *
 * Demurrage and detention measure the carrier's equipment held by us. This
 * measures ours held by them, and it has never been counted.
 */
export function chassisDays(holding: ChassisHolding, now: string): number {
  if (!holding.mountedAt) return 0;
  const end = holding.releasedAt ?? now;
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(holding.mountedAt)) / DAY));
}

/**
 * §35.2. A double-mounted pair counts chassis_days ONCE, not twice.
 *
 * "Counting it per container would inflate occupancy and understate the
 * capacity benefit that double mounting exists to deliver."
 */
export function jobChassisDays(holdings: readonly ChassisHolding[], now: string): number {
  const counted = new Set<string>();
  let total = 0;
  for (const h of holdings) {
    // One unit, one count, however many containers ride on it.
    const key = `${h.chassisId}|${h.mountedAt ?? ''}`;
    if (counted.has(key)) continue;
    counted.add(key);
    total += chassisDays(h, now);
  }
  return total;
}

/**
 * §35.6. Because occupancy equals job duration, fleet size sets a hard ceiling
 * on concurrent jobs.
 */
export function monthlyCapacity(unitCount: number, averageJobDays: number): number {
  if (averageJobDays <= 0) return 0;
  return Math.floor(unitCount * (30 / averageJobDays));
}

export interface ChassisExceptionInput {
  unit: Chassis;
  holdings: readonly ChassisHolding[];
  availability: FleetAvailability;
  today: string;
  customerLimitDays: number;
  fleetFloor: number;
  inspectionWarningDays: number;
}

/** §35.7 */
export function detectChassisExceptions(input: ChassisExceptionInput): {
  exceptionType: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; description: string;
}[] {
  const { unit, holdings, availability, today, customerLimitDays, fleetFloor, inspectionWarningDays } = input;
  const out: { exceptionType: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; description: string }[] = [];
  const status = chassisStatus(unit, holdings, today);
  const open = holdings.filter((h) => h.chassisId === unit.chassisId && h.releasedAt === null);

  for (const h of open) {
    const days = chassisDays(h, `${today}T00:00:00Z`);
    if (days > customerLimitDays) {
      out.push({ exceptionType: 'Chassis held beyond threshold', severity: 'MEDIUM',
        description: `${unit.chassisNo} has been under a container for ${days} days` });
    }
  }

  if (unit.inspectionDueDate) {
    const daysUntil = Math.round((Date.parse(unit.inspectionDueDate) - Date.parse(today)) / DAY);
    if (daysUntil >= 0 && daysUntil <= inspectionWarningDays) {
      out.push({ exceptionType: 'Chassis inspection due', severity: 'MEDIUM',
        description: `${unit.chassisNo} inspection due ${unit.inspectionDueDate}` });
    }
  }

  // §35.8. A unit withdrawn for maintenance while a container sits on it is
  // the one case that forces a dismount. It is an exception, not a workflow:
  // the system records what was decided rather than deciding it.
  if (unit.manualStatus === 'MAINTENANCE' && open.length > 0) {
    out.push({ exceptionType: 'Chassis maintenance mid-job', severity: 'HIGH',
      description: `${unit.chassisNo} is marked for maintenance while still under a container` });
  }

  const size = unit.size === '20FT' ? availability.available20ft : availability.available40ft;
  if (size < fleetFloor) {
    out.push({ exceptionType: 'Fleet availability low', severity: 'HIGH',
      description: `Only ${size} ${unit.size} chassis available, below the floor of ${fleetFloor}` });
  }

  return out;
}

/**
 * §35.8. A mid-job chassis change.
 *
 * "This is an exception, not a workflow." A chassis needing maintenance while
 * under a container is the only case that forces a dismount, it happens
 * rarely, and there is no established procedure for it today — so the system
 * must not invent one. It records what was decided; it does not decide.
 */
export interface ChassisChange {
  changeId: string;
  containerId: string;
  jobId: string;
  /** The unit withdrawn. */
  chassisIdPrevious: string;
  /** The replacement, or null where the container was grounded. */
  chassisIdNew: string | null;
  /** Mandatory free text. */
  reason: string;
  location: string;
  changedAt: string;
  changedBy: string;
  /** True where no replacement was fitted. */
  containerGrounded: boolean;
}

export interface ChassisChangeRequest {
  containerId: string;
  jobId: string;
  chassisIdPrevious: string;
  chassisIdNew: string | null;
  reason: string;
  location: string;
  changedAt: string;
  changedBy: string;
}

/**
 * §35.8. Neither option is blocked and no replacement is assumed available —
 * grounding is a legitimate outcome. What is required is that the decision is
 * attributable and explained.
 */
export function validateChassisChange(
  request: ChassisChangeRequest,
): { valid: boolean; reason: string | null } {
  if (!request.changedBy?.trim()) {
    return { valid: false, reason: '§35.8: a chassis change requires a named user' };
  }
  if (!request.reason?.trim()) {
    return { valid: false, reason: '§35.8: a reason is mandatory' };
  }
  if (!request.location?.trim()) {
    return { valid: false, reason: '§35.8: the location of the change is required' };
  }
  if (request.chassisIdNew === request.chassisIdPrevious) {
    return { valid: false, reason: 'The replacement is the same unit' };
  }
  return { valid: true, reason: null };
}

export function recordChassisChange(
  request: ChassisChangeRequest,
  changeId: string,
): ChassisChange {
  const validation = validateChassisChange(request);
  if (!validation.valid) throw new Error(validation.reason ?? 'Invalid chassis change');
  return {
    changeId,
    containerId: request.containerId,
    jobId: request.jobId,
    chassisIdPrevious: request.chassisIdPrevious,
    chassisIdNew: request.chassisIdNew,
    reason: request.reason,
    location: request.location,
    changedAt: request.changedAt,
    changedBy: request.changedBy,
    containerGrounded: request.chassisIdNew === null,
  };
}

/**
 * §35.8. "chassis_days splits across both units, so neither unit's occupancy
 * record is falsified by the swap."
 *
 * The split falls out of modelling the change as two holdings rather than one
 * edited in place: the withdrawn unit is released at the moment of the change,
 * and the replacement is mounted at the same moment.
 */
export function applyChassisChange(
  holdings: readonly ChassisHolding[],
  change: ChassisChange,
): ChassisHolding[] {
  const out: ChassisHolding[] = [];
  let closed = false;

  for (const h of holdings) {
    const isTheOne = h.containerId === change.containerId
      && h.chassisId === change.chassisIdPrevious
      && h.releasedAt === null;
    if (!isTheOne) { out.push(h); continue; }
    out.push({ ...h, releasedAt: change.changedAt });
    closed = true;
  }
  if (!closed) throw new Error(`No open holding for ${change.containerId} on ${change.chassisIdPrevious}`);

  // A grounded container has no replacement holding, which is why the
  // container simply has no chassis until one is fitted.
  if (change.chassisIdNew) {
    out.push({
      chassisId: change.chassisIdNew,
      containerId: change.containerId,
      jobId: change.jobId,
      mountedAt: change.changedAt,
      releasedAt: null,
      doubleMountedWith: null,
    });
  }
  return out;
}
