// Not in upstream: arithmetic typed into a number field.
//
// A field that allows expressions reads `0.42*2`, `(1+2)/4` or `1.5 - 0.25`
// as arithmetic over numbers in the field's locale and format (each number is
// read by `parseNumber`, so `1,5` in German and `50%` in a percent format
// work). Text that opens with `+`, `*` or `/` is relative to the value before
// editing began: `+0.1` adds, `*2` doubles, `/2` halves. A leading `-` stays
// a negative number, so `-0.1` is minus a tenth, and `+-0.1` subtracts it.
// `×` and `÷` read as `*` and `/`. A sign after a number's exponent (`1e-3`,
// `2E+4`) is the exponent's, not a sum. The parser is a small recursive
// descent over + - * / and parentheses; nothing is evaluated as code.
import { ANY_MINUS_RE, ANY_PLUS_RE, FORMAT_CONTROL_DETECT_RE, parseNumber } from './parse.ts';

/** A number's text that ends in its exponent's `e`: the sign that follows is the exponent's. */
const EXPONENT_OPEN_RE = /\d[eE]$/;

/** The keys an expression adds to what a number field accepts. */
export const EXPRESSION_KEYS: ReadonlySet<string> = new Set([
  '+',
  '-',
  '*',
  '/',
  '×',
  '÷',
  '(',
  ')',
  ' ',
]);

type Operator = '+' | '-' | '*' | '/' | '(' | ')';
type Token = { readonly op: Operator } | { readonly text: string } | { readonly value: number };

const OPERATORS = new Set<string>(['+', '-', '*', '/', '(', ')']);
const FORMAT_CONTROL_GLOBAL_RE = new RegExp(FORMAT_CONTROL_DETECT_RE.source, 'gu');

function tokenize(text: string): Array<Token> {
  const normalized = text
    .replace(FORMAT_CONTROL_GLOBAL_RE, '')
    .replace(ANY_MINUS_RE, '-')
    .replace(ANY_PLUS_RE, '+')
    .replace(/×/g, '*')
    .replace(/÷/g, '/');
  const tokens: Array<Token> = [];
  let run = '';
  const endRun = () => {
    const trimmed = run.trim();
    if (trimmed !== '') {
      tokens.push({ text: trimmed });
    }
    run = '';
  };
  for (const char of normalized) {
    if ((char === '+' || char === '-') && EXPONENT_OPEN_RE.test(run)) {
      run += char;
    } else if (OPERATORS.has(char)) {
      endRun();
      tokens.push({ op: char as Operator });
    } else {
      run += char;
    }
  }
  endRun();
  return tokens;
}

const isOp = (token: Token | undefined, op: Operator): boolean =>
  token !== undefined && 'op' in token && token.op === op;

/**
 * Whether the text is an expression rather than one number: it has `*`, `/`
 * or a parenthesis, a `+`/`-` after its first character, or a leading `+`.
 */
export function isExpression(text: string): boolean {
  const tokens = tokenize(text);
  return tokens.some((token, index) => {
    if (!('op' in token)) {
      return false;
    }
    if (token.op === '-' && index === 0) {
      return false;
    }
    return true;
  });
}

/**
 * The value of an expression, or `null` when the text does not read as one
 * (a dangling operator, an unclosed parenthesis, a division by zero).
 * `base` is the value relative text applies to; without one, `+x` is `x`
 * and `*x`/`/x` do not read.
 */
export function evaluateExpression(
  text: string,
  base: number | null,
  locale?: Intl.LocalesArgument,
  format?: Intl.NumberFormatOptions,
): number | null {
  const tokens = tokenize(text);
  const first = tokens[0];
  if (first !== undefined && (isOp(first, '+') || isOp(first, '*') || isOp(first, '/'))) {
    if (base !== null) {
      tokens.unshift({ value: base });
    } else if (!isOp(first, '+')) {
      return null;
    }
  }

  let index = 0;
  let failed = false;
  const peek = () => tokens[index];

  const factor = (): number => {
    const token = tokens[index];
    if (token === undefined) {
      failed = true;
      return Number.NaN;
    }
    index += 1;
    if ('value' in token) {
      return token.value;
    }
    if ('text' in token) {
      const value = parseNumber(token.text, locale, format);
      if (value === null) {
        failed = true;
        return Number.NaN;
      }
      return value;
    }
    if (token.op === '-') {
      return -factor();
    }
    if (token.op === '+') {
      return factor();
    }
    if (token.op === '(') {
      const value = sum();
      if (!isOp(peek(), ')')) {
        failed = true;
        return Number.NaN;
      }
      index += 1;
      return value;
    }
    failed = true;
    return Number.NaN;
  };

  const product = (): number => {
    let value = factor();
    while (isOp(peek(), '*') || isOp(peek(), '/')) {
      const divide = isOp(peek(), '/');
      index += 1;
      const right = factor();
      value = divide ? value / right : value * right;
    }
    return value;
  };

  const sum = (): number => {
    let value = product();
    while (isOp(peek(), '+') || isOp(peek(), '-')) {
      const subtract = isOp(peek(), '-');
      index += 1;
      const right = product();
      value = subtract ? value - right : value + right;
    }
    return value;
  };

  if (tokens.length === 0) {
    return null;
  }
  const value = sum();
  if (failed || index !== tokens.length || !Number.isFinite(value)) {
    return null;
  }
  // Float noise from the arithmetic (0.1 + 0.2), not from the numbers typed.
  return Number(value.toPrecision(12));
}
