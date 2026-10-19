// The lab's command set on the command line: `film lab <command>`, each
// made from its definition (`lab-command.ts`) and nothing else. A flag for
// each field of the command's parameters, by the field's own name, read as
// the JSON Schema MCP lists the tool by says the field is: a word, a number,
// a switch, a repeated flag for a list of words or numbers (numbers also
// comma-separated: `--crop 0,0,400,300`), and JSON text
// for anything else (`--blocks '[…]'`). `--input '<json>'` gives the whole
// input as one object (a flag given beside it wins), and `--json` prints the
// answer as its success schema encodes it, one line; without it, the
// command's plain lines. The input is read by the command's own parameters
// (`LabCommand.call` or `.input`), so a terminal is refused in the words an
// MCP client is.
//
// Where it runs follows from the set (`lab-commands.ts`): a command over
// the lab's files runs here, in this process, through the same stores the
// lab writes through (each write holds its file's lock across processes); a
// command over what only the running lab holds (its change feed, its easel,
// its asks' page lock, the agents' "doing now" lines) is called on the lab at
// `FILM_LAB_URL` through its MCP (`lab-client.ts`). A field the terminal
// knows (`films`: this checkout's films folder) is filled when not given.

import {
  Array as Arr,
  Boolean as Bool,
  Console,
  Effect,
  Layer,
  Option,
  Predicate,
  Schema,
} from 'effect';
import { Tool } from 'effect/ai';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';
import { localLink } from './api-server.ts';
import { labPhone } from './lab.ts';
import { type Answered, LabAddress, type LabCommand, LabCommandRefused } from './lab-command.ts';
import { type FieldKind, type LabField, fieldsOf } from './lab-fields.ts';
import { labClient, labUrl } from './lab-client.ts';

const isJsonObject = Schema.is(Schema.JsonObject);

/** What a flag reads before the command reads it: a value given, or none. */
type Given = Option.Option<Schema.Json>;

const readJson = Schema.decodeOption(Schema.fromJsonString(Schema.Json));
const readNumber = Schema.decodeOption(Schema.FiniteFromString);
const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.Json));

/** A number's text as its number, or kept as text when it is none, for the command's schema to refuse. Pure. */
const numberOf = (text: string): Schema.Json => Option.getOrElse(readNumber(text), () => text);

/** The fields the terminal fills when not given (`CliContext`). */
const KNOWN: ReadonlyArray<string> = ['films'];

/** What a field's flag help adds after its description. */
const NOTES: ReadonlyArray<readonly [(field: LabField) => boolean, string]> = [
  [(field) => KNOWN.includes(field.name), "this checkout's films folder, unless given"],
  [(field) => field.required && !KNOWN.includes(field.name), ' (required)'],
  [(field) => field.kind === 'json', ' [JSON]'],
];

/** A field's flag: the value as given, typed by its kind (JSON text kept as text, read with the rest of the input). */
const flagOf = (field: LabField): Flag.Flag<Given> => {
  const described = (flag: Flag.Flag<Given>) =>
    Flag.withDescription(
      flag,
      `${field.description}${NOTES.filter(([holds]) => holds(field))
        .map(([, note]) => note)
        .join('')}`,
    );
  const listed = (read: (text: string) => ReadonlyArray<Schema.Json>) =>
    Flag.String(field.name).pipe(
      Flag.atLeast(0),
      Flag.map((all): Given => Option.liftPredicate(all.flatMap(read), Arr.isArrayNonEmpty)),
    );
  const word = Flag.String(field.name).pipe(Flag.optional);
  const flags: Record<FieldKind, () => Flag.Flag<Given>> = {
    switch: () => Flag.Boolean(field.name).pipe(Flag.optional),
    words: () => listed((text) => [text]),
    numbers: () => listed((text) => text.split(',').map(numberOf)),
    number: () => Flag.Finite(field.name).pipe(Flag.optional),
    json: () => word,
    word: () => word,
  };
  return described(flags[field.kind]());
};

/** What the terminal fills in a command's input when its flag is not given. */
interface CliContext {
  /** This checkout's films folder, absolute: the `films` an easel command takes. */
  readonly films: string;
}

/** A command's input that does not read before the command reads it: `--input`, or a flag's JSON. */
const unread = (command: string, reason: string) =>
  LabCommandRefused.make({ command, tag: 'LabInputUnread', reason });

/** A field's value as given: a JSON field's text read as JSON, any other as it is. */
const fieldValue = (command: string, field: LabField, value: Schema.Json) =>
  Bool.match(field.kind === 'json', {
    onFalse: () => Effect.succeed(value),
    onTrue: () =>
      Effect.fromOption(
        Option.flatMap(Option.liftPredicate(value, Predicate.isString), readJson),
        () => unread(command, `--${field.name} is not JSON: ${jsonText(value)}`),
      ),
  });

/** One field of a command's input: its name and its value. */
type Entry = readonly [string, Schema.Json];

/**
 * The raw input `given` flags say, over `--input`'s object, a field the
 * terminal knows filled from `context` when neither gives it; or why
 * `--input` or a flag's JSON does not read.
 */
