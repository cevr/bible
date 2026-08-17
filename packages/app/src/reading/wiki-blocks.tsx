/** The wiki's portable AST, rendered (§2.2).
 *
 *  `thesis_ast` and `body_ast` hold JSON of `readonly Block[]`, never HTML,
 *  precisely so the CLI text-renders exactly what this component renders as
 *  elements. This file is the Solid half of that pair; nothing here decides what
 *  a block *means*, only which element carries it.
 *
 *  No phrase overlay runs over these blocks, deliberately. A topic page's own
 *  authored prose is about the topic it is on, and linking a page's phrases back
 *  into the same page — or into the neighbours the related-topics section
 *  already lists by name — is the "soup" §4.7's restraint exists to prevent.
 *  §4.5's table names the topic page's layered sections as sections for the
 *  overlay; that is the *auto-mined* corpus text (§6), which arrives as plain
 *  strings from FTS and carries no AST at all in v1. That half **is** overlaid —
 *  `wiki-topic-page.tsx` runs one match plan per layered section over the text
 *  `wiki-section-text.ts` projects, and renders it through the same `HotText`
 *  the EGW reader uses.
 */

import type { Block, Inline } from '@bible/core/wiki';
import { For, Match, Switch } from '@solidjs/web';

const InlineRun = (props: { readonly content: readonly Inline[] }) => (
  <For each={props.content}>
    {(inline) => (
      <Switch>
        <Match when={inline._tag === 'text'}>
          {() => {
            if (inline._tag !== 'text') return <></>;
            return inline.text;
          }}
        </Match>
        <Match when={inline._tag === 'emphasis'}>
          {() => {
            if (inline._tag !== 'emphasis') return <></>;
            return <em>{inline.text}</em>;
          }}
        </Match>
        <Match when={inline._tag === 'strong'}>
          {() => {
            if (inline._tag !== 'strong') return <></>;
            return <strong>{inline.text}</strong>;
          }}
        </Match>
        <Match when={inline._tag === 'scripture'}>
          {() => {
            if (inline._tag !== 'scripture') return <></>;
            // A scripture reference already carries link semantics, which is
            // also why §4.6 keeps the phrase layer out of one.
            return (
              <a
                class="bible-inline-reference"
                href={`/search?q=${encodeURIComponent(inline.reference)}`}
              >
                {inline.text}
              </a>
            );
          }}
        </Match>
        <Match when={inline._tag === 'citation'}>
          {() => {
            if (inline._tag !== 'citation') return <></>;
            // Both halves are load-bearing: the compiler verified this exact
            // quote appears at this exact refcode (§3.4 step 6), so the refcode
            // is rendered beside the quote rather than hidden behind it.
            return (
              <>
                <q>{inline.text}</q> <span class="bible-refcode">{inline.refcode}</span>
              </>
            );
          }}
        </Match>
        <Match when={inline._tag === 'link'}>
          {() => {
            if (inline._tag !== 'link') return <></>;
            return <a href={inline.href}>{inline.text}</a>;
          }}
        </Match>
      </Switch>
    )}
  </For>
);

export const WikiBlocks = (props: { readonly blocks: readonly Block[] }) => (
  <For each={props.blocks}>
    {(block) => (
      <Switch>
        <Match when={block._tag === 'paragraph'}>
          {() => {
            if (block._tag !== 'paragraph') return <></>;
            return (
              <p>
                <InlineRun content={block.content} />
              </p>
            );
          }}
        </Match>
        <Match when={block._tag === 'heading'}>
          {() => {
            if (block._tag !== 'heading') return <></>;
            // The level is authored (2-4, per the schema's own check) and the
            // page's own `<h1>` is its title, so a heading here never competes
            // with it.
            return (
              <Switch>
                <Match when={block.level === 2}>
                  <h2>
                    <InlineRun content={block.content} />
                  </h2>
                </Match>
                <Match when={block.level === 3}>
                  <h3>
                    <InlineRun content={block.content} />
                  </h3>
                </Match>
                <Match when={block.level === 4}>
                  <h4>
                    <InlineRun content={block.content} />
                  </h4>
                </Match>
              </Switch>
            );
          }}
        </Match>
        <Match when={block._tag === 'blockquote'}>
          {() => {
            if (block._tag !== 'blockquote') return <></>;
            return (
              <blockquote>
                <InlineRun content={block.content} />
              </blockquote>
            );
          }}
        </Match>
        <Match when={block._tag === 'list'}>
          {() => {
            if (block._tag !== 'list') return <></>;
            const items = (
              <For each={block.items}>
                {(item) => (
                  <li>
                    <InlineRun content={item} />
                  </li>
                )}
              </For>
            );
            return (
              <Switch fallback={<ul>{items}</ul>}>
                <Match when={block.ordered}>
                  <ol>{items}</ol>
                </Match>
              </Switch>
            );
          }}
        </Match>
      </Switch>
    )}
  </For>
);
