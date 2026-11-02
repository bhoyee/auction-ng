const keys = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_REALTIME_URL',
  'EXPO_PUBLIC_WEB_URL',
  'EXPO_PUBLIC_EAS_PROJECT_ID',
];
/** @param {Record<string,string|undefined>} base
 * @param {Record<string,string>} root
 * @param {Record<string,string>} local
 * @param {string} command */
function mobileEnvironment(base, root, local, command) {
  const result = { ...base };
  for (const key of keys) {
    const value = command === 'start' ? local[key] || root[key] : root[key];
    if (!base[key] && value) result[key] = value;
  }
  return result;
}
module.exports = { mobileEnvironment };
