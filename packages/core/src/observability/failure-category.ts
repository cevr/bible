/**
 * Stable log-category derivation from an unknown failure.
 *
 * Hosts and the shared app log failures as `[area] action key=value` lines
 * (see the repo observability convention); `failureCategory` turns any cause
 * into the `category=` value: the tagged error `_tag` when present, else a
 * `code` or `name`, normalized to a lowercase token. Pure and dependency-free
 * so every tier — Solid UI, browser worker, Bun server, Electron main — uses
 * the same taxonomy.
 */

import { Predicate } from 'effect';

const normalizeCategory = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (normalized.length > 0) return normalized;
  return 'unknown';
};

export const failureCategory = (cause: unknown): string => {
  if (!Predicate.isObject(cause)) return 'unknown';
  const tag = cause['_tag'];
  if (Predicate.isString(tag)) return normalizeCategory(tag);
  const code = cause['code'];
  if (Predicate.isString(code)) return normalizeCategory(code);
  const name = cause['name'];
  if (Predicate.isString(name)) return normalizeCategory(name);
  return 'unknown';
};
