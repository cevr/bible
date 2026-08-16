const egwDefineTargets = new Map<string, string>([
  ['EGW_AUTH_BASE_URL', 'globalThis.__EGW_AUTH_BASE_URL__'],
  ['EGW_API_BASE_URL', 'globalThis.__EGW_API_BASE_URL__'],
  ['EGW_CLIENT_ID', 'globalThis.__EGW_CLIENT_ID__'],
  ['EGW_CLIENT_SECRET', 'globalThis.__EGW_CLIENT_SECRET__'],
  ['EGW_SCOPE', 'globalThis.__EGW_SCOPE__'],
  ['EGW_USER_AGENT', 'globalThis.__EGW_USER_AGENT__'],
]);

export const envDefineTarget = (key: string): string =>
  egwDefineTargets.get(key) ?? `process.env.${key}`;
