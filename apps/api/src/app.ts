import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory, Reflector } from '@nestjs/core';
import { AuthController } from './auth/auth-controller';
import { AuthService, type AuthOptions } from './auth/auth-service';
import { AuthGuard, Public, RolesGuard } from './auth/auth-guard';
import { SafeExceptionFilter } from './auth/safe-exception-filter';
import {
  ApiOkResponse,
  ApiProperty,
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';

class HealthDto {
  @ApiProperty({ type: String, enum: ['ok'], example: 'ok' })
  status = 'ok' as const;
}

@Controller()
class HealthController {
  @Get('health')
  @Public()
  @ApiOkResponse({ type: HealthDto, description: 'API process is running.' })
  health(): HealthDto {
    return { status: 'ok' };
  }
}

export async function createApi(options: AuthOptions = {}) {
  const auth = new AuthService(options);
  @Module({
    controllers: [HealthController, AuthController],
    providers: [
      { provide: AuthService, useValue: auth },
      {
        provide: APP_GUARD,
        useFactory: (service: AuthService, reflector: Reflector) =>
          new AuthGuard(service, reflector),
        inject: [AuthService, Reflector],
      },
      {
        provide: APP_GUARD,
        useFactory: (reflector: Reflector) => new RolesGuard(reflector),
        inject: [Reflector],
      },
    ],
  })
  class AppModule {}
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new SafeExceptionFilter());
  app.enableCors({
    origin: auth.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Device-Id',
      'X-Auction-Client',
    ],
  });
  app.enableShutdownHooks();
  const config = new DocumentBuilder()
    .setTitle('Auction NG API')
    .setVersion('0.0.0')
    .addBearerAuth()
    .build();
  if (auth.local || process.env.NODE_ENV !== 'production')
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  return app;
}
