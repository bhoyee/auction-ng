import { requireStaffPermission } from '../auth/staff-access';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from 'redis';
import sharp from 'sharp';
import { z } from 'zod';
import {
  requestsSupportHuman,
  supportRules,
  supportFaqs,
  supportCreateSchema,
  supportStaffCreateSchema,
  supportMessageInputSchema,
  supportActionSchema,
  supportConversationSchema,
  supportMessageSchema,
  supportListInputSchema,
  bidCancellationRequestSchema,
  bidCancellationStateSchema,
  LIVE_BID_COMMITMENT_NOTICE,
  effectiveAuctionFeeRules,
  fromLedgerKobo,
  type SupportListInput,
  type SupportAction,
} from '@auction-ng/shared';
import { BID_STREAM_NAMESPACE } from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
import { AuthService, type AuthIdentity } from '../auth/auth-service';
import type { ImageStore } from '../catalogue/image-store';
import { encryptPii, decryptPii, hashPii } from '../security/pii';
import { bidRequestKey } from './bid-request-key';
type Tx = Prisma.TransactionClient;
const staff = (identity: AuthIdentity) =>
  identity.permissions
    ? identity.permissions.includes('support.manage')
    : ['admin', 'support'].includes(identity.user.role);
const text = (bytes: Uint8Array) =>
  decryptPii(Buffer.from(bytes), 'support-text');
const envelope = (value: string) => encryptPii(value, 'support-text');
const selected = {
  buyer: { select: { name: true } },
  assignee: { select: { name: true } },
} as const;
const anchorSchema = z
  .object({
    at: z.iso.datetime(),
    id: z.uuid(),
    n: z.number().int().nonnegative().optional(),
  })
  .strict();
