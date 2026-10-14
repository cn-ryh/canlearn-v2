import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApplication } from "../application.js";
import { operationShape, validateHttp } from "../contracts/smoke-http.js";
import { fixtureResult } from "./smoke.fixture.js";
import { SmokeService } from "./smoke.service.js";

const document = JSON.parse(
  readFileSync(
    new URL("../../../../contracts/openapi/canlearn.smoke.v1.json", import.meta.url),
    "utf8",
  ),
);
const ajv = new Ajv2020({ allErrors: true });
addFormats.default(ajv);
const jobValidator = ajv.compile(document.components.schemas.SmokeJob);
const errorValidator = ajv.compile(document.components.schemas.SmokeError);
const key = randomUUID();
const job = {
  id: key,
  kind: "synthetic_parse",
  status: "SUCCEEDED" as const,
  snapshotId: randomUUID(),
  traceId: "0123456789abcdef0123456789abcdef",
  workflowId: `cl-job/${key}`,
  revision: 3,
  epoch: 1,
  terminationState: "not_requested",
  failureCode: null,
  result: fixtureResult("success"),
  createdAt: "2026-10-14T00:00:00.000Z",
  updatedAt: "2026-10-14T00:00:01.000Z",
};

describe("Local synthetic HTTP/Swagger contract (service stub; no DB/Temporal evidence)", () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    vi.stubEnv("CANLEARN_SMOKE_ENABLED", "true");
    vi.stubEnv("CANLEARN_SMOKE_TOKEN", "synthetic-contract-test-credential-only-0000");
    vi.stubEnv("CANLEARN_SMOKE_ORIGIN", "http://127.0.0.1:3310");
    app = await createApplication({ logger: false });
    vi.spyOn(app.get(SmokeService), "create").mockResolvedValue(job);
    vi.spyOn(app.get(SmokeService), "get").mockResolvedValue({ ...job, delivery: [] });
    vi.spyOn(app.get(SmokeService), "cancel").mockResolvedValue(job);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("aligns the three enabled public operations and their request/response schemas", async () => {
    const live = (await app.inject({ method: "GET", url: "/docs-json" })).json();
    expect(Object.keys(live.paths).sort()).toEqual(
      ["/v1/health", ...Object.keys(document.paths)].sort(),
    );
    for (const [path, methods] of Object.entries(document.paths)) {
      for (const [method, expected] of Object.entries(
        methods as Record<string, Record<string, unknown>>,
      )) {
        const actual = live.paths[path][method];
        expect(operationShape(actual, live)).toEqual(operationShape(expected));
        expect(actual.operationId).toBe(expected.operationId);
        expect(actual["x-runtime-scope"]).toBe("local-synthetic-only");
        expect(actual["x-implementation-status"]).toBe("implemented");
        expect(Object.keys(actual.responses).sort()).toEqual(
          Object.keys(expected.responses as object).sort(),
        );
        for (const [code, response] of Object.entries(actual.responses)) {
          const schema = (response as { content: { "application/json": { schema: unknown } } })
            .content["application/json"].schema;
          expect(schema).toEqual(
            Number(code) < 300
              ? document.components.schemas.SmokeJob
              : document.components.schemas.SmokeError,
          );
        }
      }
    }
    expect(
      live.paths["/v1/smoke/jobs"].post.requestBody.content["application/json"].schema,
    ).toEqual(document.components.schemas.CreateSmokeJob);
  });

  it.each([
    {
      method: "POST" as const,
      url: "/v1/smoke/jobs",
      payload: { mode: "success", delayMs: 500 },
      status: 202,
    },
    { method: "GET" as const, url: `/v1/smoke/jobs/${key}`, status: 200 },
    { method: "POST" as const, url: `/v1/smoke/jobs/${key}/cancel`, status: 200 },
  ])("validates actual HTTP $method $url", async ({ method, url, payload, status }) => {
    const response = await app.inject({
      method,
      url,
      payload,
      headers: { "x-smoke-client": "1", "idempotency-key": key },
    });
    expect(response.statusCode).toBe(status);
    expect(jobValidator(response.json())).toBe(true);
  });

  it.each([
    { mode: "unknown", delayMs: 0 },
    { mode: "success", delayMs: -1 },
    { mode: "success", delayMs: 15001 },
    { mode: "success", delayMs: 1.2 },
    { mode: "success" },
    { mode: "success", delayMs: 0, rawText: "forbidden" },
  ])("rejects invalid or arbitrary-content DTO %j before the service", async (payload) => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/smoke/jobs",
      payload,
      headers: { "x-smoke-client": "1", "idempotency-key": key },
    });
    expect(response.statusCode).toBe(400);
    expect(errorValidator(response.json())).toBe(true);
  });
  it.each([
    { headers: { "idempotency-key": key }, remoteAddress: "127.0.0.1" },
    {
      headers: {
        "x-smoke-client": "1",
        "idempotency-key": key,
        origin: "https://untrusted.invalid",
      },
      remoteAddress: "127.0.0.1",
    },
    { headers: { "x-smoke-client": "1", "idempotency-key": key }, remoteAddress: "192.0.2.1" },
  ])("rejects unauthorized local-smoke access %j", async (options) => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/smoke/jobs",
      payload: { mode: "success", delayMs: 0 },
      ...options,
    });
    expect(response.statusCode).toBe(403);
    expect(errorValidator(response.json())).toBe(true);
  });
  it("rejects unauthenticated internal callbacks", async () => {
    const response = await app.inject({ method: "POST", url: "/v1/internal/smoke/outbox/claim" });
    expect(response.statusCode).toBe(403);
  });
  it("detects response drift and extra result content", () => {
    expect(jobValidator({ ...job, status: "RESURRECTED" })).toBe(false);
    expect(jobValidator({ ...job, result: { ...job.result, rawText: "forbidden" } })).toBe(false);
  });

  it.each(["parameters", "security", "requestBody", "responses"])(
    "detects changed Swagger %s constraints",
    async (field) => {
      const live = (await app.inject({ method: "GET", url: "/docs-json" })).json();
      const actual = structuredClone(live.paths["/v1/smoke/jobs"].post);
      actual[field] =
        field === "security" ? [{ UnexpectedSession: [] }] : field === "parameters" ? [] : {};
      expect(operationShape(actual, live)).not.toEqual(
        operationShape(document.paths["/v1/smoke/jobs"].post),
      );
    },
  );
  it("validates the defensive non-loopback GET error body through the real guard", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/smoke/jobs/${key}`,
      remoteAddress: "192.0.2.1",
    });
    expect(response.statusCode).toBe(403);
    expect(() =>
      validateHttp({
        path: `/v1/smoke/jobs/${key}`,
        method: "GET",
        status: response.statusCode,
        contentType: String(response.headers["content-type"]),
        body: response.json(),
      }),
    ).not.toThrow();
  });
});
