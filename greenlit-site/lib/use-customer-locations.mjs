import { useEffect, useState } from "react";

/**
 * A customer's saved delivery locations, fetched when the customer is known.
 *
 * Shared by job creation and the saved job's edit drawer, so both offer the
 * same companies and addresses from the same place. The drawer used a free
 * text box instead, and an address typed there matched no saved location.
 *
 * Held with the customer it was fetched for, rather than as a bare list that
 * is cleared on the way out: a bare list shows the previous customer's
 * addresses for as long as the next fetch takes, which is exactly long enough
 * for somebody to pick one.
 */
export function useCustomerLocations(customerCode) {
  const [loaded, setLoaded] = useState({ code: "", locations: [] });
  const fresh = loaded.code === customerCode;

  useEffect(() => {
    if (!customerCode) return undefined;
    let cancelled = false;
    fetch(`/api/customers/${encodeURIComponent(customerCode)}/locations`)
      .then((r) => (r.ok ? r.json() : { locations: [] }))
      .then((d) => {
        if (!cancelled) setLoaded({ code: customerCode, locations: d.locations ?? [] });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ code: customerCode, locations: [] });
      });
    return () => { cancelled = true; };
  }, [customerCode]);

  const usable = (fresh ? loaded.locations : []).filter((l) => l.active !== false);
  return {
    loading: Boolean(customerCode) && !fresh,
    companies: [...new Set(usable.map((l) => l.company).filter(Boolean))],
    addressesFor: (company) =>
      usable.filter((l) => l.company === company).map((l) => l.address).filter(Boolean),
    /** The site behind a chosen address, for its standing instructions. */
    siteAt: (company, address) =>
      usable.find((l) => l.company === company && l.address === address) ?? null,
  };
}
