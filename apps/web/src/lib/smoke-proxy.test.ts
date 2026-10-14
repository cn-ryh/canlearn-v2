import { afterEach, describe, expect, it, vi } from "vitest";
import { proxySmoke } from "./smoke-proxy";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Local smoke Web proxy boundary", () => {
  it("sends a bodyless cancellation without a JSON content type", async () => {
    vi.stubEnv("CANLEARN_SMOKE_ENABLED", "true");
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: "CANCELLED" }));
    vi.stubGlobal("fetch", fetch);
    const request = new Request("http://127.0.0.1:3310/api/smoke/id/cancel", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3310" },
    });
    expect(
      (await proxySmoke(request, ["01300000-0000-4000-8000-000000000001", "cancel"])).status,
    ).toBe(200);
    const forwarded = fetch.mock.calls[0]?.[1];
    expect(forwarded).toBeDefined();
    expect((forwarded.headers as Headers).has("content-type")).toBe(false);
  });
  it("defaults to disabled", async () => {
    vi.stubEnv("CANLEARN_SMOKE_ENABLED", "false");
    expect((await proxySmoke(new Request("http://127.0.0.1:3310/api/smoke"), [])).status).toBe(404);
  });
  it.each([
    ["internal"],
    ["anything", "start"],
    ["01300000-0000-4000-8000-000000000001", "finish"],
  ])("blocks arbitrary routes %j", async (...segments) => {
    vi.stubEnv("CANLEARN_SMOKE_ENABLED", "true");
    expect(
      (await proxySmoke(new Request("http://127.0.0.1:3310/api/smoke"), segments)).status,
    ).toBe(404);
  });
  it("blocks mutations from another Origin", async () => {
    vi.stubEnv("CANLEARN_SMOKE_ENABLED", "true");
    const request = new Request("http://127.0.0.1:3310/api/smoke", {
      method: "POST",
      headers: { origin: "https://untrusted.invalid" },
    });
    expect((await proxySmoke(request, [])).status).toBe(403);
  });
  it("refuses an external API URL", async () => {
    vi.stubEnv("CANLEARN_SMOKE_ENABLED", "true");
    vi.stubEnv("CANLEARN_SMOKE_API_URL", "https://untrusted.invalid/v1");
    const request = new Request("http://127.0.0.1:3310/api/smoke", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3310" },
    });
    expect((await proxySmoke(request, [])).status).toBe(503);
  });
  it("forwards the public request key without exposing the internal service token", async () => {
    vi.stubEnv("CANLEARN_SMOKE_ENABLED", "true");
    vi.stubEnv("CANLEARN_SMOKE_TOKEN", "synthetic-server-only-credential");
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: "synthetic" }, { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    const request = new Request("http://127.0.0.1:3310/api/smoke", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3310", "idempotency-key": "synthetic-key" },
      body: "{}",
    });
    expect((await proxySmoke(request, [])).status).toBe(202);
    const headers = fetch.mock.calls[0]?.[1].headers as Headers;
    expect(headers.get("idempotency-key")).toBe("synthetic-key");
    expect(headers.has("x-smoke-token")).toBe(false);
  });
});
