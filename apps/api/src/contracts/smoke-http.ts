// Validate captured, actual public HTTP responses. Never log response bodies or headers.
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

type Node = Record<string, unknown>;
type Content = Record<string, { schema: unknown }>;
interface Operation {
  operationId?: string;
  security?: unknown;
  "x-implementation-status"?: string;
  "x-runtime-scope"?: string;
  parameters?: { in: string; name: string; required?: boolean; schema: unknown }[];
  requestBody?: { required?: boolean; content?: Content };
  responses: Record<string, { content?: Content; headers?: unknown }>;
}
interface Document {
  security?: unknown;
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, unknown> };
}
export const smokeDocument: Document = JSON.parse(
  readFileSync(
    new URL("../../../../contracts/openapi/canlearn.smoke.v1.json", import.meta.url),
    "utf8",
  ),
);

export function resolve(value: unknown, document: Document = smokeDocument): unknown {
  if (Array.isArray(value)) return value.map((item) => resolve(item, document));
  if (value && typeof value === "object") {
    const node = value as Node;
    if (typeof node.$ref === "string") {
      if (!node.$ref.startsWith("#/components/schemas/")) throw new Error("Unsupported reference");
      const schema = document.components.schemas[node.$ref.slice("#/components/schemas/".length)];
      if (!schema) throw new Error("Unresolved schema");
      return resolve(schema, document);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolve(item, document)]),
    );
  }
  return value;
}

// Descriptions/examples are editorial; all wire-level constraints participate in alignment.
export function operationShape(value: unknown, document: Document = smokeDocument) {
  const operation = value as Operation;
  const content = (entries: Content = {}) =>
    Object.fromEntries(
      Object.entries(entries).map(([media, item]) => [media, resolve(item.schema, document)]),
    );
  return {
    operationId: operation.operationId,
    security: operation.security ?? document.security ?? [],
    implementation: operation["x-implementation-status"],
    scope: operation["x-runtime-scope"],
    parameters: (operation.parameters ?? [])
      .map((parameter) => ({
        in: parameter.in,
        name: parameter.in === "header" ? parameter.name.toLowerCase() : parameter.name,
        required: parameter.required ?? false,
        schema: resolve(parameter.schema, document),
      }))
      .sort((a, b) => `${a.in}/${a.name}`.localeCompare(`${b.in}/${b.name}`)),
    requestBody: operation.requestBody
      ? {
          required: operation.requestBody.required ?? false,
          content: content(operation.requestBody.content),
        }
      : null,
    responses: Object.fromEntries(
      Object.entries(operation.responses).map(([status, response]) => [
        status,
        {
          content: content(response.content),
          headers: resolve(response.headers ?? {}, document),
        },
      ]),
    ),
  };
}

export interface HttpObservation {
  path: string;
  method: string;
  status: number;
  contentType: string;
  body: unknown;
}
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats.default(ajv);
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
export function validateHttp(observation: HttpObservation): string {
  const template = Object.keys(smokeDocument.paths).find((path) =>
    new RegExp(`^${path.replace("{id}", "[^/]+")}$`).test(observation.path),
  );
  const method = observation.method.toLowerCase();
  const operation = template ? smokeDocument.paths[template]?.[method] : undefined;
  if (operation?.["x-implementation-status"] !== "implemented")
    throw new Error("Unknown implemented operation");
  const key = `${method} ${template} ${observation.status}`;
  const response = operation.responses[observation.status];
  const media = observation.contentType.split(";")[0]?.trim().toLowerCase();
  if (!media) throw new Error(`Missing response media: ${key}`);
  if (!response?.content?.[media]) throw new Error(`Undocumented status/media: ${key}`);
  let validator = validators.get(key);
  if (!validator) {
    validator = ajv.compile(resolve(response.content[media].schema) as object);
    validators.set(key, validator);
  }
  if (!validator(observation.body)) throw new Error(`Response schema violation: ${key}`);
  if (observation.status >= 400 && (observation.body as Node).statusCode !== observation.status)
    throw new Error(`Error status mismatch: ${key}`);
  return key;
}

export function validateObservations(observations: HttpObservation[]) {
  if (!observations.length) throw new Error("No real public HTTP observations");
  const coverage = [...new Set(observations.map(validateHttp))].sort();
  const required = Object.entries(smokeDocument.paths).flatMap(([path, methods]) =>
    Object.entries(methods).flatMap(([method, operation]) =>
      // GET's non-loopback 403 is exercised via real Nest guard injection: the server binds loopback.
      Object.keys(operation.responses)
        .filter((status) => !(method === "get" && status === "403"))
        .map((status) => `${method} ${path} ${status}`),
    ),
  );
  if (required.some((key) => !coverage.includes(key)))
    throw new Error("Missing documented public HTTP response coverage");
  return { observations: observations.length, coverage };
}
