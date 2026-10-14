import { timingSafeEqual } from "node:crypto";
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

type SmokeRequest = {
  ip: string;
  url: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class SmokeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SmokeRequest>();
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.ip)) {
      throw new ForbiddenException("SMOKE_LOOPBACK_REQUIRED");
    }
    if (request.url.startsWith("/v1/internal/smoke/")) {
      const expected = process.env.CANLEARN_SMOKE_TOKEN ?? "";
      const provided = request.headers["x-smoke-token"];
      const supplied = Buffer.from(typeof provided === "string" ? provided : "");
      const wanted = Buffer.from(expected);
      if (
        typeof provided !== "string" ||
        expected.length < 32 ||
        supplied.length !== wanted.length ||
        !timingSafeEqual(supplied, wanted)
      ) {
        throw new ForbiddenException("SMOKE_SERVICE_AUTH_REQUIRED");
      }
    } else if (request.method !== "GET") {
      const origin = request.headers.origin;
      if (
        request.headers["x-smoke-client"] !== "1" ||
        (origin && origin !== process.env.CANLEARN_SMOKE_ORIGIN)
      ) {
        throw new ForbiddenException("SMOKE_CLIENT_REQUIRED");
      }
    }
    return true;
  }
}
