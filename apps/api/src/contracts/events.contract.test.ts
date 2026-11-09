import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { jobStatus } from "../database/schema.js";

type Entry = {
  event_type: string;
  schema_version: number;
  implementation_status: string;
  schema_file: string;
};
type Example = { name: string; event_type: string; valid: boolean; value: unknown };
const root = new URL("../../../../contracts/events/", import.meta.url);
const load = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const catalog = load("catalog.json") as { implementation_status: string; events: Entry[] };
const examples = load("fixtures/examples.json") as { cases: Example[] };
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats.default(ajv);
const validators = new Map(
  catalog.events.map((entry) => [entry.event_type, ajv.compile(load(entry.schema_file))]),
);

describe("CL-008 production event proposals; local synthetic transport is verified separately", () => {
  it("uses only existing terminal Job states without expanding the database enum", () => {
    expect(jobStatus.enumValues).toEqual([
      "QUEUED",
      "RUNNING",
      "WAITING_REVIEW",
      "PARTIAL_READY",
      "SUCCEEDED",
      "FAILED",
      "CANCELLED",
    ]);
    expect(
      load("v1/job.finalized.v1.schema.json").properties.payload.properties.status.enum,
    ).toEqual(["PARTIAL_READY", "SUCCEEDED", "FAILED", "CANCELLED"]);
  });

  it("keeps the catalog limited to four planned, uniquely versioned event families", () => {
    expect(catalog.implementation_status).toBe("planned");
    expect(catalog.events.map((e) => e.event_type).sort()).toEqual(
      [
        "job.accepted.v1",
        "job.finalized.v1",
        "job.cancel_requested.v1",
        "resource.invalidated.v1",
      ].sort(),
    );
    expect(new Set(catalog.events.map((e) => e.schema_file)).size).toBe(4);
    for (const entry of catalog.events) {
      expect(entry.implementation_status).toBe("planned");
      expect(entry.schema_version).toBe(1);
    }
  });

  it.each(catalog.events)("compiles the closed 2020-12 schema $event_type", (entry) => {
    const schema = load(entry.schema_file);
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.properties.event_type.const).toBe(entry.event_type);
    expect(schema.properties.schema_version.const).toBe(entry.schema_version);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.payload.additionalProperties).toBe(false);
    expect(validators.has(entry.event_type)).toBe(true);
  });

  it.each(examples.cases)("checks synthetic event $name", ({ event_type, value, valid }) => {
    const validator = validators.get(event_type);
    expect(validator).toBeDefined();
    expect(validator?.(value)).toBe(valid);
  });

  it("has positive evidence for every catalog entry and meaningful breaking mutants", () => {
    expect(new Set(examples.cases.filter((e) => e.valid).map((e) => e.event_type))).toEqual(
      new Set(catalog.events.map((e) => e.event_type)),
    );
    const negatives = examples.cases.filter((e) => !e.valid);
    for (const name of [
      "missing-space",
      "unknown-version",
      "raw-text",
      "credential-field",
      "url-field",
      "deletion-no-watermark",
      "empty-partial",
    ]) {
      expect(negatives.some((e) => e.name === name)).toBe(true);
    }
  });
});
