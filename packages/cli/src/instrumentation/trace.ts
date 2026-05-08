/**
 * CLI Tracing Module
 *
 * Lightweight instrumentation for debugging startup performance and execution flow.
 * Enable with TRACE=1 environment variable.
 *
 * Usage:
 *   import { trace, traceAsync, printSummary } from './instrumentation/trace.js';
 *
 *   trace('loading config');
 *   const result = traceAsync('fetch data', async () => { ... });
 *   printSummary(); // at end of program
 *
 * Output format (to stderr):
 *   [TRACE] 123.45ms | loading config
 *   [TRACE] 150.00ms | fetch data (26.55ms)
 */

const ENABLED = process.env['TRACE'] === '1';
const START_TIME = Bun.nanoseconds();

interface TraceEntry {
  label: string;
  timestampMs: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

const entries: TraceEntry[] = [];

/**
 * Get milliseconds since process start
 */
export function now(): number {
  return Bun.nanoseconds() / 1_000_000;
}

/**
 * Get milliseconds since process start (alias for now)
 */
export function elapsed(): number {
  return (Bun.nanoseconds() - START_TIME) / 1_000_000;
}

/**
 * Log a trace point with optional metadata
 */
export function trace(label: string, metadata?: Record<string, unknown>): void {
  if (!ENABLED) return;

  const timestampMs = elapsed();
  entries.push({ label, timestampMs, metadata });

  const metaStr = metadata !== undefined ? ` ${JSON.stringify(metadata)}` : '';
  console.error(`[TRACE] ${timestampMs.toFixed(2)}ms | ${label}${metaStr}`);
}

/**
 * Time a synchronous operation
 */
export function traceSync<T>(label: string, fn: () => T, metadata?: Record<string, unknown>): T {
  if (!ENABLED) return fn();

  const startMs = elapsed();
  try {
    const result = fn();
    const durationMs = elapsed() - startMs;
    entries.push({ label, timestampMs: startMs, durationMs, metadata });

    const metaStr = metadata !== undefined ? ` ${JSON.stringify(metadata)}` : '';
    console.error(
      `[TRACE] ${(startMs + durationMs).toFixed(2)}ms | ${label} (${durationMs.toFixed(2)}ms)${metaStr}`,
    );
    return result;
  } catch (error) {
    const durationMs = elapsed() - startMs;
    entries.push({
      label,
      timestampMs: startMs,
      durationMs,
      metadata: { ...metadata, error: true },
    });
    console.error(
      `[TRACE] ${(startMs + durationMs).toFixed(2)}ms | ${label} (${durationMs.toFixed(2)}ms) [ERROR]`,
    );
    throw error;
  }
}

/**
 * Time an async operation
 */
export async function traceAsync<T>(
  label: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  if (!ENABLED) return fn();

  const startMs = elapsed();
  try {
    const result = await fn();
    const durationMs = elapsed() - startMs;
    entries.push({ label, timestampMs: startMs, durationMs, metadata });

    const metaStr = metadata !== undefined ? ` ${JSON.stringify(metadata)}` : '';
    console.error(
      `[TRACE] ${(startMs + durationMs).toFixed(2)}ms | ${label} (${durationMs.toFixed(2)}ms)${metaStr}`,
    );
    return result;
  } catch (error) {
    const durationMs = elapsed() - startMs;
    entries.push({
      label,
      timestampMs: startMs,
      durationMs,
      metadata: { ...metadata, error: true },
    });
    console.error(
      `[TRACE] ${(startMs + durationMs).toFixed(2)}ms | ${label} (${durationMs.toFixed(2)}ms) [ERROR]`,
    );
    throw error;
  }
}

/**
 * Create a trace span that can be ended later
 */
export function startSpan(label: string, metadata?: Record<string, unknown>): () => void {
  if (!ENABLED) return () => {};

  const startMs = elapsed();
  return () => {
    const durationMs = elapsed() - startMs;
    entries.push({ label, timestampMs: startMs, durationMs, metadata });

    const metaStr = metadata !== undefined ? ` ${JSON.stringify(metadata)}` : '';
    console.error(
      `[TRACE] ${(startMs + durationMs).toFixed(2)}ms | ${label} (${durationMs.toFixed(2)}ms)${metaStr}`,
    );
  };
}

/**
 * Print a summary of all trace entries
 */
export function printSummary(): void {
  if (!ENABLED || entries.length === 0) return;

  const totalMs = elapsed();

  console.error('\n' + '='.repeat(60));
  console.error('TRACE SUMMARY');
  console.error('='.repeat(60));
  console.error(`Total time: ${totalMs.toFixed(2)}ms`);
  console.error(`Entries: ${entries.length}`);
  console.error('');

  // Find slowest operations (with duration)
  const withDuration = entries.filter((e) => e.durationMs !== undefined);
  if (withDuration.length > 0) {
    const sorted = [...withDuration].sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));
    const top10 = sorted.slice(0, 10);

    console.error('Slowest operations:');
    for (const entry of top10) {
      const durationMs = entry.durationMs ?? 0;
      console.error(`  ${durationMs.toFixed(2)}ms - ${entry.label}`);
    }
    console.error('');
  }

  // Timeline view
  console.error('Timeline:');
  let lastTs = 0;
  for (const entry of entries) {
    const gap = entry.timestampMs - lastTs;
    const gapStr = gap > 1 ? ` (+${gap.toFixed(0)}ms)` : '';
    const durStr = entry.durationMs !== undefined ? ` [${entry.durationMs.toFixed(2)}ms]` : '';
    console.error(`  ${entry.timestampMs.toFixed(2)}ms${gapStr} - ${entry.label}${durStr}`);
    lastTs = entry.timestampMs + (entry.durationMs ?? 0);
  }

  console.error('='.repeat(60) + '\n');
}

/**
 * Get trace data as JSON (for programmatic analysis)
 */
export function getTraceJson(): string {
  return JSON.stringify(
    {
      totalMs: elapsed(),
      entries,
      slowest: [...entries]
        .filter((e) => e.durationMs !== undefined)
        .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
        .slice(0, 20),
    },
    null,
    2,
  );
}

/**
 * Check if tracing is enabled
 */
export function isEnabled(): boolean {
  return ENABLED;
}

/**
 * Clear all trace entries (useful for testing)
 */
export function clear(): void {
  entries.length = 0;
}
