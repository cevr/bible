// Upstream: packages/utils/src/platform/ (shared.ts, os.ts, engine.ts, env.ts)
//
// What the parts branch on: the OS (Apple's modifier keys, Android's virtual
// clicks), the engine (WebKit's focus quirks) and a fake DOM in tests.
function readRawData() {
  if (typeof navigator === 'undefined') {
    return { userAgent: '', platform: '', maxTouchPoints: 0 };
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform ?? '',
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  };
}

const raw = readRawData();
const lowerUserAgent = raw.userAgent.toLowerCase();
const lowerPlatform = raw.platform.toLowerCase();

const ios =
  /^i(os$|p)/.test(lowerPlatform) || (lowerPlatform === 'macintel' && raw.maxTouchPoints > 1);
const android = lowerPlatform === 'android' || lowerUserAgent.includes('android');
const mac = !ios && lowerPlatform.startsWith('mac');
const webkit = typeof CSS !== 'undefined' && !!CSS.supports?.('-webkit-backdrop-filter:none');

export const platform = {
  os: {
    ios,
    android,
    mac,
    windows: lowerPlatform.startsWith('win'),
    linux: !android && /^(linux|chrome os)/.test(lowerPlatform),
    apple: mac || ios,
  },
  engine: {
    webkit,
    gecko: !webkit && lowerUserAgent.includes('firefox'),
    blink: !webkit && lowerUserAgent.includes('chrom'),
  },
  env: {
    jsdom: /jsdom|happydom/.test(lowerUserAgent),
  },
} as const;
