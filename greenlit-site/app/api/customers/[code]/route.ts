import { getJobService, getRepository, jsonError } from "../../../../lib/greenlit";

/**
 * One company, with its jobs.
 *
 * ADR-0007: opening a company shows its work in the order it happened, which
 * is how a retainer operation is actually read.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const customer = await getRepository().getCustomerByCode(code);
    if (!customer) return Response.json({ error: `Unknown customer ${code}` }, { status: 404 });

    const jobs = (await getJobService().listJobs())
      .filter((j) => j.customer === customer.companyName);

    return Response.json({ customer, jobs });
  } catch (error) {
    return jsonError(error);
  }
}
