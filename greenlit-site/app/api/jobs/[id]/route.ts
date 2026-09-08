import { getJobService, jsonError } from "../../../../lib/greenlit";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const job = await getJobService().getJob(id);
    if (!job) return Response.json({ error: `Unknown job ${id}` }, { status: 404 });
    return Response.json({ job });
  } catch (error) {
    return jsonError(error);
  }
}
