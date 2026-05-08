/**
 * Promise with Status
 *
 * Extends Promise with status tracking for synchronous reads.
 * Compatible with both React's use() and Solid's createResource.
 */

export const PromiseStatus = {
  Pending: 'pending',
  Fulfilled: 'fulfilled',
  Rejected: 'rejected',
} as const;

export type PromiseStatus = (typeof PromiseStatus)[keyof typeof PromiseStatus];

/**
 * A Promise with status tracking fields.
 *
 * React checks: status, value, reason
 * Solid checks: v (value or error), s (1=fulfilled, 2=rejected)
 */
export interface PromiseWithStatus<T> extends Promise<T> {
  status: PromiseStatus;
  value?: T;
  reason?: unknown;
  // Solid.js compatibility
  v?: unknown; // value or error
  s?: 1 | 2; // 1=fulfilled, 2=rejected
}

/**
 * Wrap an existing promise with status tracking.
 */
export function wrapPromise<T>(promise: Promise<T>): PromiseWithStatus<T> {
  const wrapped = promise as PromiseWithStatus<T>;
  wrapped.status = PromiseStatus.Pending;

  promise.then(
    (value) => {
      wrapped.status = PromiseStatus.Fulfilled;
      wrapped.value = value;
      wrapped.v = value;
      wrapped.s = 1;
    },
    (reason) => {
      wrapped.status = PromiseStatus.Rejected;
      wrapped.reason = reason;
      wrapped.v = reason;
      wrapped.s = 2;
    },
  );

  return wrapped;
}

/**
 * Create an already-resolved promise with status.
 */
export function resolvedPromise<T>(value: T): PromiseWithStatus<T> {
  const p = Promise.resolve(value) as PromiseWithStatus<T>;
  p.status = PromiseStatus.Fulfilled;
  p.value = value;
  p.v = value;
  p.s = 1;
  return p;
}

/**
 * Create an already-rejected promise with status.
 */
export function rejectedPromise<T>(reason: unknown): PromiseWithStatus<T> {
  const p = Promise.reject(reason) as PromiseWithStatus<T>;
  p.catch(() => {}); // Prevent unhandled rejection
  p.status = PromiseStatus.Rejected;
  p.reason = reason;
  p.v = reason;
  p.s = 2;
  return p;
}

/**
 * A deferred promise that can be resolved/rejected externally.
 */
export interface Deferred<T> {
  promise: PromiseWithStatus<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/**
 * Create a deferred promise that can be resolved/rejected externally.
 */
export function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  }) as PromiseWithStatus<T>;

  promise.status = PromiseStatus.Pending;
  promise.catch(() => {}); // Prevent unhandled rejection

  return {
    promise,
    resolve: (value: T) => {
      promise.status = PromiseStatus.Fulfilled;
      promise.value = value;
      promise.v = value;
      promise.s = 1;
      resolve(value);
    },
    reject: (reason: unknown) => {
      promise.status = PromiseStatus.Rejected;
      promise.reason = reason;
      promise.v = reason;
      promise.s = 2;
      reject(reason);
    },
  };
}
