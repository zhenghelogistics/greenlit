/**
 * §31, §32. A job as the trip the box actually makes.
 *
 * Every screen so far has shown a job as a set of panels — shipment here,
 * permits there, movements below — and left the reader to assemble the
 * sequence in their head. But the operation does not think in panels. It
 * thinks: the box is on the water, then it is cleared, then we collect it,
 * then we deliver it, then we get the empty back. That is one line, and it is
 * the line a controller already has in their head before they open the screen.
 *
 * So this derives it. Each step says where it stands and what would move it,
 * which means the "what do I do next" answer and the "where are we" answer
 * come from one place instead of being two panels that can disagree.
 *
 * It decides nothing new. Every input here is a fact the rest of the engine
 * already established — gates, statuses, movement records — and this is the
 * order they happen in. §54 still holds: nothing here is writable.
 */

export type StepState =
  /** Behind us, and it happened. */
  | 'DONE'
  /** The thing to do now. */
  | 'CURRENT'
  /** Cannot proceed until something else does. */
  | 'BLOCKED'
  /** Someone outside is holding it; there is nothing to do but chase. */
  | 'WAITING'
  /** Ahead of us and not yet reachable. */
  | 'UPCOMING'
  /** Does not apply to this job at all. */
  | 'SKIPPED';

export interface JourneyStep {
  id: string;
  label: string;
  state: StepState;
  /** Why it stands where it does, in a sentence a controller would say. */
  detail: string;
  /**
   * The command that would move it, where one exists.
   *
   * A name rather than a handler: the engine has no business knowing what a
   * button looks like, and a screen has no business deciding which command a
   * step needs.
   */
  action: string | null;
}

export interface JourneyCtx {
  mandatoryComplete: boolean;
  missingFields: readonly string[];
  permitRequired: boolean;
  permitReceived: boolean;
  portnetRequired: boolean;
  portnetReleased: boolean;
  collectionEligible: boolean;
  scheduled: boolean;
  collected: boolean;
  delivered: boolean;
  emptyReturned: boolean;
  jobClosed: boolean;
}

const step = (
  id: string, label: string, state: StepState, detail: string, action: string | null = null,
): JourneyStep => ({ id, label, state, detail, action });

/**
 * §32.1. The import journey, in the order it happens.
 *
 * The first unfinished step is the current one and everything after it is
 * upcoming, which is what makes this readable at a glance: there is exactly
 * one place to look. A step that is blocked or waiting says so instead, so
 * "we cannot" and "they have not" never read as the same thing — one is work
 * and the other is a phone call.
 */
export function importJourney(c: JourneyCtx): JourneyStep[] {
  const steps: JourneyStep[] = [];

  steps.push(c.mandatoryComplete
    ? step('info', 'Job information', 'DONE', 'Everything mandatory is recorded')
    : step('info', 'Job information', 'CURRENT',
      `Missing ${c.missingFields.join(', ')}`, 'job.edit'));

  if (!c.portnetRequired) {
    steps.push(step('portnet', 'Portnet release', 'SKIPPED', 'Not required for this job'));
  } else if (c.portnetReleased) {
    steps.push(step('portnet', 'Portnet release', 'DONE', 'Released'));
  } else {
    steps.push(step('portnet', 'Portnet release', 'WAITING',
      'Not released. This is what holds the collection.', 'portnet.confirm'));
  }

  if (!c.permitRequired) {
    steps.push(step('permit', 'Permit', 'SKIPPED', 'Not required for this job'));
  } else if (c.permitReceived) {
    steps.push(step('permit', 'Permit', 'DONE', 'Recorded'));
  } else {
    steps.push(step('permit', 'Permit', 'WAITING',
      'Not recorded. Needed before the delivery order is exchanged.', 'permit.confirm'));
  }

  steps.push(
    c.collected ? step('collect', 'Collect from terminal', 'DONE', 'Collected')
      : c.scheduled ? step('collect', 'Collect from terminal', 'CURRENT', 'Trip scheduled')
        : c.collectionEligible
          ? step('collect', 'Collect from terminal', 'CURRENT',
            'Cleared to collect. No trip arranged yet.', 'movement.create')
          : step('collect', 'Collect from terminal', 'BLOCKED',
            'The gate above has to clear first'),
  );

  steps.push(c.delivered
    ? step('deliver', 'Deliver to customer', 'DONE', 'Delivered')
    : step('deliver', 'Deliver to customer',
      c.collected ? 'CURRENT' : 'UPCOMING',
      c.collected ? 'On the road or waiting to go out' : 'After collection',
      c.collected ? 'movement.update' : null));

  steps.push(c.emptyReturned
    ? step('empty', 'Empty return', 'DONE', 'Back at the depot')
    : step('empty', 'Empty return',
      c.delivered ? 'CURRENT' : 'UPCOMING',
      c.delivered
        ? 'The box is empty at the customer and the clock is still running'
        : 'After delivery',
      c.delivered ? 'movement.create' : null));

  steps.push(c.jobClosed
    ? step('close', 'Job closed', 'DONE', 'Closed and billable')
    : step('close', 'Job closed',
      c.emptyReturned ? 'CURRENT' : 'UPCOMING',
      c.emptyReturned ? 'Everything is back. This can be closed.' : 'After the empty is back',
      c.emptyReturned ? 'job.close' : null));

  return collapse(steps);
}

