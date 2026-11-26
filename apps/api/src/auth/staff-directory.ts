import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { emailSchema, staffPasswordSchema } from '@auction-ng/shared';
import { AuthService, type SessionTokens } from './auth-service';
import { LedgerService } from '../ledger/ledger-service';
import { StaffAdminService } from '../staff-admin/staff-admin-service';

async function main() {
  if (!stdin.isTTY || !stdout.isTTY)
    throw Error(
      'Directory visibility requires an interactive server terminal. Do not pipe credentials.',
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
  const secret = async (label: string) => {
    stdout.write(label);
    hidden = true;
    try {
      return await prompt.question('');
    } finally {
      hidden = false;
      stdout.write('\n');
    }
  };
  let auth: AuthService | undefined;
  let ledger: LedgerService | undefined;
  const deviceId = randomUUID();
  let session: SessionTokens | undefined;
  try {
    auth = new AuthService();
    ledger = new LedgerService();
    stdout.write(
      'Change an existing administrator’s staff-directory visibility. Login, permissions and audit history stay unchanged.\n',
    );
    const email = emailSchema.parse(
      await prompt.question('Your admin email: '),
    );
    const password = staffPasswordSchema.parse(
      await secret('Your admin password (hidden): '),
    );
    const code = await secret(
      'Authenticator code if enabled; otherwise leave blank (hidden): ',
    );
    session = await auth.staffSignIn(
      { email, password, deviceId, client: 'web', ...(code ? { code } : {}) },
      '127.0.0.1',
    );
    const who = await auth.authenticate(session.accessToken, deviceId);
    if (who.user.role !== 'admin')
      throw Error('An active administrator is required.');
    const target = emailSchema.parse(
      await prompt.question('Existing target admin email: '),
    );
    const action = (await prompt.question('Type HIDE or SHOW: ')).trim();
    if (!['HIDE', 'SHOW'].includes(action)) throw Error('Choose HIDE or SHOW.');
    const reason = (
      await prompt.question('Reason (5–300 characters): ')
    ).trim();
    if (
      (
        await prompt.question(`Confirm ${action} for ${target}: type CONFIRM: `)
      ).trim() !== 'CONFIRM'
    ) {
      stdout.write('Cancelled. No visibility setting was changed.\n');
      return;
    }
    const service = new StaffAdminService(ledger, auth, {
      fenceEligibility: async () => {
        throw Error('Bidding operations are unavailable in this command.');
      },
    });
    const result = await service.setDirectoryVisibility(who, {
      email: target,
      hidden: action === 'HIDE',
      reason,
    });
    stdout.write(
      result.changed
        ? 'Directory visibility updated and audited.\n'
        : 'The account already has that visibility setting.\n',
    );
  } catch {
    process.exitCode = 1;
    stdout.write(
      'Visibility could not be confirmed. Check your admin credentials, target administrator and reason. Review the audit log before retrying.\n',
    );
  } finally {
    if (session && auth)
      await auth
        .logout({ client: 'web', deviceId }, session.refreshToken, '127.0.0.1')
        .catch(() => {
          stdout.write(
            'The command’s temporary session could not be signed out. Revoke it from account security.\n',
          );
          process.exitCode = 1;
        });
    prompt.close();
    await ledger?.close();
    await auth?.close();
  }
}
void main().catch(() => {
  console.error(
    'Directory command could not start. Use an interactive server terminal with configured database access.',
  );
  process.exitCode = 1;
});
