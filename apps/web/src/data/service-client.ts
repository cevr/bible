import type { Context, Effect, ManagedRuntime } from 'effect';

type EffectMethod = (...args: readonly unknown[]) => Effect.Effect<unknown, unknown, unknown>;

export type PromiseClient<ServiceShape> = {
  [Key in keyof ServiceShape]: ServiceShape[Key] extends (
    ...args: infer Args
  ) => Effect.Effect<infer Success, unknown, unknown>
    ? (...args: Args) => Promise<Success>
    : never;
};

/**
 * Adapt one Effect module to the Promise interface consumed by React.
 *
 * The proxy is intentionally confined to this exit adapter. Domain modules
 * retain their typed Effect interfaces; presentation code receives promises
 * without duplicating every method in a pass-through facade.
 */
export function makeServiceClient<Identifier, ServiceShape, RuntimeServices>(
  runtime: ManagedRuntime.ManagedRuntime<RuntimeServices, never>,
  service: Context.Service<Identifier, ServiceShape>,
): PromiseClient<ServiceShape> {
  return new Proxy(
    {},
    {
      get(_target, property) {
        return (...args: readonly unknown[]) => {
          const program = service.use((shape) => {
            const method = Reflect.get(shape as object, property) as EffectMethod;
            return method(...args);
          });

          // The runtime is assembled from every service used to build the app
          // client; this adapter narrows the selected service requirement back
          // to that union after dynamic property lookup.
          return runtime.runPromise(program as Effect.Effect<unknown, unknown, RuntimeServices>);
        };
      },
    },
  ) as PromiseClient<ServiceShape>;
}
