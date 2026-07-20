import { Cause, Inspectable, Logger, Option, Schema } from 'effect';
import type { LogLevel } from 'effect';

type LevelStyle = {
  label: string;
  prefix: string;
  color: string;
};

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

const colorsEnabled = false;

const colorize = (text: string, color: string) => {
  if (colorsEnabled) {
    return `${color}${text}${ANSI.reset}`;
  }
  return text;
};
const dim = (text: string) => {
  if (colorsEnabled) {
    return `${ANSI.dim}${text}${ANSI.reset}`;
  }
  return text;
};

const levelStyles: Record<LogLevel.LogLevel, LevelStyle> = {
  None: { label: 'log', prefix: '-', color: ANSI.gray },
  All: { label: 'log', prefix: '-', color: ANSI.gray },
  Trace: { label: 'trace', prefix: '.', color: ANSI.gray },
  Debug: { label: 'debug', prefix: '.', color: ANSI.blue },
  Info: { label: 'info', prefix: '>', color: ANSI.cyan },
  Warn: { label: 'warn', prefix: '!', color: ANSI.yellow },
  Error: { label: 'error', prefix: 'x', color: ANSI.red },
  Fatal: { label: 'fatal', prefix: 'x', color: ANSI.red },
};

const toMessages = (message: unknown): ReadonlyArray<unknown> => {
  if (Array.isArray(message)) {
    return message;
  }
  return [message];
};

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  return Inspectable.toStringUnknown(value, 0);
};

const formatMessages = (messages: ReadonlyArray<unknown>): string =>
  messages.map(formatValue).join(' ');

const isJsonLike = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (!((first === '{' && last === '}') || (first === '[' && last === ']'))) {
    return false;
  }

  return Option.isSome(Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json))(trimmed));
};

const shouldRenderRaw = (
  logLevel: LogLevel.LogLevel,
  messages: ReadonlyArray<unknown>,
  cause: Cause.Cause<unknown>,
): boolean => {
  if (messages.length !== 1) return false;

  const message = messages[0];
  if (typeof message !== 'string') return false;
  if (message.trim().length === 0) return true;
  if (/^\s/.test(message)) return logLevel === 'Info';

  if (cause.reasons.length !== 0) return false;
  if (logLevel !== 'Info') return false;

  return isJsonLike(message);
};

const cliLogger = Logger.make<unknown, string>(({ cause, logLevel, message }) => {
  const messages = toMessages(message);

  if (shouldRenderRaw(logLevel, messages, cause)) {
    return formatValue(messages[0] ?? '');
  }

  const style = levelStyles[logLevel] ?? levelStyles.Info;
  let prefix = `[${style.label}]`;
  if (colorsEnabled) {
    prefix = colorize(style.prefix, style.color);
  }
  const formattedMessage = formatMessages(messages);

  const parts: string[] = [];
  parts.push(`${prefix} ${formattedMessage}`);

  let out = parts.join(' ');

  if (cause.reasons.length !== 0) {
    const causeText = Cause.pretty(cause);
    out += `\n${dim(causeText)}`;
  }

  return out;
});

export const CliLoggerLive = Logger.layer([Logger.withLeveledConsole(cliLogger)]);
