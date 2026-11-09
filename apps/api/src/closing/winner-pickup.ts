import { z } from 'zod';
import { koboSchema, fromLedgerKobo } from '@auction-ng/shared';
import type { Prisma } from '../generated/prisma/client';
export const winnerPickupSchema = z
  .object({
    dueAt: z.iso.datetime(),
    dailyKobo: koboSchema,
    capKobo: koboSchema,
    waived: z.boolean(),
    collected: z.boolean(),
  })
  .strict();
/** Read the buyer-owned item's recorded terms, never today's centre settings or a guessed date. */
export async function readWinnerPickup(
  tx: Prisma.TransactionClient,
  userId: string,
  invoiceNumber: string,
  lotNumber: string,
) {
  const line = await tx.invoiceLine.findFirst({
    where: {
      invoice: {
        number: invoiceNumber,
        userId,
        fulfilment: { type: 'pickup' },
      },
      lot: { lotNumber },
    },
    select: {
      storageCase: {
        select: {
          dueAt: true,
          dailyKobo: true,
          capKobo: true,
          waived: true,
          collectedAt: true,
        },
      },
    },
  });
  const row = line?.storageCase;
  return row
    ? winnerPickupSchema.parse({
        dueAt: row.dueAt.toISOString(),
        dailyKobo: fromLedgerKobo(row.dailyKobo),
        capKobo: fromLedgerKobo(row.capKobo),
        waived: row.waived,
        collected: row.collectedAt !== null,
      })
    : null;
}
