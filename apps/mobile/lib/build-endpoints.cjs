const publicEndpoints = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_REALTIME_URL',
  'EXPO_PUBLIC_WEB_URL',
];

/** @param {string | undefined} profile
 * @param {Record<string, string | undefined>} environment */
function validateBuildEndpoints(profile, environment) {
  if (!profile || profile === 'development') return;
  for (const key of publicEndpoints) {
    const value = environment[key];
    if (!value) throw Error(`${key} must be set for ${profile} builds.`);
    let url;
    try {
      url = new URL(value);
    } catch {
      throw Error(`${key} must be a public HTTPS origin.`);
    }
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '[::1]' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    )
      throw Error(`${key} must be a public HTTPS origin.`);
  }
}
module.exports = { validateBuildEndpoints };
