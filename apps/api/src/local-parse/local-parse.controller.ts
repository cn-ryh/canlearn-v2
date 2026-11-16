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
  Res,
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
import { SmokeGuard } from "../smoke/smoke.guard.js";
import { resolvePageScope } from "./local-parse.domain.js";
import {
  CreateLocalParseJob,
  localParseErrorSchema,
  localParseJobSchema,
  localParseRequestSchema,
} from "./local-parse.dto.js";
import { LocalParseReceipt } from "./local-parse.internal.dto.js";
import { LocalParseService } from "./local-parse.service.js";

// 只使用结构化的最小响应接口，避免为本地切片引入额外的 Fastify 类型依赖。
type ReplyLike = { header(name: string, value: string): void };

const bodyPipe = (expectedType: new () => object) =>
  new ValidationPipe({
    expectedType,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
const uuid = new ParseUUIDPipe({ version: "4" });
const idempotencyKey = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const scopeHeaders = {
  "Cache-Control": {
    description: "私有业务响应不可缓存",
    schema: { type: "string", enum: ["no-store"] },
  },
  ETag: {
    description: "当前 Job 视图的强实体标签",
    schema: { type: "string", pattern: '^"[0-9a-f]{64}"$' },
  },
};
const createHeaders = {
  Location: {
    description: "本地 Job 查询地址",
    schema: { type: "string", pattern: "^/v1/local/jobs/[0-9a-f-]{36}$" },
  },
  "Idempotency-Replayed": {
    description: "同键同载荷重放时出现",
    schema: { type: "string", enum: ["true"] },
  },
  ETag: scopeHeaders.ETag,
};

// 本地隔离运行面：默认不装配，仅回环 + 显式客户端头可用。
@ApiTags("local-parse")
@ApiExtension("x-implementation-status", "implemented")
@ApiExtension("x-runtime-scope", "local-isolated-only")
@UseGuards(SmokeGuard)
@Controller({ path: "local", version: "1" })
export class LocalParseController {
  constructor(@Inject(LocalParseService) private readonly service: LocalParseService) {}

  @Post("parse-jobs")
  @HttpCode(202)
  @ApiOperation({ operationId: "createLocalParseJob", summary: "创建本地隔离解析 Job" })
  @ApiHeader({
    name: "idempotency-key",
    required: true,
    schema: { type: "string", format: "uuid" },
  })
  @ApiHeader({ name: "X-Smoke-Client", required: true, schema: { type: "string", enum: ["1"] } })
  @ApiBody({ schema: localParseRequestSchema })
  @ApiResponse({ status: 202, schema: localParseJobSchema, headers: createHeaders })
  @ApiResponse({ status: 400, schema: localParseErrorSchema })
  @ApiResponse({ status: 403, schema: localParseErrorSchema })
  @ApiResponse({ status: 409, schema: localParseErrorSchema })
  @ApiResponse({ status: 422, schema: localParseErrorSchema })
  @ApiResponse({ status: 503, schema: localParseErrorSchema })
  async create(
    @Headers("idempotency-key") key: string,
    @Body(bodyPipe(CreateLocalParseJob)) body: CreateLocalParseJob,
    @Res({ passthrough: true }) reply: ReplyLike,
  ) {
    if (!idempotencyKey.test(key ?? ""))
      throw new BadRequestException("LOCAL_PARSE_IDEMPOTENCY_KEY_REQUIRED");
    // 页范围语义在控制器判定，使 422 与结构 400 明确分开。
    resolvePageScope(body);
    const result = await this.service.create(key.toLowerCase(), body);
    reply.header("ETag", result.etag);
    reply.header("Location", `/v1/local/jobs/${result.view.id}`);
    if (result.replayed) reply.header("Idempotency-Replayed", "true");
    return result.view;
  }

  @Get("jobs/:jobId")
  @ApiParam({ name: "jobId", format: "uuid", type: String })
  @ApiOperation({ operationId: "getLocalParseJob", summary: "查询本地隔离解析 Job" })
  @ApiResponse({ status: 200, schema: localParseJobSchema, headers: scopeHeaders })
  @ApiResponse({ status: 400, schema: localParseErrorSchema })
  @ApiResponse({ status: 403, schema: localParseErrorSchema })
  @ApiResponse({ status: 404, schema: localParseErrorSchema })
  async get(@Param("jobId", uuid) jobId: string, @Res({ passthrough: true }) reply: ReplyLike) {
    const result = await this.service.get(jobId);
    reply.header("Cache-Control", "no-store");
    reply.header("ETag", result.etag);
    return result.view;
  }

  @Post("jobs/:jobId/cancel")
  @HttpCode(200)
  @ApiParam({ name: "jobId", format: "uuid", type: String })
  @ApiOperation({ operationId: "cancelLocalParseJob", summary: "取消本地隔离解析 Job" })
  @ApiHeader({ name: "X-Smoke-Client", required: true, schema: { type: "string", enum: ["1"] } })
  @ApiResponse({ status: 200, schema: localParseJobSchema, headers: scopeHeaders })
  @ApiResponse({ status: 400, schema: localParseErrorSchema })
  @ApiResponse({ status: 403, schema: localParseErrorSchema })
  @ApiResponse({ status: 404, schema: localParseErrorSchema })
  async cancel(@Param("jobId", uuid) jobId: string, @Res({ passthrough: true }) reply: ReplyLike) {
    const result = await this.service.cancel(jobId);
    reply.header("Cache-Control", "no-store");
    reply.header("ETag", result.etag);
    return result.view;
  }
}

// 内部晚到回执 transport，文档在 docs/api/CL-105；不进入公开 Swagger。
@ApiExcludeController()
@UseGuards(SmokeGuard)
@Controller({ path: "internal/local-parse", version: "1" })
export class LocalParseInternalController {
  constructor(@Inject(LocalParseService) private readonly service: LocalParseService) {}

  @Post("jobs/:jobId/admit")
  @HttpCode(200)
  async admit(
    @Param("jobId", uuid) jobId: string,
    @Body(bodyPipe(LocalParseReceipt)) body: LocalParseReceipt,
  ) {
    return (await this.service.admit(jobId, body)).view;
  }
}
