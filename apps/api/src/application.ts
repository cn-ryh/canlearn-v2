import helmet from "@fastify/helmet";
import { type NestApplicationOptions, ValidationPipe, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { createAppModule } from "./app.module.js";

export async function createApplication(
  options: NestApplicationOptions = { bufferLogs: true },
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    createAppModule(),
    new FastifyAdapter(),
    options,
  );
  await app.register(helmet);
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",") });
  app.enableVersioning({ defaultVersion: "1", type: VersioningType.URI });
  app.useGlobalPipes(
    new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
  );
  const config = new DocumentBuilder()
    .setTitle("CanLearn API")
    .setDescription("CanLearn RESTful business API; implemented endpoints only")
    .setVersion("1.0.0")
    .setOpenAPIVersion("3.1.0")
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));
  return app;
}
