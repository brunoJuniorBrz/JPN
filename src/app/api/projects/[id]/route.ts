import { getProject, saveProject } from "@/infrastructure/projects/projects-http";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return getProject(request, (await context.params).id); }
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) { return saveProject(request, (await context.params).id); }
