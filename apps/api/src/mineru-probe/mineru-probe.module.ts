import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { SmokeGuard } from "../smoke/smoke.guard.js";
import {
  CheckpointProbe,
  CreateProbe,
  FinishProbe,
  ProbeRef,
  StopProbe,
} from "./mineru-probe.dto.js";
import { MineruProbeService } from "./mineru-probe.service.js";

const uuid = new ParseUUIDPipe({ version: "4" });
const pipe = (expectedType: new () => object) =>
  new ValidationPipe({
    expectedType,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
@ApiExcludeController()
@UseGuards(SmokeGuard)
@Controller({ path: "internal/mineru-probe/jobs", version: "1" })
class MineruProbeController {
  constructor(@Inject(MineruProbeService) private readonly service: MineruProbeService) {}
  @Post() @HttpCode(202) create(@Body(pipe(CreateProbe)) body: CreateProbe) {
    return this.service.create(body);
  }
  @Get(":id") get(@Param("id", uuid) id: string) {
    return this.service.get(id);
  }
  @Post(":id/start") @HttpCode(200) start(
    @Param("id", uuid) id: string,
    @Body(pipe(ProbeRef)) body: ProbeRef,
  ) {
    return this.service.start(id, body);
  }
  @Post(":id/checkpoint") @HttpCode(200) checkpoint(
    @Param("id", uuid) id: string,
    @Body(pipe(CheckpointProbe)) body: CheckpointProbe,
  ) {
    return this.service.checkpoint(id, body);
  }
  @Post(":id/finish") @HttpCode(200) finish(
    @Param("id", uuid) id: string,
    @Body(pipe(FinishProbe)) body: FinishProbe,
  ) {
    return this.service.finish(id, body);
  }
  @Post(":id/cancel") @HttpCode(200) cancel(@Param("id", uuid) id: string) {
    return this.service.cancel(id);
  }
  @Post(":id/stopped") @HttpCode(200) stopped(
    @Param("id", uuid) id: string,
    @Body(pipe(StopProbe)) body: StopProbe,
  ) {
    return this.service.stopped(id, body);
  }
  @Post(":id/resume") @HttpCode(200) resume(@Param("id", uuid) id: string) {
    return this.service.resume(id);
  }
}
@Module({ controllers: [MineruProbeController], providers: [MineruProbeService] })
export class MineruProbeModule {}
