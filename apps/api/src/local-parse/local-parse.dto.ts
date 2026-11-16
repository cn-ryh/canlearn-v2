import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from "class-validator";

// CL-105 本地隔离切片：只有一个获准的合成档位，客户端不能指定解析器/上游参数。
export const localParseProfile = "local-synthetic-v1" as const;
export const localParsePageCount = 6;
export const localParseFixtures = ["success", "partial", "blank", "fail", "pending"] as const;
export type LocalParseFixture = (typeof localParseFixtures)[number];

export class CreateLocalParseJob {
  @IsUUID("4")
  documentId!: string;

  @IsUUID("4")
  versionId!: string;

  @IsInt()
  @Min(1)
  sourceRevision!: number;

  @IsIn([localParseProfile])
  profileId!: string;

  @IsIn(localParseFixtures)
  fixture!: LocalParseFixture;

  // `all` 与 `pages` 二选一；两者同给或都不给由服务层判为 422。
  @IsOptional()
  @IsBoolean()
  @Equals(true)
  all?: true;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(localParsePageCount)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(localParsePageCount, { each: true })
  pages?: number[];
}

const uuid = { type: "string" as const, format: "uuid" };
const pageResults = {
  oneOf: [
    { type: "null" as const },
    {
      type: "array" as const,
      minItems: 1,
      maxItems: localParsePageCount,
      items: {
        type: "object" as const,
        additionalProperties: false,
        required: ["pageIndex", "status"],
        properties: {
          pageIndex: { type: "integer" as const, minimum: 1, maximum: localParsePageCount },
          status: { enum: ["success", "blank", "failed", "missing"] },
        },
      },
    },
  ],
};

export const localParseRequestSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["documentId", "versionId", "sourceRevision", "profileId", "fixture"],
  properties: {
    documentId: uuid,
    versionId: uuid,
    sourceRevision: { type: "integer" as const, minimum: 1 },
    profileId: { type: "string" as const, enum: [localParseProfile] },
    fixture: { type: "string" as const, enum: [...localParseFixtures] },
    all: { type: "boolean" as const, enum: [true] },
    pages: {
      type: "array" as const,
      minItems: 1,
      maxItems: localParsePageCount,
      uniqueItems: true,
      items: { type: "integer" as const, minimum: 1, maximum: localParsePageCount },
    },
  },
};

export const localParseJobSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: [
    "id",
    "kind",
    "status",
    "snapshotId",
    "traceId",
    "documentId",
    "versionId",
    "sourceRevision",
    "profileId",
    "fixture",
    "requestedPages",
    "pageResults",
    "revision",
    "epoch",
    "terminationState",
    "failureCode",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    id: uuid,
    kind: { enum: ["local_parse"] },
    status: {
      enum: [
        "QUEUED",
        "RUNNING",
        "WAITING_REVIEW",
        "PARTIAL_READY",
        "SUCCEEDED",
        "FAILED",
        "CANCELLED",
      ],
    },
    snapshotId: uuid,
    traceId: { type: "string" as const, pattern: "^[0-9a-f]{32}$" },
    documentId: uuid,
    versionId: uuid,
    sourceRevision: { type: "integer" as const, minimum: 1 },
    profileId: { type: "string" as const, enum: [localParseProfile] },
    fixture: { type: "string" as const, enum: [...localParseFixtures] },
    requestedPages: {
      type: "array" as const,
      minItems: 1,
      maxItems: localParsePageCount,
      uniqueItems: true,
      items: { type: "integer" as const, minimum: 1, maximum: localParsePageCount },
    },
    pageResults,
    revision: { type: "integer" as const, minimum: 1 },
    epoch: { type: "integer" as const, minimum: 1 },
    terminationState: {
      type: "string" as const,
      enum: ["not_requested", "requested", "confirmed"],
    },
    failureCode: { enum: [null, "PERMANENT_ERROR"] },
    createdAt: { type: "string" as const, format: "date-time" },
    updatedAt: { type: "string" as const, format: "date-time" },
  },
};

export const localParseErrorSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["statusCode", "message", "error"],
  properties: {
    statusCode: { type: "integer" as const },
    message: {
      oneOf: [
        { type: "string" as const },
        { type: "array" as const, items: { type: "string" as const } },
      ],
    },
    error: { type: "string" as const },
  },
};
