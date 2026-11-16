import { pollAnalysis } from "@/infrastructure/analysis/analysis-jobs-http";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(request: Request, context: { params: Promise<{ job: string }> }) {
  return pollAnalysis(request, (await context.params).job);
}
