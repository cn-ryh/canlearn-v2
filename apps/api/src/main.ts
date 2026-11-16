import { createApplication } from "./application.js";

async function bootstrap() {
  const app = await createApplication();

  const port = Number(process.env.API_PORT ?? 3001);
  // 本地隔离运行面（合成 Job 或本地解析切片）一律只监听回环。
  const localOnly =
    process.env.CANLEARN_SMOKE_ENABLED === "true" ||
    process.env.CANLEARN_LOCAL_PARSE_ENABLED === "true";
  await app.listen(port, localOnly ? "127.0.0.1" : "0.0.0.0");
}

void bootstrap();
