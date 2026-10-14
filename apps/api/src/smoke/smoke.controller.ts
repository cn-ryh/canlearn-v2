import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import {
  ApiBody,
  ApiExcludeController,
  ApiExtension,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ClaimFailure, ClaimReceipt, CreateSmokeJob, FinishSmokeJob, JobRef } from "./smoke.dto.js";
import { SmokeGuard } from "./smoke.guard.js";
import { SmokeService } from "./smoke.service.js";

export const smokeRequestSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["mode", "delayMs"],
  properties: {
    mode: { type: "string" as const, enum: ["success", "partial", "blank", "fail"] },
    delayMs: { type: "integer" as const, minimum: 0, maximum: 15000 },
  },
};

export const smokeResponseSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: [
    "id",
    "kind",
    "status",
    "snapshotId",
    "traceId",
    "workflowId",
    "revision",
    "epoch",
    "terminationState",
    "failureCode",
    "result",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    id: { type: "string" as const, format: "uuid" },
    kind: { type: "string" as const, enum: ["synthetic_parse"] },
    status: {
      type: "string" as const,
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
    snapshotId: { type: "string" as const, format: "uuid" },
    traceId: { type: "string" as const, pattern: "^[0-9a-f]{32}$" },
    workflowId: { type: "string" as const, pattern: "^cl-job/[0-9a-f-]{36}$" },
    revision: { type: "integer" as const, minimum: 1 },
    epoch: { type: "integer" as const, minimum: 1 },
    terminationState: {
      type: "string" as const,
      enum: ["not_requested", "requested", "confirmed"],
    },
    failureCode: { enum: [null, "PERMANENT_ERROR"] },
    result: {
      oneOf: [
        { type: "null" as const },
        {
          type: "object" as const,
          additionalProperties: false,
          required: ["fixtureId", "pages"],
          properties: {
            fixtureId: { type: "string" as const, enum: ["cl013-original-v1"] },
            pages: {
              type: "array" as const,
              minItems: 3,
              maxItems: 3,
              items: {
                type: "object" as const,
                additionalProperties: false,
                required: ["pageIndex", "status"],
                properties: {
                  pageIndex: { type: "integer" as const, minimum: 1, maximum: 3 },
                  status: { enum: ["success", "blank", "failed", "missing"] },
                },
              },
            },
          },
        },
      ],
    },
    createdAt: { type: "string" as const, format: "date-time" },
    updatedAt: { type: "string" as const, format: "date-time" },
    delivery: {
      type: "array" as const,
      maxItems: 3,
      items: {
        type: "object" as const,
        additionalProperties: false,
        required: ["eventId", "state", "attempts", "lastErrorCode"],
        properties: {
          eventId: { type: "string" as const, format: "uuid" },
          state: { enum: ["pending", "claimed", "sent", "quarantined"] },
          attempts: { type: "integer" as const, minimum: 0 },
          lastErrorCode: { enum: [null, "SMOKE_DISPATCH_UNCONFIRMED"] },
        },
      },
    },
  },
};
export const smokeErrorSchema = {
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
const bodyPipe = (expectedType: new () => object) =>
  new ValidationPipe({
    expectedType,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
const uuid = new ParseUUIDPipe({ version: "4" });

@ApiTags("local-synthetic")
@ApiExtension("x-implementation-status", "implemented")
@ApiExtension("x-runtime-scope", "local-synthetic-only")
@UseGuards(SmokeGuard)
@Controller({ path: "smoke/jobs", version: "1" })
export class SmokeController {
  constructor(@Inject(SmokeService) private readonly service: SmokeService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ operationId: "createSmokeJob", summary: "创建本地合成 Job" })
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    schema: { type: "string", format: "uuid" },
  })
  @ApiHeader({ name: "X-Smoke-Client", required: true, schema: { type: "string", enum: ["1"] } })
  @ApiBody({ schema: smokeRequestSchema })
  @ApiResponse({ status: 202, schema: smokeResponseSchema })
  @ApiResponse({ status: 400, schema: smokeErrorSchema })
  @ApiResponse({ status: 403, schema: smokeErrorSchema })
  @ApiResponse({ status: 409, schema: smokeErrorSchema })
  @ApiResponse({ status: 503, schema: smokeErrorSchema })
  create(
    @Headers("idempotency-key") key: string,
    @Body(bodyPipe(CreateSmokeJob)) body: CreateSmokeJob,
  ) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key ?? ""))
      throw new BadRequestException("SMOKE_IDEMPOTENCY_KEY_REQUIRED");
    return this.service.create(key.toLowerCase(), body);
  }

  @Get(":id")
  @ApiParam({ name: "id", format: "uuid", type: String })
  @ApiOperation({ operationId: "getSmokeJob", summary: "查询本地合成 Job" })
  @ApiResponse({ status: 200, schema: smokeResponseSchema })
  @ApiResponse({ status: 400, schema: smokeErrorSchema })
  @ApiResponse({ status: 403, schema: smokeErrorSchema })
  @ApiResponse({ status: 404, schema: smokeErrorSchema })
  get(@Param("id", uuid) id: string) {
    return this.service.get(id);
  }

  @Post(":id/cancel")
  @ApiParam({ name: "id", format: "uuid", type: String })
  @HttpCode(200)
  @ApiOperation({ operationId: "cancelSmokeJob", summary: "取消本地合成 Job" })
  @ApiHeader({ name: "X-Smoke-Client", required: true, schema: { type: "string", enum: ["1"] } })
  @ApiResponse({ status: 200, schema: smokeResponseSchema })
  @ApiResponse({ status: 400, schema: smokeErrorSchema })
  @ApiResponse({ status: 403, schema: smokeErrorSchema })
  @ApiResponse({ status: 404, schema: smokeErrorSchema })
  cancel(@Param("id", uuid) id: string) {
    return this.service.cancel(id);
  }
}

