import type { ExportContainer, ExportJob, ImportContainer, ImportJob, Movement } from './types.ts';
import type { LocationType, MovementType } from './enums.ts';
import { canCreateMovement } from './movements.ts';

/**
 * A movement the engine proposes to create. It is a proposal, not a record:
 * the caller assigns ids and persists it, so this stays a pure function.
 */
export interface AutoMovementProposal {
  movementType: MovementType;
  containerId: string;
  originType: LocationType;
  origin: string;
  destinationType: LocationType;
  destination: string;
  /** §22. Written to the audit event so the trigger is always named. */
  trigger: string;
  /**
   * §36.3. `EMPTY_RETURN` is created automatically but cannot leave PENDING
   * until the customer confirms the container is empty. When set, the movement
   * is created and countable but held.
   */
  heldUntil: string | null;
}

const has = (ms: readonly Movement[], type: MovementType, containerId: string) =>
  ms.some((m) => m.movementType === type && m.containerId === containerId
    && m.movementStatus !== 'CANCELLED');

const completed = (ms: readonly Movement[], type: MovementType, containerId: string) =>
  ms.some((m) => m.movementType === type && m.containerId === containerId
    && m.movementStatus === 'COMPLETED');

const arrived = (ms: readonly Movement[], type: MovementType, containerId: string) =>
  ms.some((m) => m.movementType === type && m.containerId === containerId
    && ['DELIVERED', 'ON_STANDBY', 'COMPLETED'].includes(m.movementStatus));

/**
 * §22, import triggers.
 *
 * Note what is absent: `IMPORT_TO_CARPARK` and `CARPARK_TO_CUSTOMER` are never
 * proposed. Their triggers are a customer having no space and a customer
 * becoming able to receive — neither is observable by the system, and §22 lists
 * them as manual **by design, not by omission**.
 */
export function planImportMovements(
  job: ImportJob,
  container: ImportContainer,
  movements: readonly Movement[],
  collectionEligible: boolean,
): AutoMovementProposal[] {
  const out: AutoMovementProposal[] = [];
  const id = container.containerId;

  if (collectionEligible
    && !has(movements, 'IMPORT_DELIVERY', id)
    && !has(movements, 'IMPORT_TO_CARPARK', id)
    && canCreateMovement(movements, job.jobId, 'IMPORT_DELIVERY').allowed) {
    out.push({
      movementType: 'IMPORT_DELIVERY',
      containerId: id,
      originType: 'TERMINAL', origin: container.portTerminal ?? '',
      destinationType: 'CUSTOMER', destination: job.deliveryAddress ?? '',
      trigger: 'Import job became Ready for Collection',
      heldUntil: null,
    });
  }

  // Delivery may have completed by either route: straight from the terminal,
  // or out of the carpark under §36.2.
  const deliveredToCustomer = completed(movements, 'IMPORT_DELIVERY', id)
    || completed(movements, 'CARPARK_TO_CUSTOMER', id);

  if (deliveredToCustomer
    && !has(movements, 'EMPTY_RETURN', id)
    && canCreateMovement(movements, job.jobId, 'EMPTY_RETURN').allowed) {
    out.push({
      movementType: 'EMPTY_RETURN',
      containerId: id,
      originType: 'CUSTOMER', origin: job.deliveryAddress ?? '',
      destinationType: 'YARD', destination: container.emptyReturnYard ?? '',
      trigger: 'Laden delivery completed',
      // §36.3: the customer tells us the container is empty before we collect.
      heldUntil: container.emptyReadyConfirmed
        ? null
        : 'Customer confirmation that the container is empty',
    });
  }

  return out;
}

/**
 * §22, export triggers.
 *
 * `LADEN_SITE_TO_SITE` is never proposed: §46.3 says the trigger is a customer
 * stuffing arrangement that varies per booking and the system cannot observe it.
 */
export function planExportMovements(
  job: ExportJob,
  container: ExportContainer,
  movements: readonly Movement[],
  emptyGatePassed: boolean,
  ladenGatePassed: boolean,
): AutoMovementProposal[] {
  const out: AutoMovementProposal[] = [];
  const id = container.exportContainerId;

  if (emptyGatePassed
    && !has(movements, 'EMPTY_COLLECTION', id)
    && canCreateMovement(movements, job.exportJobId, 'EMPTY_COLLECTION').allowed) {
    out.push({
      movementType: 'EMPTY_COLLECTION',
      containerId: id,
      originType: 'YARD', origin: job.emptyCollectionYard ?? '',
      destinationType: 'CUSTOMER', destination: container.stuffingLocation ?? '',
      trigger: 'Export job became Ready for Empty Collection',
      heldUntil: null,
    });
  }

  const atCarpark = arrived(movements, 'ONE_WAY_LOADED', id)
    && !has(movements, 'CARPARK_TO_PORT', id);

  if (ladenGatePassed && !atCarpark) {
    if (job.transhipmentStatus === 'AVAILABLE'
      && !has(movements, 'DIRECT_LADEN_TO_PORT', id)
      && canCreateMovement(movements, job.exportJobId, 'DIRECT_LADEN_TO_PORT').allowed) {
      out.push({
        movementType: 'DIRECT_LADEN_TO_PORT',
        containerId: id,
        originType: 'CUSTOMER', origin: container.stuffingLocation ?? '',
        destinationType: 'PORT', destination: 'Port',
        trigger: 'Container ready, VGM received, transhipment available',
        heldUntil: null,
      });
    }

    if (job.transhipmentStatus === 'NOT_AVAILABLE' && job.carparkRequested
      && !has(movements, 'ONE_WAY_LOADED', id)
      && canCreateMovement(movements, job.exportJobId, 'ONE_WAY_LOADED').allowed) {
      out.push({
        movementType: 'ONE_WAY_LOADED',
        containerId: id,
        originType: 'CUSTOMER', origin: container.stuffingLocation ?? '',
        destinationType: 'CARPARK', destination: 'Company Carpark',
        trigger: 'Container ready, VGM received, transhipment unavailable, carpark requested',
        heldUntil: null,
      });
    }
  }

  if (atCarpark && job.transhipmentStatus === 'AVAILABLE'
    && canCreateMovement(movements, job.exportJobId, 'CARPARK_TO_PORT').allowed) {
    out.push({
      movementType: 'CARPARK_TO_PORT',
      containerId: id,
      originType: 'CARPARK', origin: 'Company Carpark',
      destinationType: 'PORT', destination: 'Port',
      trigger: 'Container at carpark and transhipment became available',
      heldUntil: null,
    });
  }

  return out;
}

/** §22. Movement types the engine must never create on its own. */
export const NEVER_AUTO_CREATED: readonly MovementType[] = [
  'IMPORT_TO_CARPARK',
  'CARPARK_TO_CUSTOMER',
  'LADEN_SITE_TO_SITE',
];
