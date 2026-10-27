import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  catalogueDetailSchema,
  catalogueLotSchema,
  catalogueImageSchema,
  draftLotSchema,
  imageRules,
  catalogueRules,
  pastAuctionPageSchema,
  type CatalogueList,
  type CreateLotInput,
  type EditLotInput,
  type ImageUploadInput,
} from '@auction-ng/shared';
import { createDatabase } from '../database/client';
import type { Prisma } from '../generated/prisma/client';
import { encryptPii } from '../security/pii';
import { generateImages } from './image-processing';
import type { ImageStore } from './image-store';

const include = {
  _count: { select: { bids: true } },
  category: true,
  location: true,
  images: {
    where: { thumbnailUrl: { not: null } },
    orderBy: { sortOrder: 'asc' as const },
    take: imageRules.maxImages,
  },
} satisfies Prisma.LotInclude;
type Lot = Prisma.LotGetPayload<{ include: typeof include }>;
type Tx = Prisma.TransactionClient;
const anchorSchema = z
  .object({
    id: z.uuid(),
    value: z.string().max(100),
    filter: z.string().max(1000),
  })
  .strict();
const encode = (id: string, value: string, filter: string) =>
  Buffer.from(JSON.stringify({ id, value, filter })).toString('base64url');
function decode(cursor: string | undefined, filter: string) {
  if (!cursor) return undefined;
  try {
    const parsed = anchorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString()),
    );
    if (parsed.filter !== filter) throw new Error();
    return parsed;
  } catch {
    throw new BadRequestException('Use the next cursor with the same filters.');
  }
}
function image(row: Lot['images'][number]) {
  return catalogueImageSchema.parse({
    id: row.id,
    url: row.url,
    thumbnailUrl: row.thumbnailUrl,
    sortOrder: row.sortOrder,
    width: row.width,
    height: row.height,
    thumbnailBytes: row.thumbnailBytes,
  });
}
function dto(lot: Lot) {
  return catalogueLotSchema.parse({
    id: lot.id,
    lotNumber: lot.lotNumber,
    title: lot.title,
    bidCount: lot._count.bids,
    condition: lot.condition,
    status: lot.status,
    categoryId: lot.categoryId,
    locationId: lot.locationId,
    startPriceKobo: Number(lot.startPriceKobo),
    retailPriceKobo: Number(lot.retailPriceKobo),
    currentPriceKobo: null,
    priceSource: 'unavailable',
    createdAt: lot.createdAt.toISOString(),
    startsAt: lot.startAt.toISOString(),
    endsAt: lot.endAt.toISOString(),
    category: {
      id: lot.category.id,
      name: lot.category.name,
      slug: lot.category.slug,
      parentId: lot.category.parentId,
    },
    location: {
      id: lot.location.id,
      name: lot.location.name,
      code: lot.location.code,
    },
    thumbnail: lot.images[0] ? image(lot.images[0]) : null,
    secondaryThumbnailUrl: lot.images[1]?.thumbnailUrl ?? null,
  });
}
function draft(lot: Prisma.LotGetPayload<object>) {
  return draftLotSchema.parse({
    id: lot.id,
    lotNumber: lot.lotNumber,
    title: lot.title,
    description: lot.description,
    condition: lot.condition,
    retailPriceKobo: Number(lot.retailPriceKobo),
    startPriceKobo: Number(lot.startPriceKobo),
    categoryId: lot.categoryId,
    locationId: lot.locationId,
    startsAt: lot.startAt.toISOString(),
    endsAt: lot.endAt.toISOString(),
    status: lot.status,
    updatedAt: lot.updatedAt.toISOString(),
  });
}
function fields(input: Partial<CreateLotInput>) {
  const { startsAt, endsAt, ...rest } = input;
  return {
    ...rest,
    ...(startsAt ? { startAt: new Date(startsAt) } : {}),
    ...(endsAt ? { endAt: new Date(endsAt) } : {}),
  };
}
async function audit(
  tx: Tx,
  actorId: string,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  await tx.auditLog.create({
    data: {
      actorId,
      action,
      entityType: 'lot',
      entityId,
      beforeCiphertext:
        before === null ? null : encryptPii(JSON.stringify(before), 'audit'),
      afterCiphertext: encryptPii(JSON.stringify(after), 'audit'),
    },
  });
}
export class CatalogueService {
  readonly db: ReturnType<typeof createDatabase>;
  private processing = 0;
  constructor(
    databaseUrl?: string,
    private readonly store?: ImageStore,
    onQuery?: (query: string) => void,
  ) {
    this.db = createDatabase(databaseUrl ?? process.env.DATABASE_URL, onQuery);
  }
  async onModuleDestroy() {
    await this.db.$disconnect();
  }
  async pastAuctions(input: { limit: number; cursor?: string }) {
    const filter = 'paid-past-auctions-v1';
    const cursor = decode(input.cursor, filter);
    if (cursor && !z.iso.datetime().safeParse(cursor.value).success)
      throw new BadRequestException('Invalid past auctions cursor.');
    const now = new Date();
    const rows = await this.db.lot.findMany({
      where: {
        status: 'closed',
        endAt: { lte: now },
        invoiceLines: { some: { invoice: { status: 'paid' } } },
        ...(cursor
          ? {
              OR: [
                { endAt: { lt: new Date(cursor.value) } },
                { endAt: new Date(cursor.value), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ endAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      include: {
        ...include,
        invoiceLines: {
          where: { invoice: { status: 'paid' } },
          select: { hammerKobo: true },
          take: 1,
        },
      },
    });
    const items = rows.slice(0, input.limit);
    const last = items.at(-1);
    return pastAuctionPageSchema.parse({
      items: items.map((lot) => ({
        ...dto(lot),
        finalPriceKobo: Number(lot.invoiceLines[0]?.hammerKobo),
      })),
      nextCursor:
        rows.length > input.limit && last
          ? encode(last.id, last.endAt.toISOString(), filter)
          : null,
      serverTime: now.toISOString(),
    });
  }
  async list(input: CatalogueList) {
    const now = new Date();
    const filter = JSON.stringify([
      input.categoryId ?? null,
      input.locationId ?? null,
      input.endingSoon ?? false,
      input.minPriceKobo ?? null,
      input.maxPriceKobo ?? null,
    ]);
    const cursor = decode(input.cursor, filter);
    if (cursor && !z.iso.datetime().safeParse(cursor.value).success)
      throw new BadRequestException('Invalid catalogue cursor.');
    const rows = await this.db.lot.findMany({
      where: {
        status: {
          in: input.endingSoon
            ? [...catalogueRules.endingSoonStatuses]
            : [...catalogueRules.browseStatuses],
        },
        categoryId: input.categoryId,
        locationId: input.locationId,
        startPriceKobo: { gte: input.minPriceKobo, lte: input.maxPriceKobo },
        ...(input.endingSoon
          ? {
              endAt: {
                gt: now,
                lte: new Date(now.getTime() + imageRules.endingSoonMs),
              },
            }
          : { endAt: { gt: now } }),
        ...(cursor
          ? {
              OR: [
                { endAt: { gt: new Date(cursor.value) } },
                { endAt: new Date(cursor.value), id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ endAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
      include,
    });
    const items = rows.slice(0, input.limit);
    const last = items.at(-1);
    return {
      items: items.map(dto),
      nextCursor:
        rows.length > input.limit && last
          ? encode(last.id, last.endAt.toISOString(), filter)
          : null,
      serverTime: now.toISOString(),
    };
  }
  async detail(id: string) {
    const lot = await this.db.lot.findFirst({
      where: { id, status: { in: [...catalogueRules.publicStatuses] } },
      include,
    });
    if (!lot) throw new NotFoundException('This lot is not available.');
    return catalogueDetailSchema.parse({
      ...dto(lot),
      description: lot.description,
      images: lot.images.map(image),
    });
  }
  async searchMatches(ids: string[], input: CatalogueList, now: Date) {
    if (!ids.length) return [];
    const rows = await this.db.lot.findMany({
      where: {
        id: { in: ids },
        status: { in: [...catalogueRules.endingSoonStatuses] },
        categoryId: input.categoryId,
        locationId: input.locationId,
        startPriceKobo: { gte: input.minPriceKobo, lte: input.maxPriceKobo },
        endAt: {
          gt: now,
          ...(input.endingSoon
            ? { lte: new Date(now.getTime() + imageRules.endingSoonMs) }
            : {}),
        },
      },
      include,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [dto(row)] : [];
    });
  }
  async categories(input: { limit: number; cursor?: string }) {
    const cursor = decode(input.cursor, 'categories');
    const rows = await this.db.category.findMany({
      where: cursor
        ? {
            OR: [
              { slug: { gt: cursor.value } },
              { slug: cursor.value, id: { gt: cursor.id } },
            ],
          }
        : {},
      orderBy: [{ slug: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        _count: {
          select: {
            lots: {
              where: {
                status: { in: [...catalogueRules.endingSoonStatuses] },
                endAt: { gt: new Date() },
              },
            },
          },
        },
      },
    });
    const items = rows.slice(0, input.limit).map(({ _count, ...category }) => ({
      ...category,
      activeLotCount: _count.lots,
    }));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > input.limit && last
          ? encode(last.id, last.slug, 'categories')
          : null,
    };
  }
  async locations(input: { limit: number; cursor?: string }) {
    const cursor = decode(input.cursor, 'locations');
    const rows = await this.db.location.findMany({
      where: cursor
        ? {
            OR: [
              { code: { gt: cursor.value } },
              { code: cursor.value, id: { gt: cursor.id } },
            ],
          }
        : {},
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
      select: { id: true, name: true, code: true },
    });
    const items = rows.slice(0, input.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > input.limit && last
          ? encode(last.id, last.code, 'locations')
          : null,
    };
  }
  private async staff(tx: Tx, actorId: string) {
    const user = await tx.user.findUnique({
      where: { id: actorId },
      select: { role: true, status: true },
    });
    if (
      !user ||
      user.status !== 'active' ||
      !catalogueRules.editorRoles.some((role) => role === user.role)
    )
      throw new ForbiddenException(
        'An active admin or intake account is required.',
      );
  }
  async getDraft(actorId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      await this.staff(tx, actorId);
      const lot = await tx.lot.findUnique({ where: { id } });
      if (!lot || lot.status !== 'draft')
        throw new NotFoundException('Draft lot not found.');
      const result = draft(lot);
      await audit(tx, actorId, 'lots.draft_viewed', id, null, { id });
      return result;
    });
  }
  private async lockDraft(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM lots WHERE id=${id}::uuid FOR UPDATE`;
    const lot = await tx.lot.findUnique({ where: { id } });
    if (!lot) throw new NotFoundException('Lot not found.');
    if (lot.status !== 'draft')
      throw new ConflictException('Only draft lots can be edited.');
    return lot;
  }
  private async references(tx: Tx, categoryId: string, locationId: string) {
    if (
      !(await tx.category.findUnique({ where: { id: categoryId } })) ||
      !(await tx.location.findUnique({ where: { id: locationId } }))
    )
      throw new BadRequestException(
        'Choose an existing category and pickup location.',
      );
  }
  async create(actorId: string, input: CreateLotInput) {
    return this.db.$transaction(async (tx) => {
      await this.staff(tx, actorId);
      await this.references(tx, input.categoryId, input.locationId);
      if (input.lotNumber) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.lotNumber},707))`;
        if (await tx.lot.findUnique({ where: { lotNumber: input.lotNumber } }))
          throw new ConflictException('This lot number is already used.');
      }
      const row = await tx.lot.create({
        data: {
          ...fields(input),
          lotNumber: input.lotNumber,
          title: input.title,
          description: input.description,
          condition: input.condition,
          retailPriceKobo: BigInt(input.retailPriceKobo),
          startPriceKobo: BigInt(input.startPriceKobo),
          categoryId: input.categoryId,
          locationId: input.locationId,
          startAt: new Date(input.startsAt),
          endAt: new Date(input.endsAt),
        },
      });
      const result = draft(row);
      await audit(tx, actorId, 'lots.created', row.id, null, result);
      return result;
    });
  }
  async edit(actorId: string, id: string, input: EditLotInput) {
    return this.db.$transaction(async (tx) => {
      await this.staff(tx, actorId);
      const before = await this.lockDraft(tx, id);
      if (before.updatedAt.toISOString() !== input.expectedUpdatedAt)
        throw new ConflictException(
          'This lot changed. Reload it before editing.',
        );
      const { expectedUpdatedAt: _, ...changes } = input;
      void _;
      await this.references(
        tx,
        changes.categoryId ?? before.categoryId,
        changes.locationId ?? before.locationId,
      );
      if (
        Date.parse(changes.endsAt ?? before.endAt.toISOString()) <=
        Date.parse(changes.startsAt ?? before.startAt.toISOString())
      )
        throw new BadRequestException('End must follow start.');
      const row = await tx.lot.update({
        where: { id },
        data: {
          ...fields(changes),
          updatedAt: new Date(
            Math.max(Date.now(), before.updatedAt.getTime() + 1),
          ),
        },
      });
      const result = draft(row);
      await audit(tx, actorId, 'lots.edited', id, draft(before), result);
      return result;
    });
  }
  async beginUpload(actorId: string, lotId: string, input: ImageUploadInput) {
    const store = this.store;
    if (!store)
      throw new ServiceUnavailableException('Image storage is not configured.');
    const upload = await this.db.$transaction(async (tx) => {
      await this.staff(tx, actorId);
      await this.lockDraft(tx, lotId);
      const requestKey = `${actorId}:${input.idempotencyKey}`;
      const prior = await tx.imageUpload.findUnique({ where: { requestKey } });
      if (prior) {
        if (
          prior.lotId !== lotId ||
          prior.sha256 !== input.sha256 ||
          prior.sizeBytes !== input.sizeBytes ||
          prior.contentType !== input.contentType ||
          prior.sortOrder !== input.sortOrder
        )
          throw new ConflictException('Use a new key for a different photo.');
        if (
          prior.status !== 'pending' ||
          prior.expiresAt.getTime() <= Date.now()
        )
          throw new ConflictException(
            'This upload finished or expired. Start a new upload.',
          );
        return prior;
      }
      const occupied = await tx.lotImage.findFirst({
        where: { lotId, sortOrder: input.sortOrder },
      });
      const pending = await tx.imageUpload.findFirst({
        where: {
          lotId,
          sortOrder: input.sortOrder,
          status: 'pending',
          expiresAt: { gt: new Date() },
        },
      });
      if (occupied || pending)
        throw new ConflictException('Choose an unused photo position.');
      const id = randomUUID();
      const objectKey = `incoming/${lotId}/${id}`;
      const row = await tx.imageUpload.create({
        data: {
          id,
          lotId,
          actorId,
          requestKey,
          objectKey,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          sha256: input.sha256,
          sortOrder: input.sortOrder,
          expiresAt: new Date(Date.now() + imageRules.uploadSeconds * 1000),
        },
      });
      await audit(tx, actorId, 'lots.image_upload_requested', lotId, null, {
        uploadId: id,
        sortOrder: input.sortOrder,
      });
      return row;
    });
    const remaining = Math.floor(
      (upload.expiresAt.getTime() - Date.now()) / 1000,
    );
    if (remaining < 1)
      throw new ConflictException('This upload expired. Start a new upload.');
    return {
      uploadId: upload.id,
      uploadUrl: await store.presign(
        upload.objectKey,
        upload.contentType,
        upload.sizeBytes,
        upload.sha256,
        remaining,
      ),
      expiresAt: upload.expiresAt.toISOString(),
      headers: {
        'Content-Type': upload.contentType,
        'x-amz-meta-sha256': upload.sha256,
      },
    };
  }
  async completeUpload(actorId: string, lotId: string, uploadId: string) {
    const store = this.store;
    if (!store)
      throw new ServiceUnavailableException('Image storage is not configured.');
    const upload = await this.db.$transaction(async (tx) => {
      await this.staff(tx, actorId);
      await this.lockDraft(tx, lotId);
      const row = await tx.imageUpload.findFirst({
        where: { id: uploadId, actorId, lotId },
      });
      if (!row) throw new NotFoundException('Upload not found.');
      return row;
    });
    if (upload.status === 'ready')
      return image(
        await this.db.lotImage.findUniqueOrThrow({ where: { id: uploadId } }),
      );
    if (upload.expiresAt.getTime() <= Date.now())
      throw new ConflictException('Upload expired. Start a new upload.');
    if (this.processing >= 2)
      throw new ServiceUnavailableException(
        'Photo processing is busy. Try again shortly.',
      );
    this.processing++;
    try {
      let bytes: Buffer;
      try {
        bytes = await store.read(upload.objectKey);
      } catch {
        throw new BadRequestException(
          'Upload the complete photo before confirming it.',
        );
      }
      if (
        bytes.length !== upload.sizeBytes ||
        createHash('sha256').update(bytes).digest('hex') !== upload.sha256
      )
        throw new BadRequestException(
          'The uploaded photo does not match the accepted file.',
        );
      const processed = await generateImages(bytes, upload.contentType);
      const prefix = `catalogue/${lotId}/${uploadId}`;
      const thumbnailUrl = await store.write(
        `${prefix}/320.webp`,
        processed.thumbnail,
      );
      const url = await store.write(`${prefix}/960.webp`, processed.display);
      return await this.db.$transaction(async (tx) => {
        await this.staff(tx, actorId);
        await this.lockDraft(tx, lotId);
        const current = await tx.imageUpload.findUniqueOrThrow({
          where: { id: uploadId },
        });
        if (current.status === 'ready')
          return image(
            await tx.lotImage.findUniqueOrThrow({ where: { id: uploadId } }),
          );
        if (
          await tx.lotImage.findFirst({
            where: { lotId, sortOrder: upload.sortOrder },
          })
        )
          throw new ConflictException('This photo position was filled.');
        const row = await tx.lotImage.create({
          data: {
            id: uploadId,
            lotId,
            sortOrder: upload.sortOrder,
            url,
            thumbnailUrl,
            width: processed.width,
            height: processed.height,
            thumbnailBytes: processed.thumbnail.length,
          },
        });
        await tx.imageUpload.update({
          where: { id: uploadId },
          data: { status: 'ready' },
        });
        const result = image(row);
        await audit(tx, actorId, 'lots.image_added', lotId, null, result);
        return result;
      });
    } finally {
      this.processing--;
    }
  }
}
