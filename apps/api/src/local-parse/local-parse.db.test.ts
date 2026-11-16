import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// 真实 PostgreSQL 行为验证。默认跳过：CI 的 pnpm verify 不带数据库，只有显式给出
// CANLEARN_LOCAL_PARSE_TEST_DATABASE_URL 时才在隔离实例上运行（当前证据见 docs/api/CL-105）。
const databaseUrl = process.env.CANLEARN_LOCAL_PARSE_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const documentId = "10500000-0000-4000-8000-0000000000a1";
const versionId = "10500000-0000-4000-8000-0000000000a2";
const payload = {
  documentId,
  versionId,
  sourceRevision: 1,
  profileId: "local-synthetic-v1",
  fixture: "partial",
  pages: [1, 2, 3],
};
const headers = { "x-smoke-client": "1" };

suite("CL-105 local parse persistence on a disposable PostgreSQL", () => {
  let app: NestFastifyApplication;
  let requestKey: string;
  let firstJobId: string;

  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", databaseUrl as string);
    vi.stubEnv("CANLEARN_LOCAL_PARSE_ENABLED", "true");
    vi.stubEnv("CANLEARN_SMOKE_TOKEN", "local-parse-db-test-token-000000000");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const client = postgres(databaseUrl as string, { max: 1 });
    await client.unsafe(
      "drop schema if exists public cascade; create schema public; drop schema if exists drizzle cascade;",
    );
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    await client.end();
    const { createApplication } = await import("../application.js");
    app = await createApplication({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it("creates a job with the requested-page denominator and a synthetic partial result", async () => {
    requestKey = randomUUID();
    const response = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload,
      headers: { ...headers, "idempotency-key": requestKey },
    });
    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.status).toBe("PARTIAL_READY");
    expect(body.requestedPages).toEqual([1, 2, 3]);
    expect(body.pageResults).toEqual([
      { pageIndex: 1, status: "success" },
      { pageIndex: 2, status: "failed" },
      { pageIndex: 3, status: "success" },
    ]);
    expect(body.failureCode).toBeNull();
    expect(body.terminationState).toBe("not_requested");
    firstJobId = body.id;
    expect(body.revision).toBe(1);
    expect(body.epoch).toBe(1);
    expect(response.headers.location).toBe(`/v1/local/jobs/${body.id}`);
    expect(response.headers.etag).toBe(response.headers.etag?.match(/^"[0-9a-f]{64}"$/)?.at(0));
  });

  it("replays the same key/payload on the same job without a second row", async () => {
    const replay = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload,
      headers: { ...headers, "idempotency-key": requestKey },
    });
    expect(replay.statusCode).toBe(202);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    const created = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload: { ...payload, pages: [1, 2, 3] },
      headers: { ...headers, "idempotency-key": requestKey },
    });
    expect(created.json().id).toBe(replay.json().id);
  });

  it("rejects the same key with changed input", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload: { ...payload, sourceRevision: 2 },
      headers: { ...headers, "idempotency-key": requestKey },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("keeps an already terminal job unchanged on repeated cancel", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload: { ...payload, fixture: "pending", pages: undefined, all: true },
      headers: { ...headers, "idempotency-key": randomUUID() },
    });
    const id = first.json().id;
    const cancel = await app.inject({
      method: "POST",
      url: `/v1/local/jobs/${id}/cancel`,
      headers,
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().status).toBe("CANCELLED");
    expect(cancel.json().epoch).toBe(2);
    expect(cancel.json().terminationState).toBe("requested");
    const cancelledEtag = cancel.headers.etag;
    const second = await app.inject({
      method: "POST",
      url: `/v1/local/jobs/${id}/cancel`,
      headers,
    });
    expect(second.json().epoch).toBe(2);
    expect(second.json().revision).toBe(cancel.json().revision);
    expect(second.headers.etag).toBe(cancelledEtag);
  });

  it("rejects a late receipt after the job was cancelled (no revival)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload: { ...payload, fixture: "pending", pages: undefined, all: true },
      headers: { ...headers, "idempotency-key": randomUUID() },
    });
    const job = created.json();
    const cancel = await app.inject({
      method: "POST",
      url: `/v1/local/jobs/${job.id}/cancel`,
      headers,
    });
    const cancelledEpoch = cancel.json().epoch;
    const late = await app.inject({
      method: "POST",
      url: `/v1/internal/local-parse/jobs/${job.id}/admit`,
      payload: {
        snapshotId: job.snapshotId,
        epoch: cancelledEpoch,
        pages: [1, 2, 3, 4, 5, 6].map((pageIndex) => ({ pageIndex, status: "success" })),
      },
      headers: { "x-smoke-token": "local-parse-db-test-token-000000000" },
    });
    expect(late.statusCode).toBe(409);
    const current = await app.inject({ method: "GET", url: `/v1/local/jobs/${job.id}` });
    expect(current.json()).toMatchObject({
      status: "CANCELLED",
      pageResults: null,
      terminationState: "requested",
    });
  });

  it("accepts an in-flight receipt once and rejects stale epoch replays", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload: { ...payload, fixture: "pending", pages: undefined, all: true },
      headers: { ...headers, "idempotency-key": randomUUID() },
    });
    const job = created.json();
    const receipt = {
      snapshotId: job.snapshotId,
      epoch: 1,
      pages: [1, 2, 3, 4, 5, 6].map((pageIndex) => ({
        pageIndex,
        status: pageIndex === 4 ? "missing" : "success",
      })),
    };
    const accepted = await app.inject({
      method: "POST",
      url: `/v1/internal/local-parse/jobs/${job.id}/admit`,
      payload: receipt,
      headers: { "x-smoke-token": "local-parse-db-test-token-000000000" },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ status: "PARTIAL_READY", revision: 2 });
    expect(accepted.json().requestedPages).toEqual([1, 2, 3, 4, 5, 6]);
    // 同一回执再次提交不产生第二份结果；取消先提交则晚到结果永远拒绝。
    const replay = await app.inject({
      method: "POST",
      url: `/v1/internal/local-parse/jobs/${job.id}/admit`,
      payload: receipt,
      headers: { "x-smoke-token": "local-parse-db-test-token-000000000" },
    });
    expect(replay.statusCode).toBe(409);
    const cancel = await app.inject({
      method: "POST",
      url: `/v1/local/jobs/${job.id}/cancel`,
      headers,
    });
    expect(cancel.json()).toMatchObject({
      status: "PARTIAL_READY",
      terminationState: "not_requested",
    });
  });

  it("serializes concurrent same-key creates onto exactly one job", async () => {
    const requestKey = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        app.inject({
          method: "POST",
          url: "/v1/local/parse-jobs",
          payload,
          headers: { ...headers, "idempotency-key": requestKey },
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode)).toEqual([202, 202, 202, 202]);
    expect(new Set(responses.map((response) => response.json().id)).size).toBe(1);
    expect(
      responses.filter((response) => response.headers["idempotency-replayed"] === "true").length,
    ).toBe(3);
    expect(responses[0]?.json().revision).toBe(1);
  });

  it("gives one terminal outcome when cancel races a late receipt", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/local/parse-jobs",
      payload: { ...payload, fixture: "pending", pages: undefined, all: true },
      headers: { ...headers, "idempotency-key": randomUUID() },
    });
    const job = created.json();
    const receipt = {
      snapshotId: job.snapshotId,
      epoch: 1,
      pages: [1, 2, 3, 4, 5, 6].map((pageIndex) => ({ pageIndex, status: "success" })),
    };
    const [cancel, admit] = await Promise.all([
      app.inject({ method: "POST", url: `/v1/local/jobs/${job.id}/cancel`, headers }),
      app.inject({
        method: "POST",
        url: `/v1/internal/local-parse/jobs/${job.id}/admit`,
        payload: receipt,
        headers: { "x-smoke-token": "local-parse-db-test-token-000000000" },
      }),
    ]);
    expect(cancel.statusCode).toBe(200);
    const current = (await app.inject({ method: "GET", url: `/v1/local/jobs/${job.id}` })).json();
    // 两个提交共享同一行锁：只有先提交者生效；晚到一方要么 409，要么看到既有终态。
    if (admit.statusCode === 200) {
      expect(current).toMatchObject({ status: "SUCCEEDED", terminationState: "not_requested" });
      expect(current.pageResults).toHaveLength(6);
    } else {
      expect(admit.statusCode).toBe(409);
      expect(current).toMatchObject({ status: "CANCELLED", pageResults: null });
      expect(current.terminationState).toBe("requested");
    }
  });

  it("stops accepting new local jobs at the fixed capacity", async () => {
    const create = () =>
      app.inject({
        method: "POST",
        url: "/v1/local/parse-jobs",
        payload: { ...payload, fixture: "pending", pages: undefined, all: true },
        headers: { ...headers, "idempotency-key": randomUUID() },
      });
    // 活跃上限固定为 10；前面的用例已留下活跃 pending Job，所以这里可能一开始就被拒。
    let blocked = await create();
    for (let index = 0; index < 12 && blocked.statusCode === 202; index += 1) {
      blocked = await create();
    }
    expect(blocked.statusCode).toBe(503);
    expect(blocked.json().message).toBe("LOCAL_PARSE_CAPACITY_REACHED");
  });

  it("serves the persisted view after an application rebuild", async () => {
    // 复用首个用例的 Job：此时活跃队列可能已达上限，重建读取不应依赖新建。
    const id = firstJobId;
    const { createApplication } = await import("../application.js");
    const restarted = await createApplication({ logger: false });
    await restarted.init();
    await restarted.getHttpAdapter().getInstance().ready();
    const response = await restarted.inject({ method: "GET", url: `/v1/local/jobs/${id}` });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({
      id,
      status: "PARTIAL_READY",
      requestedPages: [1, 2, 3],
    });
    await restarted.close();
  });
});
