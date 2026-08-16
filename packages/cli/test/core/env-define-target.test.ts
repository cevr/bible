import { describe, expect, it } from 'bun:test';

import { envDefineTarget } from '../../scripts/env-define-target.js';

describe('CLI environment definition targets', () => {
  it('uses the EGW compile-time identifiers for EGW settings', () => {
    expect(envDefineTarget('EGW_AUTH_BASE_URL')).toBe('globalThis.__EGW_AUTH_BASE_URL__');
    expect(envDefineTarget('EGW_API_BASE_URL')).toBe('globalThis.__EGW_API_BASE_URL__');
    expect(envDefineTarget('EGW_CLIENT_ID')).toBe('globalThis.__EGW_CLIENT_ID__');
    expect(envDefineTarget('EGW_CLIENT_SECRET')).toBe('globalThis.__EGW_CLIENT_SECRET__');
    expect(envDefineTarget('EGW_SCOPE')).toBe('globalThis.__EGW_SCOPE__');
    expect(envDefineTarget('EGW_USER_AGENT')).toBe('globalThis.__EGW_USER_AGENT__');
  });

  it('keeps process environment targets for other variables', () => {
    expect(envDefineTarget('ANTHROPIC_API_KEY')).toBe('process.env.ANTHROPIC_API_KEY');
  });
});
