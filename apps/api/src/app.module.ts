import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health/health.controller.js";
import { LocalParseModule } from "./local-parse/local-parse.module.js";
import { MineruProbeModule } from "./mineru-probe/mineru-probe.module.js";
import { SmokeModule } from "./smoke/smoke.module.js";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController],
})
export class AppModule {}

// 本地隔离模块只在显式开关下装配；默认运行面只保留健康接口。
export function createAppModule(): DynamicModule {
  const smoke = process.env.CANLEARN_SMOKE_ENABLED === "true";
  return {
    module: AppModule,
    imports: [
      ...(smoke
        ? [
            SmokeModule,
            ...(process.env.CANLEARN_MINERU_PROBE_ENABLED === "true" ? [MineruProbeModule] : []),
          ]
        : []),
      ...(process.env.CANLEARN_LOCAL_PARSE_ENABLED === "true" ? [LocalParseModule] : []),
    ],
  };
}