function cursor(value: string | undefined, scope: string) {
  if (!value) return undefined;
  if (value.split('.').length !== 2) throw new BadRequestException();
  const [body, signature] = value.split('.');
  if (
    !body ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(hashPii(scope + ':' + body, 'support-cursor')),
    )
  )
    throw new BadRequestException('Use the page controls to load this list.');
  try {
    return anchorSchema.parse(
      JSON.parse(Buffer.from(body, 'base64url').toString()),
    );
  } catch {
    throw new BadRequestException();
  }
}
function next(at: Date, id: string, scope: string, n?: number) {
  const body = Buffer.from(
    JSON.stringify({
      at: at.toISOString(),
      id,
      ...(n === undefined ? {} : { n }),
    }),
  ).toString('base64url');
  return body + '.' + hashPii(scope + ':' + body, 'support-cursor');
}
export class SupportService {
  private redis: ReturnType<typeof createClient> | undefined;
  constructor(
    private readonly auth: AuthService,
    private readonly fileStore?: ImageStore,
  ) {}
  private get db() {
    return this.auth.db;
  }
  private databaseFiles() {
    if (this.auth.local || process.env.NODE_ENV === 'test') return true;
    try {
      return /^\/auction_ng_demo_[a-f0-9]{16}$/.test(
        new URL(process.env.DATABASE_URL ?? '').pathname,
      );
    } catch {
      return false;
    }
  }
  private role(identity: AuthIdentity) {
    if (identity.user.role !== 'buyer' && !staff(identity))
      throw new ForbiddenException();
  }
  private async identity(tx: Tx, identity: AuthIdentity) {
    this.role(identity);
    if (identity.user.role !== 'buyer')
      await requireStaffPermission(tx, identity.user.id, 'support.manage');
    await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: identity.user.id },
    });
    const session = await tx.authSession.findFirst({
      where: {
        id: identity.sessionId,
        userId: user.id,
        revokedAt: null,
        accessExpiresAt: { gt: new Date() },
        expiresAt: { gt: new Date() },
        authenticatorVersion: user.authenticatorVersion,
      },
    });
    if (
      !session ||
      user.status !== 'active' ||
      user.role !== identity.user.role ||
      (user.role === 'buyer' ? !session.buyerMfa : !session.staffMfa)
    )
      throw new UnauthorizedException();
  }
  private async conversation(
    tx: Tx,
    identity: AuthIdentity,
    id: string,
    lock = false,
  ) {
    this.role(identity);
    if (lock)
      await tx.$queryRaw`SELECT id FROM support_conversations WHERE id=${id}::uuid FOR UPDATE`;
    const row = await tx.supportConversation.findFirst({
      where: { id, ...(staff(identity) ? {} : { buyerId: identity.user.id }) },
      include: selected,
    });
    if (!row) throw new NotFoundException();
    return row;
  }
  private present(
    row: Awaited<ReturnType<SupportService['conversation']>>,
    identity: AuthIdentity,
  ) {
    return supportConversationSchema.parse({
      id: row.id,
      number: row.number,
      subject: text(row.subjectCiphertext),
      reference: text(row.referenceCiphertext),
      topic: row.topic,
      status: row.status,
      mode: row.mode,
      version: row.version,
      buyerName: row.buyer.name,
      assigneeName: row.assignee?.name ?? null,
      assignedToMe: row.assigneeId === identity.user.id,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  async get(identity: AuthIdentity, id: string) {
    return this.present(
      await this.conversation(this.db, identity, id),
      identity,
    );
  }
  private bidRequestKey(lotId: string) {
    return bidRequestKey(lotId);
  }
  async bidCancellation(identity: AuthIdentity, lotId: string) {
    if (identity.user.role !== 'buyer') throw new ForbiddenException();
    return this.db.$transaction(async (tx) => {
      await this.identity(tx, identity);
      const bid = await tx.bid.findFirst({
        where: { userId: identity.user.id, lotId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          maxKobo: true,
          acceptance: { select: { intent: { select: { bidRound: true } } } },
          isProxy: true,
          createdAt: true,
          lot: {
            select: {
              status: true,
              endAt: true,
              bidRound: true,
              auctionFeeVersion: true,
            },
          },
        },
      });
      const conversation = await tx.supportConversation.findUnique({
        where: {
          createdById_createKey: {
            createdById: identity.user.id,
            createKey: this.bidRequestKey(lotId),
          },
        },
        include: selected,
      });
      const blocked = await tx.bidCancellationApproval.findFirst({
        where: {
          lotId,
          buyerId: identity.user.id,
          status: { in: ['committed', 'completed'] },
        },
      });
      const current =
        bid &&
        (bid.acceptance?.intent.bidRound ?? 0) === bid.lot.bidRound &&
        !blocked;
      const policy = await tx.auctionFeePolicy.findUnique({
        where: { version: bid?.lot.auctionFeeVersion ?? 'auction-fees-v1' },
      });
      const feeBps = policy
        ? effectiveAuctionFeeRules({
            ...policy,
            lotFeeKobo: fromLedgerKobo(policy.lotFeeKobo),
          }).premiumBps
        : 0;
      const max = bid ? Number(bid.maxKobo) : 0;
      if (!Number.isSafeInteger(max)) throw new BadRequestException();
      return bidCancellationStateSchema.parse({
        commitment:
          current && bid
            ? {
                maxKobo: max,
                automatic: bid.isProxy,
                createdAt: bid.createdAt.toISOString(),
              }
            : null,
        canRequest:
          !!current &&
          !!bid &&
          bid.lot.status === 'open' &&
          bid.lot.endAt.getTime() > Date.now(),
        conversation: conversation
          ? this.present(conversation, identity)
          : null,
        feeBps,
        feeConsent: !!conversation?.bidCancellationFeeConsentAt,
        blocked: !!blocked,
      });
    });
  }
  async requestBidCancellation(
    identity: AuthIdentity,
    lotId: string,
    input: unknown,
  ) {
    const value = bidCancellationRequestSchema.parse(input);
    const state = await this.bidCancellation(identity, lotId);
    // One durable conversation per buyer/lot, including across refreshes and different devices.
    if (state.conversation) {
      await this.confirmCancellationFee(
        identity,
        state.conversation.id,
        state.feeBps,
      );
      return this.bidCancellation(identity, lotId);
    }
    if (!state.canRequest)
      throw new ConflictException(
        'Only an owned live bid can be sent for review.',
      );
    const lot = await this.db.lot.findUniqueOrThrow({
      where: { id: lotId },
      select: { lotNumber: true, title: true },
    });
    try {
      await this.create(identity, {
        subject: `Bid cancellation request · ${lot.lotNumber}`,
        topic: 'bidding',
        human: true,
        reference: lot.lotNumber,
        text: `Please review my bid cancellation request.\nItem: ${lot.title}\nAuction: /lots/${lotId}\nReason: ${value.reason}\n\n${LIVE_BID_COMMITMENT_NOTICE}\nI understand this request does not cancel my bid, release funds or pause the auction.`,
        idempotencyKey: this.bidRequestKey(lotId),
      });
    } catch (failure) {
      // Concurrent submissions with different reasons reuse the first committed conversation.
      if (
        !(failure instanceof ConflictException) ||
        !(await this.bidCancellation(identity, lotId)).conversation
      )
        throw failure;
    }
    const saved = await this.bidCancellation(identity, lotId);
    if (saved.conversation)
      await this.confirmCancellationFee(
        identity,
        saved.conversation.id,
        saved.feeBps,
      );
    return this.bidCancellation(identity, lotId);
  }
  private async confirmCancellationFee(
    identity: AuthIdentity,
    id: string,
    bps: number,
  ) {
    await this.db.$transaction(async (tx) => {
      await this.identity(tx, identity);
      const row = await this.conversation(tx, identity, id, true);
      if (row.bidCancellationFeeConsentAt) return;
      await tx.supportConversation.update({
        where: { id },
        data: {
          bidCancellationFeeConsentAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.record(
        tx,
        id,
        'system',
        `Buyer confirmed the fee terms: staff-completed live bid cancellation costs ${bps / 100}% of the public bid price at approval. Requesting review is free; pre-bid cancellation before launch is free. The bid and funds remain active until cancellation is completed.`,
      );
    });
  }
  async list(identity: AuthIdentity, input: SupportListInput) {
    this.role(identity);
    const parsed = supportListInputSchema.parse(input);
    const status = parsed.status,
      limit = parsed.limit,
      scope = `${identity.user.id}:${status}:support`;
    const at = cursor(input.cursor, scope);
    const rows = await this.db.supportConversation.findMany({
      where: {
        ...(staff(identity) ? {} : { buyerId: identity.user.id }),
        ...(status === 'all' ? {} : { status }),
        ...(at
          ? {
              OR: [
                { updatedAt: { lt: new Date(at.at) } },
                { updatedAt: new Date(at.at), id: { lt: at.id } },
              ],
            }
          : {}),
      },
      include: selected,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const last = rows.slice(0, limit).at(-1);
    return {
      items: rows.slice(0, limit).map((row) => this.present(row, identity)),
      nextCursor:
        rows.length > limit && last
          ? next(last.updatedAt, last.id, scope)
          : null,
    };
  }
  async messages(
    identity: AuthIdentity,
    id: string,
    limit: number,
    page?: string,
  ) {
    await this.conversation(this.db, identity, id);
    const scope = `${identity.user.id}:${id}:messages`,
      at = cursor(page, scope);
    if (at && at.n === undefined) throw new BadRequestException();
    const rows = await this.db.supportMessage.findMany({
      where: {
        conversationId: id,
        ...(staff(identity) ? {} : { internal: false }),
        ...(at ? { sequence: { lt: at.n } } : {}),
      },
      include: {
        author: { select: { name: true } },
        attachments: { select: { id: true, bytes: true } },
      },
      orderBy: { sequence: 'desc' },
      take: limit + 1,
    });
    const last = rows.slice(0, limit).at(-1);
    return {
      items: rows
        .slice(0, limit)
        .reverse()
        .map((row) =>
          supportMessageSchema.parse({
            id: row.id,
            author: row.kind,
            authorName:
              row.author?.name ??
              (row.kind === 'assistant' ? 'Support assistant' : 'LotVanta'),
            text: text(row.bodyCiphertext),
            internal: row.internal,
            createdAt: row.createdAt.toISOString(),
            attachments: row.attachments.map((file) => ({
              ...file,
              mime: 'image/webp',
            })),
          }),
        ),
      nextCursor:
        rows.length > limit && last
          ? next(last.createdAt, last.id, scope, last.sequence)
          : null,
    };
  }
  private async record(
    tx: Tx,
    id: string,
    kind: 'assistant' | 'system',
    body: string,
  ) {
    return tx.supportMessage.create({
      data: {
        sequence: await this.sequence(tx, id),
        conversationId: id,
        kind,
        bodyCiphertext: envelope(body),
        requestKey: randomUUID(),
        requestHash: hashPii(body, 'support-request'),
      },
    });
  }
  private async sequence(tx: Tx, id: string) {
    return (
      ((
        await tx.supportMessage.aggregate({
          where: { conversationId: id },
          _max: { sequence: true },
        })
      )._max.sequence ?? -1) + 1
    );
  }
  private async audit(
    tx: Tx,
    identity: AuthIdentity,
    id: string,
    action: string,
  ) {
    await tx.auditLog.create({
      data: {
        actorId: identity.user.id,
        action: `support.${action}`,
        entityType: 'support_conversation',
        entityId: id,
      },
    });
  }
  private hash(identity: AuthIdentity, value: unknown) {
    return hashPii(
      identity.user.id + ':' + JSON.stringify(value),
      'support-request',
    );
  }
  async create(identity: AuthIdentity, input: unknown) {
    const staffInput = staff(identity)
      ? supportStaffCreateSchema.parse(input)
      : null;
    const value = staffInput ?? supportCreateSchema.parse(input);
    const hash = this.hash(identity, value);
    const id = await this.db.$transaction(async (tx) => {
      await this.identity(tx, identity);
      const existing = await tx.supportConversation.findUnique({
        where: {
          createdById_createKey: {
            createdById: identity.user.id,
            createKey: value.idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.requestHash !== hash)
          throw new ConflictException(
            'This request key was used for different content.',
          );
        return existing.id;
      }
      const buyer = staffInput
        ? await tx.user.findUnique({
            where: { emailHash: hashPii(staffInput.buyerEmail, 'email') },
          })
        : await tx.user.findUnique({ where: { id: identity.user.id } });
      if (!buyer || buyer.role !== 'buyer' || buyer.status !== 'active')
        throw new BadRequestException('Use an active buyer account.');
      if (
        (await tx.supportConversation.count({
          where: {
            createdById: identity.user.id,
            createdAt: { gt: new Date(Date.now() - 86400000) },
          },
        })) >=
        (staff(identity)
          ? supportRules.dailyStaffConversations
          : supportRules.dailyBuyerConversations)
      )
        throw new BadRequestException(
          'Reply to an existing conversation or try again tomorrow.',
        );
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const number =
        'SUP-' +
        Array.from(
          { length: 8 },
          () => alphabet[randomInt(alphabet.length)],
        ).join('');
      const human =
        value.human || staff(identity) || requestsSupportHuman(value.text);
      const row = await tx.supportConversation.create({
        data: {
          number,
          buyerId: buyer.id,
          createdById: identity.user.id,
          createKey: value.idempotencyKey,
          requestHash: hash,
          subjectCiphertext: envelope(value.subject),
          referenceCiphertext: envelope(value.reference),
          topic: value.topic,
          mode: human ? 'human' : 'assistant',
        },
      });
      const first = await tx.supportMessage.create({
        data: {
          sequence: 0,
          conversationId: row.id,
          authorId: identity.user.id,
          kind: staff(identity) ? 'staff' : 'buyer',
          bodyCiphertext: envelope(value.text),
          requestKey: value.idempotencyKey,
          requestHash: hash,
        },
      });
      await this.record(
        tx,
        row.id,
        'assistant',
        human
          ? 'Your conversation has been sent to our team. You can leave this page and return to the same conversation; we will notify you when someone replies.'
          : 'I am LotVanta’s guided support assistant. Choose a help topic below, or select Talk to a person at any time. Never share passwords, verification codes, BVN, full card details or pickup passes.',
      );
      if (staff(identity))
        await this.notify(
          tx,
          row.id,
          first.id,
          'A support conversation was opened for you',
        );
      await this.audit(tx, identity, row.id, 'created');
      return row.id;
    });
    await this.signal(id, false);
    return this.get(identity, id);
  }
  private async encodeImages(
    images: z.infer<typeof supportMessageInputSchema>['images'],
  ) {
    const outputs: Buffer[] = [];
    for (const image of images) {
      const bytes = Buffer.from(image.data, 'base64');
      if (
        bytes.length > supportRules.maxImageBytes ||
        bytes.toString('base64') !== image.data
      )
        throw new BadRequestException('Use a smaller JPEG, PNG or WebP image.');
      try {
        const source = sharp(bytes, {
          limitInputPixels: 16000000,
          animated: false,
        });
        const metadata = await source.metadata();
        if (
          !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
          image.mime !== 'image/' + metadata.format ||
          (metadata.pages ?? 1) > 1
        )
          throw Error('Unsupported image');
        const output = await source
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 75 })
          .toBuffer();
        if (output.length > supportRules.maxStoredImageBytes)
          throw Error('Image too large');
        outputs.push(output);
      } catch {
        throw new BadRequestException(
          'This image could not be attached. Use a smaller, still JPEG, PNG or WebP.',
        );
      }
    }
    return outputs;
  }
  async send(identity: AuthIdentity, id: string, input: unknown) {
    const value = supportMessageInputSchema.parse(input);
    if (value.internal && !staff(identity)) throw new ForbiddenException();
    const initial = await this.conversation(this.db, identity, id);
    const images = await this.encodeImages(value.images),
      hash = this.hash(identity, value);
    const files: {
      bytes: number;
      contentCiphertext?: Buffer<ArrayBuffer>;
      objectKey?: string;
    }[] = [];
    if (images.length && !this.fileStore?.writePrivate && !this.databaseFiles())
      throw new BadRequestException(
        'Private attachments are unavailable. Send your message without images or contact support.',
      );
    const alreadySaved = await this.db.supportMessage.findUnique({
      where: {
        conversationId_requestKey: {
          conversationId: id,
          requestKey: value.idempotencyKey,
        },
      },
    });
    if (alreadySaved) {
      if (
        alreadySaved.requestHash !== hash ||
        alreadySaved.authorId !== identity.user.id
      )
        throw new ConflictException();
      return this.get(identity, id);
    }
    if (
      initial.status === 'resolved' ||
      (staff(identity) &&
        !value.internal &&
        initial.assigneeId !== identity.user.id)
    )
      throw new ConflictException();
    for (const bytes of images) {
      const encrypted = encryptPii(bytes.toString('base64'), 'support-file');
      files.push({ bytes: bytes.length, contentCiphertext: encrypted });
    }
    await this.db.$transaction(async (tx) => {
      await this.identity(tx, identity);
      const row = await this.conversation(tx, identity, id, true);
      const existing = await tx.supportMessage.findUnique({
        where: {
          conversationId_requestKey: {
            conversationId: id,
            requestKey: value.idempotencyKey,
          },
        },
      });
      if (existing) {
        if (
          existing.requestHash !== hash ||
          existing.authorId !== identity.user.id
        )
          throw new ConflictException();
        return;
      }
      if (row.status === 'resolved')
        throw new ConflictException(
          'Reopen this conversation before replying.',
        );
      if (
        staff(identity) &&
        !value.internal &&
        row.assigneeId !== identity.user.id
      )
        throw new ConflictException(
          'Take over this conversation before replying.',
        );
      if (
        (await tx.supportMessage.count({ where: { conversationId: id } })) >=
        supportRules.maxMessages
      )
        throw new ConflictException(
          'Start another conversation and include this reference.',
        );
      if (
        images.length &&
        (await tx.supportAttachment.count({
          where: { message: { conversationId: id } },
        })) +
          images.length >
          supportRules.maxConversationImages
      )
        throw new BadRequestException(
          'This conversation has reached its image limit.',
        );
      const message = await tx.supportMessage.create({
        data: {
          sequence: await this.sequence(tx, id),
          conversationId: id,
          authorId: identity.user.id,
          kind: staff(identity) ? 'staff' : 'buyer',
          internal: value.internal,
          bodyCiphertext: envelope(
            value.text ||
              supportFaqs.find((faq) => faq.id === value.faqId)?.title ||
              'Image attachment',
          ),
          requestKey: value.idempotencyKey,
          requestHash: hash,
        },
      });
      if (images.length)
        await tx.supportAttachment.createMany({
          data: files.map((file) => ({
            messageId: message.id,
            ...file,
          })),
        });
      if (!value.internal) {
        await tx.supportConversation.update({
          where: { id },
          data: { version: { increment: 1 }, updatedAt: new Date() },
        });
        if (
          !staff(identity) &&
          row.mode === 'assistant' &&
          requestsSupportHuman(value.text)
        ) {
          await tx.supportConversation.update({
            where: { id },
            data: { mode: 'human' },
          });
          await this.record(
            tx,
            id,
            'system',
            'Human support requested. Your messages are saved for the team. You can leave a message and return later; we will notify you when someone replies.',
          );
        } else if (!staff(identity) && row.mode === 'assistant')
          await this.record(
            tx,
            id,
            'assistant',
            supportFaqs.find((faq) => faq.id === value.faqId)?.answer ??
              'I can help with the approved topics below. For a specific payment, account or purchase problem, select Talk to a person so our team can investigate. Your messages will stay in this conversation.',
          );
        if (staff(identity))
          await this.notify(tx, id, message.id, 'Our support team replied');
      }
      if (staff(identity))
        await this.audit(
          tx,
          identity,
          id,
          value.internal ? 'internal_note' : 'replied',
        );
    });
    await this.signal(id, value.internal);
    return this.get(identity, id);
  }
  async action(identity: AuthIdentity, id: string, input: SupportAction) {
    const value = supportActionSchema.parse(input),
      hash = this.hash(identity, value);
    await this.db.$transaction(async (tx) => {
      await this.identity(tx, identity);
      const row = await this.conversation(tx, identity, id, true);
      const previous = await tx.supportMessage.findUnique({
        where: {
          conversationId_requestKey: {
            conversationId: id,
            requestKey: value.idempotencyKey,
          },
        },
      });
      if (previous) {
        if (previous.requestHash !== hash) throw new ConflictException();
        return;
      }
      if (row.version !== value.expectedVersion)
        throw new ConflictException(
          'This conversation changed. Refresh and try again.',
        );
      if (row.status === 'resolved' && value.action !== 'reopen')
        throw new ConflictException('Reopen this conversation first.');
      if (
        value.action !== 'resolve' &&
        (await tx.supportMessage.count({ where: { conversationId: id } })) >=
          supportRules.maxMessages
      )
        throw new ConflictException(
          'Start another conversation and include this reference.',
        );
      let data: Prisma.SupportConversationUpdateInput = {},
        body = '';
      switch (value.action) {
        case 'handoff':
          if (row.status === 'resolved') throw new ConflictException();
          data = { mode: 'human' };
          body =
            'Human support requested. Your messages are saved for the team; if nobody is available, leave a message and return later.';
          break;
        case 'claim':
          if (!staff(identity)) throw new ForbiddenException();
          if (row.assigneeId && row.assigneeId !== identity.user.id)
            throw new ConflictException(
              'Another agent is handling this conversation.',
            );
          if (row.status === 'resolved') throw new ConflictException();
          data = {
            mode: 'human',
            status: 'in_progress',
            assignee: { connect: { id: identity.user.id } },
          };
          body = `${identity.user.name} has joined the conversation.`;
          break;
        case 'release':
          if (
            !staff(identity) ||
            (row.assigneeId !== identity.user.id &&
              identity.user.role !== 'admin')
          )
            throw new ForbiddenException();
          data = {
            status: 'open',
            mode: 'human',
            assignee: { disconnect: true },
          };
          body = 'This conversation is waiting for the support team.';
          break;
        case 'resolve':
          if (
            staff(identity) &&
            row.assigneeId !== identity.user.id &&
            identity.user.role !== 'admin'
          )
            throw new ForbiddenException();
          data = { status: 'resolved' };
          body =
            'This conversation has been marked resolved. You can reopen it if you still need help.';
          break;
        case 'reopen':
          if (row.status !== 'resolved') throw new ConflictException();
          data = {
            status: 'open',
            mode: 'human',
            assignee: { disconnect: true },
          };
          body = 'This conversation has been reopened for our support team.';
          break;
      }
      await tx.supportConversation.update({
        where: { id },
        data: { ...data, version: { increment: 1 }, updatedAt: new Date() },
      });
      const event = await tx.supportMessage.create({
        data: {
          sequence: await this.sequence(tx, id),
          conversationId: id,
          kind: 'system',
          bodyCiphertext: envelope(body),
          requestKey: value.idempotencyKey,
          requestHash: hash,
        },
      });
      await this.audit(tx, identity, id, value.action);
      if (staff(identity) && value.action === 'resolve')
        await this.notify(
          tx,
          id,
          event.id,
          'Your support conversation was resolved',
        );
    });
    await this.signal(id, false);
    return this.get(identity, id);
  }
  async attachment(identity: AuthIdentity, id: string) {
    this.role(identity);
    const file = await this.db.supportAttachment.findFirst({
      where: {
        id,
        message: {
          ...(staff(identity)
            ? {}
            : { internal: false, conversation: { buyerId: identity.user.id } }),
        },
      },
    });
    if (!file) throw new NotFoundException();
    const encrypted = file.objectKey
      ? await this.fileStore?.read(file.objectKey)
      : file.contentCiphertext
        ? Buffer.from(file.contentCiphertext)
        : undefined;
    if (!encrypted) throw new NotFoundException();
    return Buffer.from(decryptPii(encrypted, 'support-file'), 'base64');
  }
  async availability() {
    return {
      attachmentsEnabled:
        !!this.fileStore?.writePrivate || this.databaseFiles(),
      available:
        (await this.db.supportPresence.count({
          where: {
            accepting: true,
            expiresAt: { gt: new Date() },
            user: {
              status: 'active',
              archivedAt: null,
              OR: [
                { role: 'admin' },
                {
                  staffMembership: {
                    is: {
                      role: {
                        archivedAt: null,
                        permissions: { has: 'support.manage' },
                      },
                    },
                  },
                },
                { role: 'support', staffMembership: { is: null } },
              ],
            },
          },
        })) > 0,
    };
  }
  async flushAttachments(onlyId?: string) {
    const store = this.fileStore;
    if (!store?.writePrivate) return 0;
    const rows = await this.db.supportAttachment.findMany({
      where: { objectKey: null, ...(onlyId ? { id: onlyId } : {}) },
      orderBy: { id: 'asc' },
      take: supportRules.imageOffloadBatch,
      include: { message: { select: { conversationId: true } } },
    });
    for (const row of rows) {
      if (!row.contentCiphertext) continue;
      const objectKey = `support/${row.message.conversationId}/${row.id}`;
      await store.writePrivate(objectKey, Buffer.from(row.contentCiphertext));
      await this.db.supportAttachment.updateMany({
        where: { id: row.id, objectKey: null },
        data: { objectKey, contentCiphertext: null },
      });
    }
    return rows.length;
  }
  async presence(identity: AuthIdentity, accepting: boolean) {
    if (!staff(identity)) throw new ForbiddenException();
    await this.db.$transaction(async (tx) => {
      await this.identity(tx, identity);
      const previous = await tx.supportPresence.findUnique({
        where: { userId: identity.user.id },
      });
      await tx.supportPresence.upsert({
        where: { userId: identity.user.id },
        create: {
          userId: identity.user.id,
          accepting,
          expiresAt: new Date(Date.now() + supportRules.presenceMs),
        },
        update: {
          accepting,
          expiresAt: new Date(Date.now() + supportRules.presenceMs),
        },
      });
      if (!previous || previous.accepting !== accepting)
        await tx.auditLog.create({
          data: {
            actorId: identity.user.id,
            action: 'support.availability',
            entityType: 'user',
            entityId: identity.user.id,
            afterCiphertext: encryptPii(JSON.stringify({ accepting }), 'audit'),
          },
        });
    });
    return this.availability();
  }
  private async notify(tx: Tx, id: string, eventId: string, heading: string) {
    const row = await tx.supportConversation.findUniqueOrThrow({
      where: { id },
      include: { buyer: { select: { emailCiphertext: true } } },
    });
    await tx.notification.createMany({
      skipDuplicates: true,
      data: [
        {
          userId: row.buyerId,
          reference: `support:${id}:${eventId}`,
          channel: 'email',
          template: 'support-v1',
          payloadCiphertext: encryptPii(
            JSON.stringify({
              emailCiphertext: row.buyer.emailCiphertext
                ? Buffer.from(row.buyer.emailCiphertext).toString('base64')
                : null,
              message: { heading, number: row.number, conversationId: id },
            }),
            'notification',
          ),
        },
      ],
    });
  }
  private async signal(id: string, staffOnly: boolean) {
    if (!process.env.REDIS_URL) return;
    try {
      if (!this.redis) {
        this.redis = createClient({
          url: process.env.REDIS_URL,
          socket: { connectTimeout: 1000, reconnectStrategy: false },
        });
        this.redis.on('error', () => {});
      }
      if (!this.redis.isOpen) await this.redis.connect();
      const row = await this.db.supportConversation.findUniqueOrThrow({
        where: { id },
        select: { buyerId: true },
      });
      await this.redis.publish(
        `${process.env.BID_NAMESPACE || BID_STREAM_NAMESPACE}support-updates`,
        JSON.stringify({ conversationId: id, buyerId: row.buyerId, staffOnly }),
      );
    } catch {
      /* Durable reads reconcile missed signals; never fail a committed message. */
    }
  }
  async onModuleDestroy() {
    if (this.redis?.isOpen) this.redis.destroy();
  }
}
