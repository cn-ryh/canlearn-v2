import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health/health.controller.js";
import { SmokeModule } from "./smoke/smoke.module.js";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController],
})
export class AppModule {}

export function createAppModule(): DynamicModule {
  return {
    module: AppModule,
    imports: process.env.CANLEARN_SMOKE_ENABLED === "true" ? [SmokeModule] : [],
  };
}
