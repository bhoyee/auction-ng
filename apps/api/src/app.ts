import 'reflect-metadata';
import {
  BuyerController,
  PublicBidHistoryController,
} from './buyers/buyer-controller';
import { BuyerService } from './buyers/buyer-service';
import { Controller, Get, Module, Header } from '@nestjs/common';
import { APP_GUARD, NestFactory, Reflector } from '@nestjs/core';
import { AuthController } from './auth/auth-controller';
import { AuthService, type AuthOptions } from './auth/auth-service';
import { AuthGuard, Public, RolesGuard } from './auth/auth-guard';
import { SafeExceptionFilter } from './auth/safe-exception-filter';
import { LedgerService } from './ledger/ledger-service';
import { WalletController } from './ledger/wallet-controller';
import { PaymentController } from './payments/payment-controller';
import { PaymentService } from './payments/payment-service';
import { PurchaseService } from './purchases/purchase-service';
import { PurchaseController } from './purchases/purchase-controller';
import { PaystackProvider } from './payments/paystack-provider';
import type { PaymentProvider } from './payments/payment-provider';
import { CatalogueService } from './catalogue/catalogue-service';
import {
  CatalogueController,
  CatalogueAdminController,
} from './catalogue/catalogue-controller';
import { configuredImageStore, type ImageStore } from './catalogue/image-store';
import {
  configuredSearchEngine,
  type SearchEngine,
} from './search/meilisearch-engine';
import { SearchService } from './search/search-service';
import { SearchController } from './search/search-controller';
import { BidService } from './bids/bid-service';
import { BidController } from './bids/bid-controller';
import { ClosingService } from './closing/closing-service';
import { ClosingController } from './closing/closing-controller';
import { NotificationService } from './closing/notification-service';
import { PickupPassController } from './closing/pickup-pass-controller';
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
  @Get('time')
  @Public()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['serverTime'],
      properties: { serverTime: { type: 'string', format: 'date-time' } },
    },
  })
  time() {
    return { serverTime: new Date().toISOString() };
  }
  @Get('health')
  @Public()
  @ApiOkResponse({ type: HealthDto, description: 'API process is running.' })
  health(): HealthDto {
    return { status: 'ok' };
  }
}

export async function createApi(
  options: AuthOptions & {
    paymentProvider?: PaymentProvider;
    imageStore?: ImageStore;
    searchEngine?: SearchEngine;
    bidOptions?: ConstructorParameters<typeof BidService>[1];
  } = {},
) {
  const auth = new AuthService(options);
  const ledger = new LedgerService(
    options.databaseUrl ?? process.env.DATABASE_URL,
  );
  const catalogue = new CatalogueService(
    options.databaseUrl,
    options.imageStore ?? configuredImageStore(),
  );
  const bids = new BidService(ledger, {
    prefix: process.env.BID_NAMESPACE || undefined,
    ...options.bidOptions,
  });
  catalogue.readDealStates = (ids) => bids.publicBrowseStates(ids);
  if (
    process.env.BIDS_ENABLED === 'true' &&
    (!process.env.BID_MAINTENANCE_TOKEN ||
      process.env.BID_MAINTENANCE_TOKEN.length < 32)
  )
    throw new Error('Bid maintenance token is required when enabling bids.');
  try {
    await bids.start();
  } catch {
    // Keep ledger/account reads available while the bid engine fails closed.
    console.warn(
      'Bidding is paused pending Redis configuration or recovery review.',
    );
  }
  auth.beforeSessionRevocation = (ids) => bids.revokeSessions(ids);
  const search = new SearchService(
    catalogue,
    options.searchEngine ?? configuredSearchEngine(),
  );
  const provider =
    options.paymentProvider ??
    (process.env.PAYSTACK_SECRET_KEY
      ? new PaystackProvider(process.env.PAYSTACK_SECRET_KEY)
      : undefined);
  const payments = new PaymentService(ledger, provider);
  const purchases = new PurchaseService(ledger, bids, provider);
  payments.handlePurchasePayment = (transfer, reference) =>
    purchases.handlePayment(transfer, reference);
  const closing = new ClosingService(ledger, bids);
  closing.beforeRun = () => purchases.maintain();
  @Module({
    controllers: [
      HealthController,
      AuthController,
      WalletController,
      PaymentController,
      PurchaseController,
      CatalogueController,
      CatalogueAdminController,
      SearchController,
      BidController,
      ClosingController,
      PickupPassController,
      BuyerController,
      PublicBidHistoryController,
    ],
    providers: [
      {
        provide: BuyerService,
        useValue: new BuyerService(options.databaseUrl),
      },
      { provide: AuthService, useValue: auth },
      { provide: LedgerService, useValue: ledger },
      { provide: BidService, useValue: bids },
      { provide: ClosingService, useValue: closing },
      { provide: PurchaseService, useValue: purchases },
      {
        provide: NotificationService,
        useValue: new NotificationService(ledger),
      },
      { provide: CatalogueService, useValue: catalogue },
      { provide: SearchService, useValue: search },
      { provide: PaymentService, useValue: payments },
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
  const app = await NestFactory.create(AppModule, { rawBody: true });
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
