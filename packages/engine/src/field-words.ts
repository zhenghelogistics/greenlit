/**
 * What a field is called when somebody is told it is missing.
 *
 * The gates work on property names, because that is what a record has. Screens
 * were then showing those names straight through, so a controller looking at a
 * blocked export job was told it needed "truckInDate, truckOutDate" — two
 * words that appear nowhere in the operation, on a screen whose whole job is
 * to say what to do next.
 *
 * The rule this encodes: an identifier is for the code, and a person gets a
 * noun they would use on the phone. Nothing is dropped when a field is absent
 * from the table; it falls back to the identifier, which is ugly but honest,
 * and the test below keeps the mandatory sets covered so it stays rare.
 */

/** Every field a gate can report, in the words operations use for it. */
export const FIELD_WORDS: Record<string, string> = {
  // Both directions
  customer: 'customer',
  vesselName: 'vessel',
  voyageNumber: 'voyage number',
  containerQuantity: 'how many containers',
  containerSizeType: 'container size and type',

  // Import
  blNumber: 'bill of lading number',
  houseBlNumber: 'house bill of lading number',
  eta: 'vessel arrival date',
  deliveryAddress: 'delivery address',
  emptyReturnYard: 'empty return yard',

  // Export
  shipper: 'shipper',
  bookingReference: 'booking number',
  exportClearanceReference: 'export clearance reference',
  etaSingapore: 'vessel arrival date',
  emptyCollectionYard: 'empty collection yard',
  // Named for what they are rather than translated literally: operations say
  // "the day we take the box into the yard", not "truck in date".
  truckInDate: 'date the container goes into the yard',
  truckOutDate: 'date the container leaves the yard',

  // Dates a job can amend
  dischargedAt: 'discharge date',
  deliveredAt: 'delivery date',
  collectionDate: 'collection date',
  plannedDate: 'planned date',
};

/**
 * One field, in words. Falls back to the identifier rather than hiding it.
 *
 * A missing translation should look wrong on screen so it gets fixed, not
 * disappear and leave a gate that blocks a job for no stated reason.
 */
export const fieldWords = (field: string): string => FIELD_WORDS[field] ?? field;

/**
 * A list of missing fields, as a sentence fragment somebody can read.
 *
 * Oxford-free and joined with "and", because this lands mid-sentence in
 * "This job still needs ...".
 */
export function missingInWords(fields: readonly string[]): string {
  const words = fields.map(fieldWords);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0]!;
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
