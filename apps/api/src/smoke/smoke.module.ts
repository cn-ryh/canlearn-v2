import { Module } from "@nestjs/common";
import { SmokeController, SmokeInternalController } from "./smoke.controller.js";
import { SmokeService } from "./smoke.service.js";

@Module({ controllers: [SmokeController, SmokeInternalController], providers: [SmokeService] })
export class SmokeModule {}
