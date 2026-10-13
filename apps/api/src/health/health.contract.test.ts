import { readFileSync } from "node:fs";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { createApplication } from "../application.js";

type ObjectValue = Record<string, unknown>;
type Verb = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace";
const verbs: Verb[] = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const contract = parse(
  readFileSync(new URL("../../../../contracts/openapi/canlearn.v1.yaml", import.meta.url), "utf8"),
) as ObjectValue;

function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected object");
  return value as ObjectValue;
}

function operations(document: ObjectValue) {
  return Object.entries(object(document.paths)).flatMap(([path, item]) =>
    verbs.flatMap((method) => {
      const operation = object(item)[method];
      return operation ? [{ path, method, operation: object(operation) }] : [];
    }),
  );
}

function resolve(value: unknown, document: ObjectValue): unknown {
  if (Array.isArray(value)) return value.map((item) => resolve(item, document));
  if (value && typeof value === "object") {
    const node = object(value);
    if (typeof node.$ref === "string") {
      if (!node.$ref.startsWith("#/components/schemas/")) throw new Error("Unexpected schema ref");
      const schemas = object(object(document.components).schemas);
      const name = node.$ref.slice("#/components/schemas/".length);
      if (!(name in schemas)) throw new Error("Missing schema");
      return resolve(schemas[name], document);
    }
    return Object.fromEntries(
      Object.entries(node).map(([key, item]) => [key, resolve(item, document)]),
    );
  }
  return value;
}

function schemaAt(document: ObjectValue, path: string, method: Verb) {
  const operation = object(object(object(document.paths)[path])[method]);
  return object(object(object(object(operation.responses)["200"]).content)["application/json"])
    .schema;
}

function assertAlignment(expected: ObjectValue, runtime: ObjectValue) {
  const specified = operations(expected);
  for (const { operation } of specified) {
    expect(["planned", "implemented"]).toContain(operation["x-implementation-status"]);
  }
  const implemented = specified.filter(
    ({ operation }) => operation["x-implementation-status"] === "implemented",
  );
  const actual = operations(runtime);
  const ids = (rows: typeof actual) => rows.map(({ path, method }) => `${method} ${path}`).sort();
  expect(ids(actual)).toEqual(ids(implemented));
  for (const entry of implemented) {
    const live = actual.find(({ path, method }) => path === entry.path && method === entry.method);
    if (!live) throw new Error("Runtime operation missing");
    expect(live.operation.operationId).toBe(entry.operation.operationId);
    expect(live.operation["x-implementation-status"]).toBe("implemented");
    expect(live.operation.security ?? runtime.security ?? []).toEqual(
      entry.operation.security ?? expected.security ?? [],
    );
    expect(Object.keys(object(live.operation.responses)).sort()).toEqual(
      Object.keys(object(entry.operation.responses)).sort(),
    );
    expect(resolve(schemaAt(runtime, entry.path, entry.method), runtime)).toEqual(
      resolve(schemaAt(expected, entry.path, entry.method), expected),
    );
  }
}

const ajv = new Ajv2020({ allErrors: true });
addFormats.default(ajv);
ajv.addFormat("binary", true); // Schema-only multipart/binary strings; does not validate actual files.
const schemas = object(object(contract.components).schemas);
const healthValidator = ajv.compile(resolve(schemas.HealthResponse, contract) as ObjectValue);
const planned = operations(contract).filter(
  ({ operation }) => operation["x-implementation-status"] === "planned",
);
const examples = JSON.parse(
  readFileSync(
    new URL("../../../../docs/api/CL-007/contract-examples.json", import.meta.url),
    "utf8",
  ),
) as { cases: { name: string; schema: string; value: unknown; valid: boolean }[] };

describe("Implemented REST contract and runtime Swagger", () => {
  let app: NestFastifyApplication;
  let runtime: ObjectValue;

  beforeAll(async () => {
    app = await createApplication({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const response = await app.inject({ method: "GET", url: "/docs-json" });
    expect(response.statusCode).toBe(200);
    runtime = response.json();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("validates the actual HTTP health response against the handwritten schema", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/health" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(healthValidator(response.json())).toBe(true);
  });

  it("aligns implemented paths, operation IDs, security, status codes and response schemas", () => {
    expect(runtime.openapi).toBe("3.1.0");
    assertAlignment(contract, runtime);
  });

  it.each([
    { service: "canlearn-api", status: "wrong" },
    { service: "other-service", status: "ok" },
    { service: "canlearn-api" },
    { service: "canlearn-api", status: "ok", secret: "synthetic" },
  ])("rejects a changed/missing/extra response field: %j", (value) => {
    expect(healthValidator(value)).toBe(false);
  });

  it("detects a changed handwritten health schema", () => {
    const changed = structuredClone(contract);
    object(object(object(object(changed.components).schemas).HealthResponse).properties).status = {
      type: "string",
      enum: ["changed"],
    };
    expect(() => assertAlignment(changed, runtime)).toThrow();
  });

  it("detects a new undocumented runtime route", () => {
    const changed = structuredClone(runtime);
    object(changed.paths)["/v1/unrecorded"] = { get: { operationId: "unrecorded" } };
    expect(() => assertAlignment(contract, changed)).toThrow();
  });

  it("detects a planned operation promoted without implementation", () => {
    const changed = structuredClone(contract);
    object(object(object(changed.paths)["/v1/jobs"]).get)["x-implementation-status"] =
      "implemented";
    expect(() => assertAlignment(changed, runtime)).toThrow();
  });

  it.each(planned)(
    "keeps planned $method $path absent from the running API",
    async ({ path, method }) => {
      if (method === "trace") throw new Error("TRACE is not a supported API operation");
      const url = path.replace(/\{[^}]+\}/g, (name) =>
        name === "{pageIndex}" ? "1" : "00000000-0000-4000-8000-000000000001",
      );
      const response = await app.inject({
        method: method.toUpperCase() as Uppercase<Exclude<Verb, "trace">>,
        url,
      });
      expect(response.statusCode).toBe(404);
    },
  );
});

describe("Planned contract schemas; no business execution", () => {
  it.each(examples.cases)("validates synthetic DTO $name", ({ schema, value, valid }) => {
    const validator = ajv.compile(resolve(schemas[schema], contract) as ObjectValue);
    expect(validator(value)).toBe(valid);
  });

  it.each(Object.entries(schemas))(
    "compiles schema %s with JSON Schema 2020-12",
    (_name, schema) => {
      expect(() => ajv.compile(resolve(schema, contract) as ObjectValue)).not.toThrow();
    },
  );

  it("marks all planned operations and requires session security", () => {
    expect(planned.length).toBeGreaterThan(0);
    for (const { method, operation } of planned) {
      expect(operation.summary).toMatch(/^\[规划\]/);
      expect(operation.security ?? contract.security).toEqual([{ SessionCookie: [] }]);
      if (method !== "get") {
        expect(operation["x-idempotency-scope"]).toBeTypeOf("string");
        expect(JSON.stringify(operation.parameters)).toContain("IdempotencyKey");
        expect(JSON.stringify(operation.parameters)).toContain("CsrfToken");
      }
    }
  });
});
