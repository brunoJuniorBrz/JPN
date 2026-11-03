import { serveLocalNumerical } from "@/infrastructure/analysis/local-numerical-http";
export const runtime="nodejs";
export async function POST(request:Request){return serveLocalNumerical(request,"design");}
