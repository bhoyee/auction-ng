// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS config helper
const { readFileSync } = require('node:fs');

/**
 * A Firebase file registered for another Android package makes Gradle fail the
 * whole build. Test builds skip it (push alerts stay off, the app still works);
 * production builds stop with a clear message so a store build never ships
 * without push.
 * @param {string | undefined} profile
 * @param {string | undefined} file
 * @param {string} androidPackage
 * @param {(path: string) => string} [read]
 * @returns {string | undefined}
 */
function googleServicesFileFor(
  profile,
  file,
  androidPackage,
  read = (path) => readFileSync(path, 'utf8'),
) {
  if (!file) return undefined;
  let packages = [];
  try {
    const parsed = JSON.parse(read(file));
    packages = (Array.isArray(parsed.client) ? parsed.client : []).map(
      (client) => client?.client_info?.android_client_info?.package_name,
    );
  } catch {
    packages = [];
  }
  if (packages.includes(androidPackage)) return file;
  const problem = `GOOGLE_SERVICES_JSON has no Android app for ${androidPackage}. Add that package in Firebase and upload the new google-services.json to EAS.`;
  if (profile === 'production') throw Error(problem);
  console.warn(`${problem} Building without push notifications.`);
  return undefined;
}
module.exports = { googleServicesFileFor };
