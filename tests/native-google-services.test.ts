import { expect, it, vi } from 'vitest';
import { googleServicesFileFor } from '../apps/mobile/lib/google-services.cjs';

const app = 'ng.giddydeal.app';
const firebase =
  (...packages: string[]) =>
  () =>
    JSON.stringify({
      client: packages.map((package_name) => ({
        client_info: { android_client_info: { package_name } },
      })),
    });

it('uses no Firebase file when none is configured', () => {
  expect(
    googleServicesFileFor('production', undefined, app, () => ''),
  ).toBeUndefined();
});
it('uses the file when it registers the app package', () => {
  expect(
    googleServicesFileFor(
      'production',
      'gs.json',
      app,
      firebase('old.app', app),
    ),
  ).toBe('gs.json');
});
it('stops production builds when the file is for another package', () => {
  expect(() =>
    googleServicesFileFor('production', 'gs.json', app, firebase('old.app')),
  ).toThrow(app);
  expect(() =>
    googleServicesFileFor('production', 'gs.json', app, () => 'not json'),
  ).toThrow(app);
});
it.each(['preview', 'development', undefined])(
  'lets %s builds continue without push when the file does not match',
  (profile) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(
      googleServicesFileFor(profile, 'gs.json', app, firebase('old.app')),
    ).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(app));
    warn.mockRestore();
  },
);
