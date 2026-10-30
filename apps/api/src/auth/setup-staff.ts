import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Writable } from 'node:stream';
import { createDatabase } from '../database/client';
import { encryptPii, hashPii } from '../security/pii';
import { emailSchema, staffPasswordSchema } from '@auction-ng/shared';
import { hashStaffPassword, newTotpSecret, verifyTotp } from './staff-crypto';
class SetupError extends Error {}
async function main() {
  if (!stdin.isTTY || !stdout.isTTY)
    throw new Error(
      'Staff setup requires an interactive terminal. Do not pipe credentials or use command-line password arguments.',
    );
  let hidden = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!hidden) stdout.write(chunk);
      callback();
    },
  });
  const prompt = createInterface({
    input: stdin,
    output,
    terminal: true,
    historySize: 0,
  });
  const db = createDatabase(process.env.DATABASE_URL);
  async function secretQuestion(label: string) {
    stdout.write(label);
    hidden = true;
    try {
      return await prompt.question('');
    } finally {
      hidden = false;
      stdout.write('\n');
    }
  }
  try {
    stdout.write(
      'Create an Auction NG administrator. No existing account will be changed.\n',
    );
    const name = (await prompt.question('Staff name: ')).trim();
    if (!name || name.length > 120)
      throw new SetupError('Enter a staff name of 1–120 characters.');
    const email = emailSchema.parse(await prompt.question('Staff email: '));
    if (
      await db.user.findUnique({
        where: { emailHash: hashPii(email, 'email') },
      })
    )
      throw new SetupError(
        'This email already has an account. Use a separate staff email; this tool never promotes buyer accounts.',
      );
    const password = staffPasswordSchema.parse(
      await secretQuestion('Password (15–128 characters; hidden): '),
    );
    if (password !== (await secretQuestion('Confirm password: ')))
      throw new SetupError('Passwords do not match.');
    const secret = newTotpSecret();
    stdout.write(
      '\nIn Google Authenticator choose Add > Enter a setup key.\nAccount: Auction NG staff\nType: Time based\n',
    );
    // Deliberate one-time credential handoff in the operator's terminal, never application logging.
    stdout.write(`Setup key (shown once; keep private): ${secret}\n`);
    const code = await secretQuestion(
      'Enter the current six-digit code to confirm setup: ',
    );
    const counter = verifyTotp(secret, code, Date.now());
    if (counter === null)
      throw new SetupError(
        'Code was not accepted. No account was created. Check automatic time on your phone and run setup again.',
      );
    const passwordHash = await hashStaffPassword(password);
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          role: 'admin',
          emailHash: hashPii(email, 'email'),
          emailCiphertext: encryptPii(email, 'email'),
          emailVerifiedAt: new Date(),
          staffCredential: {
            create: {
              passwordHash,
              totpSecretCiphertext: encryptPii(secret, 'staff-totp'),
              lastCounter: counter,
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'staff.provisioned',
          entityType: 'user',
          entityId: user.id,
          afterCiphertext: encryptPii(
            JSON.stringify({
              role: 'admin',
              mfa: 'totp',
              method: 'local_operator_setup',
            }),
            'audit',
          ),
        },
      });
    });
    stdout.write(
      '\x1b[2J\x1b[HStaff administrator created. Wait for a new authenticator code, then sign in at the staff website.\n',
    );
  } catch (error) {
    stdout.write(
      error instanceof SetupError
        ? `${error.message}\n`
        : 'Setup failed. Check the entered details and database connection. No password or authenticator code is logged.\n',
    );
    process.exitCode = 1;
  } finally {
    prompt.close();
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Staff setup failed. Check the database connection and use an interactive terminal.',
  );
  process.exitCode = 1;
});
