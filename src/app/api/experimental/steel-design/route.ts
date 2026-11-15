import { serveLocalNumerical } from "@/infrastructure/analysis/local-numerical-http";
export const runtime="nodejs";
/** NBR 8800 I/H member design: local executor only, same gates as the other experimental numerical routes. */
export async function POST(request:Request){return serveLocalNumerical(request,"steel-design");}
