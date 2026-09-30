import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";

export interface HealthResponse {
  service: "canlearn-api";
  status: "ok";
}

@ApiTags("health")
@Controller({ path: "health", version: "1" })
export class HealthController {
  @Get()
  @ApiOkResponse({
    schema: {
      example: { service: "canlearn-api", status: "ok" },
      properties: { service: { type: "string" }, status: { type: "string" } },
    },
  })
  getHealth(): HealthResponse {
    return { service: "canlearn-api", status: "ok" };
  }
}