/**
 * Only one step is ever current.
 *
 * Several can legitimately qualify — the information is incomplete *and* the
 * permit has not come back — and showing three "you are here" markers is the
 * same as showing none. The first one wins and the rest become upcoming,
 * except the ones somebody else is holding: those stay WAITING, because they
 * are chases that can happen in parallel with the work.
 */
function collapse(steps: readonly JourneyStep[]): JourneyStep[] {
  let seen = false;
  return steps.map((s) => {
    if (s.state !== 'CURRENT') return s;
    if (seen) return { ...s, state: 'UPCOMING' as StepState };
    seen = true;
    return s;
  });
}

export interface ExportJourneyCtx {
  mandatoryComplete: boolean;
  missingFields: readonly string[];
  cmsRequired: boolean;
  cmsCompleted: boolean;
  emptyGatePassed: boolean;
  emptyScheduled: boolean;
  emptyCollected: boolean;
  emptyDelivered: boolean;
  containerNumberCaptured: boolean;
  detailsSent: boolean;
  containerReady: boolean;
  vgmReceived: boolean;
  transhipmentStatus: 'PENDING' | 'AVAILABLE' | 'NOT_AVAILABLE';
  carparkRequested: boolean;
  atCarpark: boolean;
  ladenGatePassed: boolean;
  hasLadenMovement: boolean;
  deliveredToPort: boolean;
  jobClosed: boolean;
}

/**
 * §45. The export journey, which is not the import one backwards.
 *
 * An import arrives and is taken apart: clear it, collect it, deliver it, send
 * the empty back. An export is assembled: fetch an empty, take it to the
 * customer, tell them what it is, wait while they fill it, weigh it, and only
 * then is there anything to deliver. The long wait is in the middle rather
 * than at the start, and three of the steps are the customer's.
 *
 * §42's notification is a step in its own right because it is the one the
 * operation forgets: the empty is delivered, the customer does not know the
 * container number, and nothing happens for a week while each side believes it
 * is waiting for the other.
 */
