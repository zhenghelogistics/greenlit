import { YARDS, ratesOn, rateHistory, YARD_CHARGES } from "@greenlit/engine";
import { authorize, badRequest, readJson } from "../../../lib/command";
import { getRepository, jsonError } from "../../../lib/greenlit";

/**
 * What every yard charges, as at a date.
 *
 * `?on=yyyy-mm-dd` asks the question as at that day, which is the only way a
 * rate can be asked: the figure that applied in April is still the answer to a
 * question about April. Today when nothing is given.
 *
 * Every yard is returned, including the ones with nothing recorded, because a
 * yard whose CDMS fee nobody has written down is a question worth seeing and
 * dropping the row hides it.
 */
export async function GET(request: Request) {
  try {
    const on = new URL(request.url).searchParams.get("on")
      ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return badRequest("A date must be yyyy-mm-dd");

    const rates = await getRepository().listYardRates();
    const yards = YARDS.map((yard) => ({
      code: yard.code,
      name: yard.name,
      gates: yard.sites.length,
      charges: ratesOn(rates, yard.code, on),
      history: Object.fromEntries(
        YARD_CHARGES.map((charge) => [charge, rateHistory(rates, yard.code, charge)]),
      ),
    }));

    return Response.json({ on, yards });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Record an amount from a date.
 *
 * A later date is a price rise and leaves the old figure alone. The same date
 * corrects what was entered for it. There is no way to edit "the current rate"
 * because no such thing is stored — which is what keeps last quarter's
 * invoices explainable after this quarter's increase.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return badRequest("A JSON body is required");

    const auth = await authorize("masterData.manage");
    if (!auth.ok) return auth.response;

    const rate = await getRepository().recordYardRate({
      yardCode: String(body.yardCode ?? ""),
      charge: body.charge as never,
      amount: Number(body.amount),
      effectiveFrom: String(body.effectiveFrom ?? ""),
      remarks: body.remarks === undefined ? null : String(body.remarks),
    }, auth.displayName);

    return Response.json({ rate });
  } catch (error) {
    return jsonError(error);
  }
}
