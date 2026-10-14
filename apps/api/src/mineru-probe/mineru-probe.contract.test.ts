import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApplication } from "../application.js";
import { MineruProbeService } from "./mineru-probe.service.js";

const token = "nonexistent-probe-contract-credential-000000";

describe("Private original-fixture probe admission; service stub, no parsing evidence", () => {
  let app: NestFastifyApplication;
  let create: ReturnType<typeof vi.spyOn>;
  beforeAll(async () => {
    vi.stubEnv("CANLEARN_SMOKE_ENABLED", "true");
    vi.stubEnv("CANLEARN_MINERU_PROBE_ENABLED", "true");
    vi.stubEnv("CANLEARN_SMOKE_TOKEN", token);
    app = await createApplication({ logger: false });
    create = vi
      .spyOn(app.get(MineruProbeService), "create")
      .mockResolvedValue({ id: randomUUID() } as Awaited<ReturnType<MineruProbeService["create"]>>);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  it("requires the private service token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/internal/mineru-probe/jobs",
      payload: { requestKey: randomUUID(), fixtureId: "reading", tier: "basic", pollSeconds: 600 },
    });
    expect(response.statusCode).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
  it.each([
    { fixtureId: "real-upload.pdf", tier: "basic", pollSeconds: 600 },
    { fixtureId: "reading", tier: "standard", pollSeconds: 600 },
    { fixtureId: "reading", tier: "flash", pollSeconds: 601 },
    { fixtureId: "reading", tier: "flash", pollSeconds: 60, rawText: "forbidden" },
  ])("rejects unsupported or arbitrary input %j", async (input) => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/internal/mineru-probe/jobs",
          headers: { "x-smoke-token": token },
          payload: { requestKey: randomUUID(), ...input },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("does not promote any production operation or expose the private routes in Swagger", async () => {
    const live = (await app.inject({ method: "GET", url: "/docs-json" })).json();
    expect(Object.keys(live.paths).sort()).toEqual(
      ["/v1/health", "/v1/smoke/jobs", "/v1/smoke/jobs/{id}", "/v1/smoke/jobs/{id}/cancel"].sort(),
    );
  });
});
