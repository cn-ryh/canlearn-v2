import { readFileSync } from "node:fs";
import { ConflictException } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApplication } from "../application.js";
import { operationShape } from "../contracts/smoke-http.js";
import { strongEtag } from "./local-parse.domain.js";
import { LocalParseService } from "./local-parse.service.js";

const document = JSON.parse(
  readFileSync(
    new URL("../../../../contracts/openapi/canlearn.local.v1.json", import.meta.url),
    "utf8",
  ),
);
const ajv = new Ajv2020({ allErrors: true });
addFormats.default(ajv);
const jobValidator = ajv.compile(document.components.schemas.LocalParseJob);
const errorValidator = ajv.compile(document.components.schemas.LocalParseError);
const key = "6f4a2a1e-0000-4000-8000-000000000001";
const job = {
  id: "10500000-0000-4000-8000-000000000011",
  kind: "local_parse",
  status: "PARTIAL_READY",
  snapshotId: "10500000-0000-4000-8000-000000000012",
  traceId: "0123456789abcdef0123456789abcdef",
  documentId: "10500000-0000-4000-8000-000000000001",
  versionId: "10500000-0000-4000-8000-000000000002",
  sourceRevision: 3,
  profileId: "local-synthetic-v1",
  fixture: "partial",
  requestedPages: [1, 2],
  pageResults: [
    { pageIndex: 1, status: "success" },
    { pageIndex: 2, status: "failed" },
  ],
  revision: 1,
  epoch: 1,
  terminationState: "not_requested",
  failureCode: null,
  createdAt: "2026-11-11T00:00:00.000Z",
  updatedAt: "2026-11-11T00:00:01.000Z",
};
const etag = strongEtag(job);
const payload = {
  documentId: job.documentId,
  versionId: job.versionId,
  sourceRevision: 3,
  profileId: "local-synthetic-v1",
  fixture: "partial",
  pages: [1, 2],
};

