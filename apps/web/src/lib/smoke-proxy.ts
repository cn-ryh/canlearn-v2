const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const error = (message: string, status: number) => Response.json({ message }, { status });

export async function proxySmoke(request: Request, segments: string[]): Promise<Response> {
  if (process.env.CANLEARN_SMOKE_ENABLED !== "true") return error("SMOKE_DISABLED", 404);
  const read = request.method === "GET" && segments.length === 1 && uuid.test(segments[0] ?? "");
  const create = request.method === "POST" && segments.length === 0;
  const cancel =
    request.method === "POST" &&
    segments.length === 2 &&
    uuid.test(segments[0] ?? "") &&
    segments[1] === "cancel";
  if (!read && !create && !cancel) return error("SMOKE_ROUTE_NOT_FOUND", 404);
  // Next may normalize request.url to localhost; compare the configured origin and actual Host.
  const expectedOrigin = new URL(process.env.CANLEARN_SMOKE_ORIGIN ?? "http://127.0.0.1:3310");
  if (
    request.method !== "GET" &&
    (request.headers.get("origin") !== expectedOrigin.origin ||
      (request.headers.get("host") ?? new URL(request.url).host) !== expectedOrigin.host)
  )
    return error("SMOKE_ORIGIN_REJECTED", 403);
  const base = new URL(process.env.CANLEARN_SMOKE_API_URL ?? "http://127.0.0.1:3311/v1");
  if (
    base.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
    base.username ||
    base.password ||
    base.pathname !== "/v1" ||
    base.search ||
    base.hash
  )
    return error("SMOKE_LOOPBACK_REQUIRED", 503);
  try {
    const body = create ? await request.text() : undefined;
    if (body && body.length > 2048) return error("SMOKE_BODY_TOO_LARGE", 413);
    const headers = new Headers({ "x-smoke-client": "1" });
    if (create) headers.set("content-type", "application/json");
    const key = request.headers.get("idempotency-key");
    if (key) headers.set("idempotency-key", key);
    const response = await fetch(
      `${base}/smoke/jobs${segments.length ? `/${segments.join("/")}` : ""}`,
      {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    return Response.json(await response.json(), { status: response.status });
  } catch {
    return error("SMOKE_API_UNAVAILABLE", 503);
  }
}
