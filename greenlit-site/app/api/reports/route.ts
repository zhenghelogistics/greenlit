import { periodFor, previousPeriod, volumeIn, stillOpenAt,
  type PeriodKind, type ReportableJob } from "@greenlit/engine";
import { badRequest } from "../../../lib/command";
import { getJobService, jsonError } from "../../../lib/greenlit";

/**
 * The month, the quarter or the year, as a meeting needs it.
 *
 * `?period=MONTH|QUARTER|YEAR` and `?on=yyyy-mm-dd`, which is any day inside
 * the period wanted — nobody should be working out which quarter a date is in.
 *
 * The comparison figures come back alongside, because a count means very
 * little on its own and every one of these slides gets asked "versus what".
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const kind = (params.get("period") ?? "MONTH").toUpperCase() as PeriodKind;
    if (!["MONTH", "QUARTER", "YEAR"].includes(kind)) {
      return badRequest("A period must be MONTH, QUARTER or YEAR");
    }
    const on = params.get("on") ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return badRequest("A date must be yyyy-mm-dd");

    const period = periodFor(kind, on);
    const before = previousPeriod(period);

    // Why a job is stuck is decided once, by the next-action rules, and read
    // here rather than worked out again. Two answers to that question would
    // disagree in front of the people least able to tell which was right.
    const jobs: ReportableJob[] = (await getJobService().listJobs()).map((job) => ({
      jobNumber: job.jobNumber,
      domain: job.domain,
      customer: job.customer,
      openedOn: String(job.record.createdAt).slice(0, 10),
      closedOn: job.record.closedAt ? String(job.record.closedAt).slice(0, 10) : null,
      containerCount: job.containers.length,
      waitingOn: job.waitingOn,
      blockingReason: job.blockingReason,
    }));

    return Response.json({
      period,
      previous: before,
      volume: volumeIn(jobs, period),
      previousVolume: volumeIn(jobs, before),
      // As at the last day of the period, so running September's report in
      // October gives September's answer both times.
      stillOpen: stillOpenAt(jobs, period.to),
    });
  } catch (error) {
    return jsonError(error);
  }
}
