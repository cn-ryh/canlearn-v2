import { Controller, Get } from "@nestjs/common";
import { ApiExtension, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

export interface HealthResponse {
  service: "canlearn-api";
  status: "ok";
}

@ApiTags("health")
@Controller({ path: "health", version: "1" })
export class HealthController {
  @Get()
  @ApiOperation({ operationId: "getHealth", summary: "Check the API process", security: [] })
  @ApiExtension("x-implementation-status", "implemented")
  @ApiOkResponse({
    description: "The API process is healthy.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["service", "status"],
      properties: {
        service: { type: "string", enum: ["canlearn-api"] },
        status: { type: "string", enum: ["ok"] },
      },
    },
  })
  getHealth(): HealthResponse {
    return { service: "canlearn-api", status: "ok" };
  }
}
