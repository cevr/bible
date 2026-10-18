// The lab's command set, defined once and served twice: a command reads its
// input by its parameters (refused in the words a toolkit says), answers its
// success as JSON and as plain lines, and refuses in its own words; and the
// set is the same on each transport, by name and by field: every MCP tool the
// lab lists is a `film lab` subcommand taking the fields the tool's input
// schema lists, and no command is served on one transport alone.

import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Boolean as Bool, Effect, Layer, Option, Schema } from 'effect';
import { Tool } from 'effect/ai';
import { labCliCommands } from './lab-cli.ts';
import { fieldsOf } from './lab-fields.ts';
import { labCommand } from './lab-command.ts';
import { allCommands, hereCommands, inLabCommands } from './lab-commands.ts';
import { LabRefused } from './lab-mcp-parts.ts';
import { RenderCatalogue } from './catalogue.ts';
import { labInMemory, labWithMcp, mcpSession } from './testing.ts';

/** A command over a word, a count, a switch, a list and a record. */
const Sample = Tool.make('sample', {
  description: 'A sample command.',
  parameters: Schema.Struct({
    film: Schema.String,
    count: Schema.optionalKey(Schema.FiniteFromString),
    loud: Schema.optionalKey(Schema.Boolean),
    scenes: Schema.optionalKey(Schema.Array(Schema.String)),
    at: Schema.optionalKey(Schema.Array(Schema.Finite)),
    mode: Schema.optionalKey(Schema.Literals(['plain', 'value'])),
    levels: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
  success: Schema.Struct({
    film: Schema.String,
    count: Schema.Finite,
    seen: Schema.Array(Schema.Struct({ scene: Schema.String, at: Schema.Finite })),
  }),
  failure: LabRefused,
});

const sample = labCommand(Sample, {
  run: ({ film, count, scenes }) =>
    Bool.match(film === 'nope', {
      onTrue: () => Effect.fail(LabRefused.make({ reason: 'no film nope' })),
      onFalse: () =>
        Effect.succeed({
          film,
          count: Option.getOrElse(Option.fromUndefinedOr(count), () => 0),
          seen: Option.getOrElse(Option.fromUndefinedOr(scenes), () => []).map((scene, i) => ({
            scene,
            at: i,
          })),
        }),
    }),
});

describe('a lab command', () => {
  it.effect('reads its input by its parameters, and answers its JSON and its plain lines', () =>
    Effect.gen(function* () {
      const answered = yield* sample.call({ film: 'f', count: '2', scenes: ['a', 'b'] });
      expect(answered.json).toEqual({
        film: 'f',
        count: 2,
        seen: [
          { scene: 'a', at: 0 },
          { scene: 'b', at: 1 },
        ],
      });
      expect(answered.lines).toEqual([
        'film=f count=2',
        'seen[0] scene=a at=0',
        'seen[1] scene=b at=1',
      ]);
      expect(Option.isNone(answered.pictured)).toBe(true);
      // The answer the lab sent, read back as the command's own: the same lines.
      expect((yield* sample.answered(answered.json)).lines).toEqual(answered.lines);
    }),
  );

  it.effect(
    'refuses input its parameters do not read as a toolkit does, and a run in its words',
    () =>
      Effect.gen(function* () {
        const unread = yield* Effect.flip(sample.call({ count: 'two' }));
        expect(unread._tag).toBe('LabInputInvalid');
        expect(unread.message).toContain("Invalid parameters for tool 'sample': ");
        // Every problem said, not the first.
        expect(unread.message).toContain('["film"]');
        expect(unread.message).toContain('["count"]');
        expect(yield* Effect.flip(sample.call({ film: 'nope' }))).toMatchObject({
          _tag: 'LabCommandRefused',
          command: 'sample',
          tag: 'LabRefused',
          reason: 'no film nope',
        });
        // A field it does not take is left out, as the MCP leaves it out.
        expect(yield* sample.input({ film: 'f', stray: 1 })).toEqual({ film: 'f' });
        expect((yield* Effect.flip(sample.answered({ film: 'f' })))._tag).toBe('SchemaError');
      }),
  );

  test('takes each field on the command line by its kind', () => {
    expect(fieldsOf(Sample).map((f) => [f.name, f.kind, f.required])).toEqual([
      ['film', 'word', true],
      ['count', 'word', false],
      ['loud', 'switch', false],
      ['scenes', 'words', false],
      ['at', 'numbers', false],
      ['mode', 'word', false],
      ['levels', 'json', false],
    ]);
  });

  it.effect(
    'prints a plain answer: its scalars first, then a line for each record and each item',
    () =>
      Effect.gen(function* () {
        const said = <
          S extends Schema.Top & Schema.ConstraintCodec<unknown, unknown, never, never>,
        >(
          success: S,
          output: S['Type'],
        ) =>
          labCommand(
            Tool.make('said', { parameters: Schema.Struct({}), success, failure: LabRefused }),
            { run: () => Effect.succeed(output) },
          ).call({});
        expect((yield* said(Schema.String, 'done')).lines).toEqual(['done']);
        const Record = Schema.Struct({
          id: Schema.String,
          text: Schema.String,
          page: Schema.Struct({ at: Schema.Finite }),
          tags: Schema.Array(Schema.String),
          list: Schema.Array(Schema.String),
        });
        expect(
          (yield* said(Record, {
            id: 'n1',
            text: 'two words',
            page: { at: 1 },
            tags: [],
            list: ['a'],
          })).lines,
        ).toEqual(['id=n1 text="two words"', 'page at=1', 'tags=[]', 'list[0] a']);
      }),
  );
});

describe('the command set on each transport', () => {
  test('is one set: each command once, by its own name, here or in the lab', () => {
    const names = allCommands.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...hereCommands, ...inLabCommands].map((c) => c.name).toSorted()).toEqual(
      names.toSorted(),
    );
    for (const command of allCommands) expect(command.name).toBe(command.tool.name);
  });

  it.effect('is served alike: every MCP tool is a `film lab` command, with the same fields', () =>
    Effect.gen(function* () {
      const { lab } = yield* labWithMcp;
      const { call } = yield* mcpSession(lab);
      const { tools } = yield* call('tools/list', {});
      const cli = labCliCommands({ here: hereCommands, inLab: inLabCommands }, { films: '/films' });
      const listed = (
        tools as ReadonlyArray<{
          name: string;
          inputSchema: { properties?: object; required?: ReadonlyArray<string> };
        }>
      )
        .map((tool) => tool.name)
        .toSorted();
      expect(cli.map((command) => command.name).toSorted()).toEqual(listed);
      for (const tool of tools as ReadonlyArray<{
        name: string;
        inputSchema: { properties?: object; required?: ReadonlyArray<string> };
      }>) {
        const command = allCommands.find((c) => c.name === tool.name);
        const fields = fieldsOf(Option.getOrThrow(Option.fromUndefinedOr(command)).tool);
        expect([tool.name, fields.map((f) => f.name).toSorted()]).toEqual([
          tool.name,
          Object.keys(tool.inputSchema.properties ?? {}).toSorted(),
        ]);
        expect([
          tool.name,
          fields
            .filter((f) => f.required)
            .map((f) => f.name)
            .toSorted(),
        ]).toEqual([tool.name, [...(tool.inputSchema.required ?? [])].toSorted()]);
      }
    }).pipe(
      Effect.scoped,
      Effect.provide(RenderCatalogue.layer.pipe(Layer.provideMerge(labInMemory(new Map())))),
    ),
  );
});