describe("CL-105 local isolated HTTP/Swagger contract (service stub; no DB/Temporal evidence)", () => {
  let app: NestFastifyApplication;
  let create: ReturnType<typeof vi.spyOn>;
  let get: ReturnType<typeof vi.spyOn>;
  let cancel: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    // 开关与 token 必须在 createApplication() 之前设置：模块装配与 guard 都读 process.env。
    vi.stubEnv("CANLEARN_LOCAL_PARSE_ENABLED", "true");
    vi.stubEnv("CANLEARN_SMOKE_TOKEN", "local-parse-contract-test-token-000000");
    app = await createApplication({ logger: false });
    const service = app.get(LocalParseService);
    // 只替换 service 边界，路由/guard/pipe/Swagger 仍走真实 Nest/Fastify。
    create = vi
      .spyOn(service, "create")
      .mockResolvedValue({ view: job as never, replayed: false, etag });
    get = vi.spyOn(service, "get").mockResolvedValue({ view: job as never, replayed: false, etag });
    cancel = vi
      .spyOn(service, "cancel")
      .mockResolvedValue({ view: job as never, replayed: false, etag });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("aligns the three local operations with the isolated contract", async () => {
    const live = (await app.inject({ method: "GET", url: "/docs-json" })).json();
    expect(Object.keys(live.paths).sort()).toEqual(
      ["/v1/health", ...Object.keys(document.paths)].sort(),
    );
    for (const [path, methods] of Object.entries(document.paths)) {
      for (const [method, expected] of Object.entries(
        methods as Record<string, Record<string, unknown>>,
      )) {
        const actual = live.paths[path][method];
        expect(operationShape(actual, document)).toEqual(operationShape(expected, document));
        expect(actual.operationId).toBe(expected.operationId);
        expect(actual["x-runtime-scope"]).toBe("local-isolated-only");
        expect(actual["x-implementation-status"]).toBe("implemented");
        for (const [code, response] of Object.entries(actual.responses)) {
          const schema = (response as { content: { "application/json": { schema: unknown } } })
            .content["application/json"].schema;
          expect(schema).toEqual(
            Number(code) < 300
              ? document.components.schemas.LocalParseJob
              : document.components.schemas.LocalParseError,
          );
        }
      }
    }
    expect(
      live.paths["/v1/local/parse-jobs"].post.requestBody.content["application/json"].schema,
    ).toEqual(document.components.schemas.CreateLocalParseJob);
  });

  it("returns 202 + Location/ETag and validates the JSON body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload,
      headers: { "x-smoke-client": "1", "idempotency-key": key },
    });
    expect(response.statusCode).toBe(202);
    expect(response.headers.location).toBe(`/v1/local/jobs/${job.id}`);
    expect(response.headers.etag).toBe(etag);
    expect(response.headers["cache-control"]).toBeUndefined();
    expect(response.headers["idempotency-replayed"]).toBeUndefined();
    expect(jobValidator(response.json())).toBe(true);
  });

  it("marks an idempotent replay with Idempotency-Replayed: true", async () => {
    create.mockResolvedValueOnce({ view: job as never, replayed: true, etag });
    const response = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload,
      headers: { "x-smoke-client": "1", "idempotency-key": key },
    });
    expect(response.statusCode).toBe(202);
    expect(response.headers["idempotency-replayed"]).toBe("true");
    expect(response.headers.location).toBe(`/v1/local/jobs/${job.id}`);
    expect(response.json()).toEqual(job);
  });

  it("surfaces a same-key/different-payload conflict as 409", async () => {
    create.mockRejectedValueOnce(new ConflictException("IDEMPOTENCY_KEY_REUSED"));
    const response = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload: { ...payload, sourceRevision: 9, fixture: "success", pages: undefined, all: true },
      headers: { "x-smoke-client": "1", "idempotency-key": key },
    });
    expect(response.statusCode).toBe(409);
    expect(errorValidator(response.json())).toBe(true);
  });

  it("returns 200 with no-store and a strong ETag for the job view", async () => {
    const response = await app.inject({ method: "GET", url: `/v1/local/jobs/${job.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.etag).toBe(etag);
    expect(jobValidator(response.json())).toBe(true);
  });

  it("returns 200 with no-store for cancel", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/local/jobs/${job.id}/cancel`,
      headers: { "x-smoke-client": "1" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.etag).toBe(etag);
    expect(jobValidator(response.json())).toBe(true);
  });

  it.each([
    {
      label: "both all and pages",
      patch: { all: true, pages: [1] },
    },
    {
      label: "neither all nor pages",
      patch: { all: undefined, pages: undefined },
    },
  ])("rejects an ambiguous page scope ($label) with 422 before the service", async ({ patch }) => {
    create.mockClear();
    const response = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload: { ...payload, ...patch },
      headers: { "x-smoke-client": "1", "idempotency-key": key },
    });
    expect(response.statusCode).toBe(422);
    expect(errorValidator(response.json())).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    { profileId: "mineru-4.0.7" },
    { fixture: "real-pdf" },
    { sourceRevision: 0 },
    { pages: [0] },
    { pages: [7] },
    { pages: [] },
    { documentId: "not-a-uuid" },
    { all: false },
    { all: true, rawText: "forbidden" },
  ])("rejects invalid DTO %j before the service", async (patch) => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload: { ...payload, ...patch },
      headers: { "x-smoke-client": "1", "idempotency-key": key },
    });
    expect(response.statusCode).toBe(400);
    expect(errorValidator(response.json())).toBe(true);
  });

  it("rejects a missing or malformed idempotency key with 400", async () => {
    const missing = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload,
      headers: { "x-smoke-client": "1" },
    });
    expect(missing.statusCode).toBe(400);
    const malformed = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload,
      headers: { "x-smoke-client": "1", "idempotency-key": "not-a-uuid" },
    });
    expect(malformed.statusCode).toBe(400);
  });

  it("requires the local client header and a loopback peer", async () => {
    const missing = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload,
      headers: { "idempotency-key": key },
    });
    expect(missing.statusCode).toBe(403);
    const untrustedOrigin = await app.inject({
      method: "POST",
      url: `/v1/local/jobs/${job.id}/cancel`,
      headers: { "x-smoke-client": "1", origin: "https://untrusted.invalid" },
    });
    expect(untrustedOrigin.statusCode).toBe(403);
    const offLoopback = await app.inject({
      method: "GET",
      url: `/v1/local/jobs/${job.id}`,
      remoteAddress: "192.0.2.1",
    });
    expect(offLoopback.statusCode).toBe(403);
    expect(errorValidator(offLoopback.json())).toBe(true);
  });

  it("rejects an unknown job id shape and an unknown job before returning data", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/local/jobs/not-a-uuid" })).statusCode).toBe(
      400,
    );
    const { NotFoundException } = await import("@nestjs/common");
    get.mockRejectedValueOnce(new NotFoundException("LOCAL_PARSE_JOB_NOT_FOUND"));
    const response = await app.inject({
      method: "GET",
      url: "/v1/local/jobs/10500000-0000-4000-8000-0000000000ff",
    });
    expect(response.statusCode).toBe(404);
    expect(errorValidator(response.json())).toBe(true);
    cancel.mockRejectedValueOnce(new NotFoundException("LOCAL_PARSE_JOB_NOT_FOUND"));
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/local/jobs/10500000-0000-4000-8000-0000000000ff/cancel",
          headers: { "x-smoke-client": "1" },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("keeps the internal late-receipt transport out of public Swagger", async () => {
    const live = (await app.inject({ method: "GET", url: "/docs-json" })).json();
    expect(Object.keys(live.paths)).not.toContain("/v1/internal/local-parse/jobs/{jobId}/admit");
  });

  it("detects response drift, extra fields and widened page scope", () => {
    expect(jobValidator({ ...job, status: "RESURRECTED" })).toBe(false);
    expect(
      jobValidator({ ...job, pageResults: [{ pageIndex: 1, status: "success", text: "x" }] }),
    ).toBe(false);
    expect(jobValidator({ ...job, requestedPages: [1, 1] })).toBe(false);
    expect(jobValidator({ ...job, pageResults: [{ pageIndex: 1, status: "partial" }] })).toBe(
      false,
    );
  });

  it.each(["parameters", "security", "requestBody", "responses"])(
    "detects changed Swagger %s constraints",
    async (field) => {
      const live = (await app.inject({ method: "GET", url: "/docs-json" })).json();
      const actual = structuredClone(live.paths["/v1/local/parse-jobs"].post);
      actual[field] =
        field === "security" ? [{ UnexpectedSession: [] }] : field === "parameters" ? [] : {};
      expect(operationShape(actual, document)).not.toEqual(
        operationShape(document.paths["/v1/local/parse-jobs"].post, document),
      );
    },
  );
});

describe("CL-105 local routes stay absent when the switch is off", () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("CANLEARN_LOCAL_PARSE_ENABLED", "false");
    vi.stubEnv("CANLEARN_SMOKE_ENABLED", "false");
    app = await createApplication({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it.each([
    { method: "POST" as const, url: "/v1/local/parse-jobs" },
    { method: "GET" as const, url: "/v1/local/jobs/10500000-0000-4000-8000-000000000011" },
    {
      method: "POST" as const,
      url: "/v1/local/jobs/10500000-0000-4000-8000-000000000011/cancel",
    },
  ])("returns 404 for $method $url when disabled", async ({ method, url }) => {
    const response = await app.inject({ method, url });
    expect(response.statusCode).toBe(404);
  });

  it("does not publish local routes in Swagger when disabled", async () => {
    const live = (await app.inject({ method: "GET", url: "/docs-json" })).json();
    expect(Object.keys(live.paths)).toEqual(["/v1/health"]);
  });
});
