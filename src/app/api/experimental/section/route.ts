import { serveLocalNumerical } from "@/infrastructure/analysis/local-numerical-http";
export const runtime="nodejs";
export const maxDuration=35;
export async function POST(request:Request){return serveLocalNumerical(request,"section");}
