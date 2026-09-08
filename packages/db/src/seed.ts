import { createClient } from '@supabase/supabase-js';

/**
 * Seeds a fresh project with the reference data the operation needs to exist
 * before anything else can: customers, the user directory, and the chassis
 * fleet.
 *
 * Deliberately NOT jobs. A job is operational data — it should be created
 * through the API, by a named person, with an audit entry. Seeding jobs would
 * produce records with no provenance, which is exactly what §13 exists to
 * prevent.
 *
 * Idempotent: every write is an upsert, so running it twice changes nothing.
 */
export interface SeedOptions {
  url: string;
  serviceRoleKey: string;
  /** The 89-unit register from §9.1. Off by default: it is a lot of rows. */
  includeFleet?: boolean;
}

const CUSTOMERS = [
  { customer_id: 'abc', code: 'ABC', company_name: 'ABC Company', short_name: 'ABC',
    billing_name: 'ABC Company Pte Ltd', default_consignee: 'ABC Company',
    default_delivery_address: '12 Tuas Ave 8', default_contact: 'ops@abccompany.sg',
    email_domains: ['abccompany.sg'] },
  { customer_id: 'lct', code: 'LCT', company_name: 'Lion City Traders', short_name: 'Lion City',
    billing_name: 'Lion City Traders Pte Ltd', default_consignee: 'Lion City Traders',
    default_delivery_address: '3 Pioneer Sector 2', default_contact: 'ops@lioncity.sg',
    email_domains: ['lioncity.sg'] },
  { customer_id: 'mer', code: 'MER', company_name: 'Meridian Freight', short_name: 'Meridian',
    billing_name: 'Meridian Freight Pte Ltd', default_consignee: null,
    default_delivery_address: null, default_contact: 'desk@meridianfreight.com',
    email_domains: ['meridianfreight.com'] },
  { customer_id: 'pep', code: 'PEP', company_name: 'PepsiCo International', short_name: 'PepsiCo',
    billing_name: 'PepsiCo International Pte Ltd', default_consignee: 'PepsiCo International Pte Ltd',
    default_delivery_address: '3 Fraser Street, Singapore', default_contact: 'ops@pepsico.com',
    email_domains: ['pepsico.com'] },
  { customer_id: 'str', code: 'STR', company_name: 'Straits Cargo', short_name: 'Straits',
    billing_name: 'Straits Cargo Pte Ltd', default_consignee: null,
    default_delivery_address: null, default_contact: 'ops@straitscargo.sg',
    email_domains: ['straitscargo.sg'] },
];

// extra_permissions is spelled out on every row rather than left to the column
// default: an upsert sends an explicit null for a missing key, and an explicit
// null overrides a default and fails the not-null constraint.
const PRINCIPALS = [
  { user_id: 'sarah', display_name: 'Sarah Lim', role: 'CONTROLLER', active: true, extra_permissions: [] },
  { user_id: 'winnie', display_name: 'Winnie Ong', role: 'CONTROLLER', active: true, extra_permissions: [] },
  { user_id: 'brandon', display_name: 'Brandon Lee', role: 'CONTROLLER', active: true, extra_permissions: [] },
  { user_id: 'john', display_name: 'John Tan', role: 'ADMINISTRATOR', active: true, extra_permissions: [] },
  { user_id: 'mei', display_name: 'Mei Chen', role: 'MANAGER', active: true, extra_permissions: [] },
  // §7.3: override is grantable to a manager as a narrow extra permission.
  { user_id: 'raymond', display_name: 'Raymond Koh', role: 'MANAGER', active: true,
    extra_permissions: ['gate.override'] },
];

/** §9.1. 47 twenty-foot and 42 forty-foot, with the inspection clustering intact. */
function fleet() {
  const units: Record<string, unknown>[] = [];
  const push = (no: number, size: '20FT' | '40FT', i: number) => units.push({
    chassis_id: `CH-${no}`, chassis_no: String(no), plate_no: `TRA${1000 + no}Y`, size,
    unladen_weight_kg: size === '20FT' ? 3200 : 4200,
    max_gross_weight_kg: size === '40FT' || i < 12 ? (size === '20FT' ? 30000 : 41000) : null,
    inspection_due_date: i % 4 === 0 ? '2026-09-15' : null,
    manual_status: i % 17 === 0 ? 'MAINTENANCE' : null,
    active: true,
  });
  for (let i = 0; i < 47; i += 1) push(2038 + i, '20FT', i);
  for (let i = 0; i < 41; i += 1) push(4029 + i, '40FT', i);
  push(4488, '40FT', 41);
  return units;
}

export async function seed(options: SeedOptions): Promise<{ customers: number; principals: number; chassis: number }> {
  const db = createClient(options.url, options.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const customers = await db.from('customers').upsert(CUSTOMERS, { onConflict: 'customer_id' }).select();
  if (customers.error) throw new Error(`seed customers: ${customers.error.message}`);

  const principals = await db.from('principals').upsert(PRINCIPALS, { onConflict: 'user_id' }).select();
  if (principals.error) throw new Error(`seed principals: ${principals.error.message}`);

  let chassisCount = 0;
  if (options.includeFleet !== false) {
    const rows = fleet();
    const result = await db.from('chassis').upsert(rows, { onConflict: 'chassis_id' }).select();
    if (result.error) throw new Error(`seed chassis: ${result.error.message}`);
    chassisCount = result.data?.length ?? 0;
  }

  return {
    customers: customers.data?.length ?? 0,
    principals: principals.data?.length ?? 0,
    chassis: chassisCount,
  };
}