export function exportJourney(c: ExportJourneyCtx): JourneyStep[] {
  const steps: JourneyStep[] = [];

  steps.push(c.mandatoryComplete
    ? step('info', 'Booking information', 'DONE', 'Everything mandatory is recorded')
    : step('info', 'Booking information', 'CURRENT',
      `Missing ${c.missingFields.join(', ')}`, 'job.edit'));

  if (!c.cmsRequired) {
    steps.push(step('cms', 'CMS', 'SKIPPED', 'Not required for this booking'));
  } else if (c.cmsCompleted) {
    steps.push(step('cms', 'CMS', 'DONE', 'Done'));
  } else {
    steps.push(step('cms', 'CMS', 'CURRENT',
      'Not done. The empty cannot be collected until it is.', 'cms.record'));
  }

  steps.push(
    c.emptyCollected ? step('empty-out', 'Collect empty', 'DONE', 'Collected from the yard')
      : c.emptyScheduled ? step('empty-out', 'Collect empty', 'CURRENT', 'Trip scheduled')
        : c.emptyGatePassed
          ? step('empty-out', 'Collect empty', 'CURRENT',
            'Cleared to collect. No trip arranged yet.', 'movement.create')
          : step('empty-out', 'Collect empty', 'BLOCKED', 'The gate above has to clear first'),
  );

  steps.push(c.emptyDelivered
    ? step('empty-in', 'Deliver empty to customer', 'DONE', 'At the stuffing location')
    : step('empty-in', 'Deliver empty to customer',
      c.emptyCollected ? 'CURRENT' : 'UPCOMING',
      c.emptyCollected ? 'On the road to the stuffing location' : 'After collection',
      c.emptyCollected ? 'movement.update' : null));

  // §39. There is nothing to tell the customer until the box has a number.
  steps.push(c.containerNumberCaptured
    ? step('identity', 'Container, seal and tare', 'DONE', 'Captured')
    : step('identity', 'Container, seal and tare',
      c.emptyDelivered ? 'CURRENT' : 'UPCOMING',
      c.emptyDelivered ? 'Not captured, and the customer cannot be told without it' : 'After the empty is delivered',
      c.emptyDelivered ? 'container.capture' : null));

  // §42. The silent delay: the box is there and nobody told them which one.
  steps.push(c.detailsSent
    ? step('notify', 'Tell the customer', 'DONE', 'Details sent')
    : step('notify', 'Tell the customer',
      c.containerNumberCaptured ? 'CURRENT' : 'UPCOMING',
      c.containerNumberCaptured
        ? 'They cannot begin stuffing until they know the container number'
        : 'After the details are captured',
      c.containerNumberCaptured ? 'container.notify' : null));

  steps.push(c.containerReady
    ? step('stuffing', 'Customer stuffing', 'DONE', 'Confirmed ready')
    : step('stuffing', 'Customer stuffing',
      c.detailsSent ? 'WAITING' : 'UPCOMING',
      c.detailsSent ? 'With the customer. Chase if it runs long.' : 'After they are told',
      c.detailsSent ? 'readiness.record' : null));

  steps.push(c.vgmReceived
    ? step('vgm', 'VGM', 'DONE', 'Received')
    : step('vgm', 'VGM',
      c.containerReady ? 'WAITING' : 'UPCOMING',
      c.containerReady ? 'The box cannot be loaded without it' : 'After stuffing',
      c.containerReady ? 'vgm.record' : null));

  if (c.transhipmentStatus === 'PENDING') {
    steps.push(step('tt', 'Transhipment', 'WAITING',
      'The carrier has not said whether a slot is available', 'transhipment.record'));
  } else {
    steps.push(step('tt', 'Transhipment', 'DONE',
      c.transhipmentStatus === 'AVAILABLE'
        ? 'Available — the laden box can go straight to port'
        : 'Not available — the carpark route applies'));
  }

  if (c.carparkRequested) {
    steps.push(c.atCarpark
      ? step('carpark', 'At the carpark', 'DONE', 'Holding until a slot opens')
      : step('carpark', 'Via the carpark', 'UPCOMING', 'The customer asked for the carpark route'));
  }

  steps.push(c.deliveredToPort
    ? step('port', 'Deliver to port', 'DONE', 'Delivered')
    : c.hasLadenMovement
      ? step('port', 'Deliver to port', 'CURRENT', 'Trip arranged', 'movement.update')
      : c.ladenGatePassed
        ? step('port', 'Deliver to port', 'CURRENT',
          'Cleared to go. No trip arranged yet.', 'movement.create')
        : step('port', 'Deliver to port', 'UPCOMING', 'After the box is ready and weighed'));

  steps.push(c.jobClosed
    ? step('close', 'Job closed', 'DONE', 'Closed and billable')
    : step('close', 'Job closed',
      c.deliveredToPort ? 'CURRENT' : 'UPCOMING',
      c.deliveredToPort ? 'The box is at the port. This can be closed.' : 'After delivery to port',
      c.deliveredToPort ? 'job.close' : null));

  return collapse(steps);
}

/** The step a person should be looking at, or null on a finished job. */
export function currentStep(steps: readonly JourneyStep[]): JourneyStep | null {
  return steps.find((s) => s.state === 'CURRENT')
    ?? steps.find((s) => s.state === 'BLOCKED')
    ?? null;
}
