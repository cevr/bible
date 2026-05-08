/**
 * Prompts Command
 *
 * Expose the inline prompt registry so agents can list available prompts and
 * fetch their full contents without reading the source.
 */

import { Argument, Command, Flag } from 'effect/unstable/cli';
import { Console, Effect } from 'effect';

import { getPromptByName, PROMPT_REGISTRY } from '~/src/prompts';

const listJson = Flag.boolean('json').pipe(
  Flag.withDescription('Output JSON instead of a table'),
  Flag.withDefault(false),
);

const listCommand = Command.make('list', { json: listJson }, (args) =>
  Effect.gen(function* () {
    if (args.json) {
      const payload = PROMPT_REGISTRY.map((p) => ({
        name: p.name,
        description: p.description,
      }));
      yield* Console.log(JSON.stringify(payload, null, 2));
      return;
    }

    yield* Console.log(`${PROMPT_REGISTRY.length} prompt(s):\n`);
    const nameWidth = Math.max(...PROMPT_REGISTRY.map((p) => p.name.length));
    for (const p of PROMPT_REGISTRY) {
      yield* Console.log(`${p.name.padEnd(nameWidth)}  ${p.description}`);
    }
  }),
);

const promptName = Argument.string('name');

const getJson = Flag.boolean('json').pipe(
  Flag.withDescription('Output JSON ({ name, description, content }) instead of raw markdown'),
  Flag.withDefault(false),
);

const getCommand = Command.make('get', { name: promptName, json: getJson }, (args) =>
  Effect.gen(function* () {
    const entry = getPromptByName(args.name);

    if (entry === undefined) {
      yield* Console.error(`Prompt not found: ${args.name}`);
      yield* Console.error('');
      yield* Console.error('Available prompts:');
      for (const p of PROMPT_REGISTRY) {
        yield* Console.error(`  ${p.name}`);
      }
      return yield* Effect.sync(() => process.exit(1));
    }

    if (args.json) {
      yield* Console.log(JSON.stringify(entry, null, 2));
      return;
    }

    yield* Console.log(entry.content);
  }),
);

export const prompts = Command.make('prompts').pipe(
  Command.withSubcommands([listCommand, getCommand]),
);
