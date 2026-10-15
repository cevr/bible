// A film's script in the review's Script reader (`reader.tsx`), as an ask
// shows it: its beats as the film's `script.ts` reads now (`GET
// …/script`, read fresh by the lab, each beat's line, picture and
// sources), its staging takes (`GET …/script/voice`: read, never voiced
// here), and its delivery marks written into `script.ts` (`POST
// …/script/marks`, the Script page's own write). The script is the review's
// one read of the film's (`meta.script`), read again on a Refresh and once a
// write answers, landed or refused: a write carries the words it was made on,
// so one refused because the line changed shows the line as it is now. A
// review page never loads a film's code, so the words come from the lab's
// read, not the film's player.

import { useAtomRefresh, useAtomValue } from '@bible/atom-solid';
import { Show } from '@solidjs/web';
import { Effect, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type DraftBeatRead, type ScriptBeats, stagingTakeUrl } from '../../core/api.ts';
import { reasonOf } from '../api.ts';
import { ReviewApi } from './api.ts';
import { useReview } from './context.tsx';
import { STATUS_ROLE, ScriptReader, type Selecting } from './reader.tsx';

/** A film's beat as the reader reads one: its id, its line, its picture as the brief, its sources. */
const beatRead = (beat: ScriptBeats['beats'][number]): DraftBeatRead => ({
  id: beat.id,
  label: '',
  ...Option.match(Option.fromUndefinedOr(beat.say), {
    onNone: () => ({}),
    onSome: (say) => ({ say }),
  }),
  ...Option.match(Option.fromUndefinedOr(beat.picture), {
    onNone: () => ({}),
    onSome: (brief) => ({ brief }),
  }),
  cite: beat.cite,
});

/** Film `film`'s script in the reader: its beats (only those `only` names, when it names some), or why it cannot be read. */
export const FilmScriptReader = (props: {
  readonly film: string;
  readonly only: Option.Option<ReadonlyArray<string>>;
  readonly selecting: Selecting;
}) => {
  const { meta } = useReview();
  const read = useAtomValue(() => meta.script(props.film));
  const again = useAtomRefresh(() => meta.script(props.film));
  const beats = () =>
    Option.match(AsyncResult.value(read()), {
      onNone: () => [],
      onSome: (s) =>
        s.beats
          .filter((b) =>
            Option.match(props.only, { onNone: () => true, onSome: (only) => only.includes(b.id) }),
          )
          .map(beatRead),
    });
  return (
    <Show
      when={Option.isSome(AsyncResult.value(read()))}
      fallback={
        <p class="dr-status" role={STATUS_ROLE[`${AsyncResult.isFailure(read())}`]}>
          {AsyncResult.match(read(), {
            onInitial: () => 'Reading the script…',
            onFailure: (f) => `Could not read the script: ${reasonOf(f.cause)}`,
            onSuccess: () => '',
          })}
        </p>
      }
    >
      <ScriptReader
        beats={beats}
        selecting={props.selecting}
        source={{
          voice: ReviewApi.use((api) => api.filmVoice(props.film)),
          // Landed in `script.ts` or refused: the script is read again, its words and marks as they are.
          mark: (post) =>
            ReviewApi.use((api) => api.filmMarks(props.film, post)).pipe(
              Effect.ensuring(Effect.sync(again)),
            ),
          takeUrl: (file) => stagingTakeUrl(props.film, file),
          written: 'marked in the script',
        }}
      />
    </Show>
  );
};