// The internal transport is documented in the smoke handoff, excluded from public Swagger.
@ApiExcludeController()
@UseGuards(SmokeGuard)
@Controller({ path: "internal/smoke", version: "1" })
export class SmokeInternalController {
  constructor(@Inject(SmokeService) private readonly service: SmokeService) {}
  @Get("jobs/:id")
  get(@Param("id", uuid) id: string) {
    return this.service.internalGet(id);
  }
  @Post("jobs/:id/start")
  @HttpCode(200)
  start(@Param("id", uuid) id: string, @Body(bodyPipe(JobRef)) body: JobRef) {
    return this.service.start(id, body);
  }
  @Post("jobs/:id/finish")
  @HttpCode(200)
  finish(@Param("id", uuid) id: string, @Body(bodyPipe(FinishSmokeJob)) body: FinishSmokeJob) {
    return this.service.finish(id, body);
  }
  @Post("jobs/:id/stopped")
  @HttpCode(200)
  stopped(@Param("id", uuid) id: string) {
    return this.service.stopped(id);
  }
  @Post("outbox/claim")
  @HttpCode(200)
  claim() {
    return this.service.claim();
  }
  @Post("jobs/:id/abandon")
  @HttpCode(200)
  abandon(@Param("id", uuid) id: string, @Body(bodyPipe(JobRef)) body: JobRef) {
    return this.service.abandon(id, body);
  }
  @Post("outbox/:id/ack")
  @HttpCode(200)
  ack(@Param("id", uuid) id: string, @Body(bodyPipe(ClaimReceipt)) body: ClaimReceipt) {
    return this.service.ack(id, body);
  }
  @Post("outbox/:id/fail")
  @HttpCode(200)
  fail(@Param("id", uuid) id: string, @Body(bodyPipe(ClaimFailure)) body: ClaimFailure) {
    return this.service.fail(id, body.claimToken);
  }
  @Post("outbox/:id/replay")
  @HttpCode(200)
  replay(@Param("id", uuid) id: string) {
    return this.service.replay(id);
  }
}
