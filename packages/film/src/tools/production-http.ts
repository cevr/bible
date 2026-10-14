// The productions over HTTP: the handlers of the lab API's `productions`
// group (`LabHttpApi` in `core/api.ts`). The list is every ledger as the
// store reads it now (a terminal's `film production` write shows on the next
// read); a move forward is decided on the ledger as read under its lock, so
// a page that saw an older version is refused (`VersionMoved`), never
// written over.

import { Clock, Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { LabHttpApi } from '../core/api.ts';
import { moveForward } from '../core/production.ts';
import { answered } from './api-server.ts';
import { ProductionStore } from './production-store.ts';

export const productionsGroup = HttpApiBuilder.group(LabHttpApi, 'productions', (handlers) =>
  handlers
    .handle('list', () =>
      answered(
        Effect.map(
          Effect.flatMap(ProductionStore, (store) => store.list),
          (productions) => ({ productions }),
        ),
      ),
    )
    .handle('forward', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const at = yield* Clock.currentTimeMillis;
          const file = yield* (yield* ProductionStore).modify(params.production, (current) =>
            moveForward(current, payload, at),
          );
          yield* Effect.logInfo(
            `production.forward production=${params.production} version=${file.versions.length}`,
          );
          return file;
        }),
      ),
    ),
);
