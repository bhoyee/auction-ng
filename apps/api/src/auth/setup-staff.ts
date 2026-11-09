import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Writable } from 'node:stream';
import { createDatabase } from '../database/client';
import { encryptPii, hashPii } from '../security/pii';
import { emailSchema, staffPasswordSchema } from '@auction-ng/shared';
import { hashStaffPassword } from './staff-crypto';
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
      'Create a LotVanta administrator. No existing account will be changed.\n',
    );
    const name = (await prompt.question('Staff name: ')).trim();
    if (!name || name.length > 120)
      throw new SetupError('Enter a staff name of 1–120 characters.');
    const parsedEmail = emailSchema.safeParse(
      await prompt.question('Staff email: '),
    );
    if (!parsedEmail.success)
      throw new SetupError(
        'Enter a valid staff email address. No account was created.',
      );
    const email = parsedEmail.data;
    if (
      await db.user.findUnique({
        where: { emailHash: hashPii(email, 'email') },
      })
    )
      throw new SetupError(
        'This email already has an account. Use a separate staff email; this tool never promotes buyer accounts.',
      );
    const parsedPassword = staffPasswordSchema.safeParse(
      await secretQuestion('Password (15–128 characters; hidden): '),
    );
    if (!parsedPassword.success)
      throw new SetupError(
        'Password must contain 15–128 characters. No account was created. Run setup again with a longer passphrase.',
      );
    const password = parsedPassword.data;
    if (password !== (await secretQuestion('Confirm password: ')))
      throw new SetupError('Passwords do not match.');
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
              mfa: false,
              method: 'local_operator_setup',
            }),
            'audit',
          ),
        },
      });
    });
    stdout.write(
      '\x1b[2J\x1b[HStaff administrator created. Sign in with your password. You can enable two-factor authentication in Account security.\n',
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
