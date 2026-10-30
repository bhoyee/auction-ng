import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  pageInputSchema,
  paymentBankPageSchema,
  type PageInput,
  type VirtualAccountInput,
} from '@auction-ng/shared';
import type { PaymentProvider } from './payment-provider';

const code = z.string().regex(/^CUS_[A-Za-z0-9_-]+$/);
const kobo = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export class PaystackProvider implements PaymentProvider {
  async resolvePayoutAccount(bankCode: string, accountNumber: string) {
    const value = z
      .object({
        account_number: z.literal(accountNumber),
        account_name: z.string().min(1),
      })
      .parse(
        await this.request(
          `/bank/resolve?${new URLSearchParams({ bank_code: bankCode, account_number: accountNumber })}`,
        ),
      );
    return {
      accountName: value.account_name,
      bankName: 'Nigerian bank account',
    };
  }
  async payoutCustomer(email: string, firstName: string, lastName: string) {
    const value = z.object({ email: z.email(), customer_code: code }).parse(
      await this.request('/customer', {
        email,
        first_name: firstName,
        last_name: lastName,
      }),
    );
    if (value.email.toLowerCase() !== email.toLowerCase())
      throw new ServiceUnavailableException();
    return value.customer_code;
  }
  async validatePayoutCustomer(
    customerCode: string,
    input: {
      bankCode: string;
      accountNumber: string;
      bvn: string;
      firstName: string;
      lastName: string;
    },
  ) {
    await this.request(
      `/customer/${encodeURIComponent(customerCode)}/identification`,
      {
        country: 'NG',
        type: 'bank_account',
        bank_code: input.bankCode,
        account_number: input.accountNumber,
        bvn: input.bvn,
        first_name: input.firstName,
        last_name: input.lastName,
      },
    );
  }
  async verifyPayoutCustomer(customerCode: string, email: string) {
    const value = z
      .object({
        domain: z.literal('test'),
        customer_code: z.literal(customerCode),
        email: z.email(),
        identified: z.boolean(),
      })
      .parse(
        await this.request(`/customer/${encodeURIComponent(customerCode)}`),
      );
    return (
      value.identified && value.email.toLowerCase() === email.toLowerCase()
    );
  }
  async payoutRecipient(input: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
  }) {
    const value = z
      .object({
        recipient_code: z.string().regex(/^RCP_[A-Za-z0-9]+$/),
        domain: z.literal('test'),
        currency: z.literal('NGN'),
        details: z.object({
          account_number: z.literal(input.accountNumber),
          bank_code: z.literal(input.bankCode),
        }),
      })
      .parse(
        await this.request('/transferrecipient', {
          type: 'nuban',
          currency: 'NGN',
          name: input.accountName,
          account_number: input.accountNumber,
          bank_code: input.bankCode,
        }),
      );
    return value.recipient_code;
  }
  async sendPayout(input: {
    reference: string;
    recipientCode: string;
    amountKobo: number;
  }) {
    await this.request('/transfer', {
      source: 'balance',
      currency: 'NGN',
      reference: input.reference,
      recipient: input.recipientCode,
      amount: input.amountKobo,
      reason: 'Auction NG wallet withdrawal',
    });
  }
  async verifyPayout(reference: string) {
    const raw = await this.request(
      `/transfer/verify/${encodeURIComponent(reference)}`,
      undefined,
      true,
    );
    if (raw === null) return null;
    const value = z
      .object({
        reference: z.string(),
        amount: kobo,
        fee_charged: kobo,
        currency: z.string(),
        domain: z.string(),
        status: z.string(),
        recipient: z.object({ recipient_code: z.string() }),
      })
      .parse(raw);
    return {
      reference: value.reference,
      amountKobo: value.amount,
      feeKobo: value.fee_charged,
      currency: value.currency,
      domain: value.domain,
      status: value.status,
      recipientCode: value.recipient.recipient_code,
    };
  }
  constructor(
    private readonly secret: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!/^sk_test_[A-Za-z0-9]+$/.test(secret))
      throw new Error('Only a Paystack test secret key is allowed.');
  }
  verifySignature(raw: Buffer, signature: string) {
    if (!/^[a-f0-9]{128}$/i.test(signature)) return false;
    const expected = createHmac('sha512', this.secret).update(raw).digest();
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  }
  private async request(
    path: string,
    body?: unknown,
    allowMissing = false,
    includeMeta = false,
  ): Promise<unknown> {
    try {
      const response = await this.fetcher(
        new URL(path, 'https://api.paystack.co'),
        {
          method: body === undefined ? 'GET' : 'POST',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${this.secret}`,
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (allowMissing && response.status === 404) return null;
      if (!response.ok) throw new Error('Provider request failed');
      const parsed = z
        .object({
          status: z.literal(true),
          data: z.unknown().optional(),
          meta: z.unknown().optional(),
        })
        .parse(await response.json());
      return includeMeta ? parsed : parsed.data;
    } catch {
      throw new ServiceUnavailableException(
        'Bank transfer service is unavailable. Try again later.',
      );
    }
  }
  async listBanks(input: PageInput) {
    const page = pageInputSchema.parse(input);
    const query = new URLSearchParams({
      country: 'nigeria',
      currency: 'NGN',
      use_cursor: 'true',
      perPage: String(page.limit),
    });
    if (page.cursor) {
      const cursor = Buffer.from(page.cursor, 'base64url').toString();
      if (!/^[A-Za-z0-9+/=_-]{1,512}$/.test(cursor))
        throw new BadRequestException();
      query.set('next', cursor);
    }
    const raw = z
      .object({
        data: z
          .array(
            z.object({
              name: z.string(),
              code: z.string(),
              active: z.boolean(),
              is_deleted: z.boolean(),
              country: z.literal('Nigeria'),
              currency: z.literal('NGN'),
            }),
          )
          .max(50),
        meta: z.object({
          next: z
            .string()
            .regex(/^[A-Za-z0-9+/=_-]{1,512}$/)
            .nullable(),
        }),
      })
      .parse(await this.request(`/bank?${query}`, undefined, false, true));
    return paymentBankPageSchema.parse({
      items: raw.data
        .filter((bank) => bank.active && !bank.is_deleted)
        .map((bank) => ({ name: bank.name, code: bank.code })),
      nextCursor: raw.meta.next
        ? Buffer.from(raw.meta.next).toString('base64url')
        : null,
    });
  }
  async assignAccount(input: VirtualAccountInput & { email: string }) {
    await this.request('/dedicated_account/assign', {
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      preferred_bank: 'test-bank',
      country: 'NG',
      bvn: input.bvn,
      bank_code: input.bankCode,
      account_number: input.accountNumber,
    });
  }
  async initializeCard(input: {
    callbackUrl?: string;
    channel?: 'card' | 'bank_transfer';
    email: string;
    reference: string;
    amountKobo: number;
  }) {
    const result = z
      .object({ reference: z.string(), authorization_url: z.url() })
      .parse(
        await this.request('/transaction/initialize', {
          email: input.email,
          amount: input.amountKobo,
          currency: 'NGN',
          reference: input.reference,
          channels: [input.channel ?? 'card'],
          ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
        }),
      );
    const url = new URL(result.authorization_url);
    if (
      result.reference !== input.reference ||
      url.protocol !== 'https:' ||
      url.hostname !== 'checkout.paystack.com' ||
      url.username ||
      url.password ||
      url.port
    )
      throw new ServiceUnavailableException(
        'Invalid hosted checkout response.',
      );
    return { authorizationUrl: url.href };
  }
  async getAccount(email: string) {
    const raw = await this.request(
      `/customer/${encodeURIComponent(email)}`,
      undefined,
      true,
    );
    if (raw === null) return null;
    const customer = z
      .object({
        domain: z.literal('test'),
        email: z.string(),
        customer_code: code,
        identified: z.boolean(),
        dedicated_account: z
          .object({
            account_number: z.string().regex(/^\d{10}$/),
            currency: z.literal('NGN'),
            active: z.literal(true),
            assigned: z.literal(true),
            bank: z.object({ name: z.string() }),
          })
          .nullish(),
      })
      .parse(raw);
    if (customer.email.toLowerCase() !== email.toLowerCase())
      throw new ServiceUnavailableException();
    if (!customer.identified || !customer.dedicated_account) return null;
    return {
      customerCode: customer.customer_code,
      identified: true,
      bankName: customer.dedicated_account.bank.name,
      accountNumber: customer.dedicated_account.account_number,
    };
  }
  async verifyTransfer(reference: string) {
    const value = z
      .object({
        reference: z.string(),
        amount: kobo,
        fees: kobo.nullish(),
        currency: z.string(),
        domain: z.string(),
        status: z.string(),
        customer: z.object({
          customer_code: code,
          email: z.email().optional(),
        }),
        authorization: z
          .object({
            channel: z.string(),
            country_code: z
              .string()
              .regex(/^[A-Z]{2}$/)
              .optional(),
          })
          .nullish(),
        channel: z.string().optional(),
      })
      .parse(
        await this.request(
          `/transaction/verify/${encodeURIComponent(reference)}`,
        ),
      );
    return {
      reference: value.reference,
      amountKobo: value.amount,
      feeKobo: value.fees ?? null,
      currency: value.currency,
      domain: value.domain,
      status: value.status,
      customerCode: value.customer.customer_code,
      channel: value.authorization?.channel ?? value.channel ?? '',
      customerEmail: value.customer.email,
      cardCountry: value.authorization?.country_code,
    };
  }
  async listTransfers(from: Date, to: Date) {
    const result: string[] = [];
    for (let page = 1; page <= 10000; page++) {
      const query = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        status: 'success',
        perPage: '50',
        page: String(page),
      });
      const rows = z
        .array(
          z.object({
            reference: z.string(),
            domain: z.literal('test'),
            authorization: z.object({ channel: z.string() }).nullish(),
          }),
        )
        .max(50)
        .parse(await this.request(`/transaction?${query}`));
      result.push(
        ...rows
          .filter(
            (row) =>
              row.authorization?.channel === 'dedicated_nuban' ||
              (row.authorization?.channel === 'card' &&
                row.reference.startsWith('auction-card-')) ||
              (row.authorization?.channel === 'bank_transfer' &&
                row.reference.startsWith('auction-transfer-')),
          )
          .map((row) => row.reference),
      );
      if (rows.length < 50) return result;
    }
    throw new ServiceUnavailableException('Reconciliation page limit reached.');
  }
}
