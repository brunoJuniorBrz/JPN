import { listProjects } from "@/infrastructure/projects/projects-http";

export const runtime = "nodejs";
export async function GET(request: Request) { return listProjects(request); }
