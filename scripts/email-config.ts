const isEmailKey = (name: string) =>
  name === 'AUTH_MODE' || name === 'RESEND_API_KEY' || name.startsWith('SMTP_');

export function syncEmailConfig(source: string, target: string): string {
  const settings = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    const key = line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1];
    if (key && isEmailKey(key)) settings.set(key, line);
  }
  const retained = target.split(/\r?\n/).filter((line) => {
    const key = line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1];
    return !key || !isEmailKey(key);
  });
  return `${retained.join('\n').trimEnd()}\n${[...settings.values()].join('\n')}\n`;
}
