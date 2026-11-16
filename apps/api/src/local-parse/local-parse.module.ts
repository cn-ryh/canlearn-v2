import { Module } from "@nestjs/common";
import { LocalParseController, LocalParseInternalController } from "./local-parse.controller.js";
import { LocalParseService } from "./local-parse.service.js";

@Module({
  controllers: [LocalParseController, LocalParseInternalController],
  providers: [LocalParseService],
})
export class LocalParseModule {}