const rawInput = (
  command: string,
  fields: ReadonlyArray<LabField>,
  given: Readonly<Record<string, Given>>,
  input: Option.Option<string>,
  context: CliContext,
) =>
  Effect.gen(function* () {
    const base: Schema.JsonObject = yield* Option.match(input, {
      onNone: () => Effect.succeed<Schema.JsonObject>({}),
      onSome: (text) =>
        Effect.fromOption(
          Option.flatMap(readJson(text), (value) => Option.liftPredicate(value, isJsonObject)),
          () => unread(command, '--input is no JSON object'),
        ),
    });
    const flagged = yield* Effect.forEach(fields, (field) =>
      Option.match(Option.flatten(Option.fromUndefinedOr(given[field.name])), {
        onNone: () => Effect.succeed<ReadonlyArray<Entry>>([]),
        onSome: (value) =>
          Effect.map(fieldValue(command, field, value), (read): ReadonlyArray<Entry> => [
            [field.name, read],
          ]),
      }),
    );
    const filled: Schema.JsonObject = { ...base, ...Object.fromEntries(flagged.flat()) };
    const known = Bool.match(
      fields.some((field) => KNOWN.includes(field.name)) && !Object.hasOwn(filled, 'films'),
      { onTrue: () => ({ films: context.films }), onFalse: () => ({}) },
    );
    return { ...filled, ...known };
  });

/** A failure as `--json` prints it: its tag and its words, one line. */
export const failureLine = (error: { readonly _tag: string; readonly message: string }): string =>
  jsonText({ _tag: error._tag, message: error.message });

/** One command as `film lab <name>`, answered by `answer` (here, or by the lab). */
const cliCommand = <E extends { readonly _tag: string; readonly message: string }, R>(
  tool: Tool.Any,
  answer: (raw: Schema.JsonObject) => Effect.Effect<Answered, E, R>,
  context: CliContext,
) => {
  const { name } = tool;
  const fields = fieldsOf(tool);
  const flags = Object.fromEntries(fields.map((field) => [field.name, flagOf(field)]));
  return Command.make(
    name,
    {
      fields: flags,
      input: Flag.String('input').pipe(
        Flag.optional,
        Flag.withDescription('the whole input as one JSON object (a flag beside it wins)'),
      ),
      json: Flag.Boolean('json').pipe(
        Flag.withDefault(false),
        Flag.withDescription('print the answer as one line of JSON'),
      ),
    },
    Effect.fn(`film.lab.${name}`)(
      function* ({ fields: given, input, json }) {
        const raw = yield* rawInput(name, fields, given, input, context);
        const answered = yield* answer(raw);
        yield* Bool.match(json, {
          onTrue: () => Console.log(jsonText(answered.json)),
          onFalse: () =>
            Effect.forEach(answered.lines, (line) => Console.log(line), { discard: true }),
        });
      },
      (effect, { json }) =>
        Effect.tapError(effect, (error) =>
          Effect.when(Console.log(failureLine(error)), Effect.succeed(json)),
        ),
    ),
  ).pipe(
    Command.withDescription(
      Option.getOrElse(Option.fromUndefinedOr(Tool.getDescription(tool)), () => name),
    ),
  );
};

/** A command asked of the running lab: its input checked here, sent, and its answer read back as its own. */
const askedOfLab = (command: LabCommand<unknown>) => (raw: Schema.JsonObject) =>
  Effect.scoped(
    Effect.gen(function* () {
      const args = yield* command.input(raw);
      const client = yield* labClient(yield* labUrl);
      const session = yield* client.session;
      const json = yield* client.callJson(session, command.name, args);
      return yield* command.answered(json).pipe(
        Effect.mapError((error) =>
          LabCommandRefused.make({
            command: command.name,
            tag: 'LabAnswerUnread',
            reason: `the lab's answer does not read (${error.message}): the lab and this checkout run different code, so update the older one (pull this checkout, or restart the lab on the newer code)`,
          }),
        ),
      );
    }),
  );

/** The lab's own links as a terminal reaches it: `FILM_LAB_URL` on this machine, and `FILM_LAB_PHONE_URL`. */
const addressFromConfig = Layer.effect(
  LabAddress,
  Effect.gen(function* () {
    const local = localLink(yield* labUrl);
    const phone = yield* labPhone;
    return LabAddress.of({
      local,
      ...Option.match(phone, { onNone: () => ({}), onSome: (p) => ({ phone: p.href }) }),
    });
  }),
);

/**
 * The set as `film lab`'s subcommands: `here` run in this process over
 * `RHere`, the ones only the lab holds asked of it.
 */
export const labCliCommands = <RHere>(
  set: {
    readonly here: ReadonlyArray<LabCommand<RHere>>;
    readonly inLab: ReadonlyArray<LabCommand<unknown>>;
  },
  context: CliContext,
) => [
  ...set.here.map((command) =>
    cliCommand(command.tool, (raw) => command.call(raw), context).pipe(
      Command.provide(addressFromConfig),
    ),
  ),
  ...set.inLab.map((command) =>
    cliCommand(command.tool, askedOfLab(command), context).pipe(
      Command.provide(FetchHttpClient.layer),
    ),
  ),
];
