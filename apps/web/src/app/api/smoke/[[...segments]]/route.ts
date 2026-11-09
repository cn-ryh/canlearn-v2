import { proxySmoke } from "../../../../lib/smoke-proxy";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ segments?: string[] }> };
export async function GET(request: Request, context: Context) {
  return proxySmoke(request, (await context.params).segments ?? []);
}
export async function POST(request: Request, context: Context) {
  return proxySmoke(request, (await context.params).segments ?? []);
}
