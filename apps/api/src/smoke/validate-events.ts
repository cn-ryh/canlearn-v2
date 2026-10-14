// CLI validator for real synthetic Outbox evidence; no server-side network schema loading.
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const path = process.argv[2];
if (!path) throw new Error("An isolated synthetic event file is required");
const root = new URL("../../../../contracts/events/", import.meta.url);
const load = (name: string) => JSON.parse(readFileSync(new URL(name, root), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats.default(ajv);
const validators = new Map<string, ReturnType<typeof ajv.compile>>(
  load("catalog.json").events.map((event: { event_type: string; schema_file: string }) => [
    event.event_type,
    ajv.compile(load(event.schema_file)),
  ]),
);
const events = JSON.parse(readFileSync(path, "utf8")) as { event_type: string }[];
if (!events.length) throw new Error("Synthetic Outbox is empty");
for (const event of events) {
  const validator = validators.get(event.event_type);
  if (!validator?.(event)) throw new Error("Persisted synthetic event violates CL-008 schema");
}
console.log(`Validated ${events.length} persisted synthetic Outbox events`);
