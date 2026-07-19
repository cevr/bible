import {
  ColorMode,
  ReaderTypeface,
  type ReadingPreferencesPatch,
} from '@bible/core/reading-preferences';
import { A } from '@solidjs/router';
import { Errored, Loading, Show } from '@solidjs/web';
import { createSignal } from 'solid-js';
import { Effect, Schema } from 'effect';

import { useCapabilities } from '../application/capabilities-context.js';
import type { SettingsSection } from '../route/index.js';
import { failureCategory, useReadingData } from '../runtime/index.js';
import { Button, Popover } from '../ui/index.js';
import { ReaderFailure, ReaderLoading } from '../reading/index.js';

const settingsSections: ReadonlyArray<{ readonly id: SettingsSection; readonly label: string }> = [
  { id: 'reader', label: 'Reader' },
  { id: 'sync', label: 'Sync' },
  { id: 'data', label: 'Data' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'about', label: 'About' },
];

export interface SettingsProps {
  readonly section: SettingsSection;
}

export const Settings = (props: SettingsProps) => {
  const data = useReadingData();
  const capabilities = useCapabilities();
  const preferences = () => data.readingPreferences.get()();
  const [failure, setFailure] = createSignal<string>();
  const [saving, setSaving] = createSignal(false);
  const [dataStatus, setDataStatus] = createSignal<string>();
  const [dataFailure, setDataFailure] = createSignal<string>();

  const failDataOperation = (operation: string, cause: unknown): void => {
    console.error(
      `[settings] operation-failed operation=${operation} category=${failureCategory(cause)}`,
    );
    setDataStatus(undefined);
    setDataFailure(cause instanceof Error ? cause.message : String(cause));
  };

  const exportLibrary = (): void => {
    const fileExport = capabilities.fileExport;
    if (fileExport === undefined) return;
    setDataFailure(undefined);
    setDataStatus('Preparing backup…');
    void data.dataPortability.export().then(
      (document) =>
        Effect.runPromise(
          fileExport.save({
            suggestedName: `bible-library-${new Date().toISOString().slice(0, 10)}.json`,
            contents: new TextEncoder().encode(document),
          }),
        ).then(
          () => setDataStatus('Backup saved.'),
          (cause: unknown) => failDataOperation('export', cause),
        ),
      (cause: unknown) => failDataOperation('export', cause),
    );
  };

  const importLibrary = (): void => {
    const fileImport = capabilities.fileImport;
    if (fileImport === undefined) return;
    setDataFailure(undefined);
    setDataStatus('Choose a backup…');
    void Effect.runPromise(fileImport.select({ accept: ['application/json', '.json'] })).then(
      (files) => {
        const file = files[0];
        if (file === undefined) {
          setDataStatus(undefined);
          return;
        }
        setDataStatus(`Importing ${file.name}…`);
        void data.dataPortability.import(new TextDecoder().decode(file.contents)).then(
          ({ imported }) => setDataStatus(`Imported ${String(imported)} library records.`),
          (cause: unknown) => failDataOperation('import', cause),
        );
      },
      (cause: unknown) => failDataOperation('import', cause),
    );
  };

  const patch = (value: ReadingPreferencesPatch) => {
    setSaving(true);
    setFailure(undefined);
    void data.readingPreferences.mutate({ patch: value }).then(
      () => setSaving(false),
      (cause: unknown) => {
        console.error(
          `[settings] mutation-failed operation=reading-preferences category=${failureCategory(cause)}`,
        );
        setFailure(cause instanceof Error ? cause.message : String(cause));
        setSaving(false);
      },
    );
  };

  return (
    <article class="bible-library bible-settings">
      <header class="bible-reader__heading bible-library__heading">
        <p class="bible-reader__eyebrow">A quiet room for the text</p>
        <h1>Settings</h1>
      </header>
      <nav class="bible-subnav" aria-label="Settings sections">
        {settingsSections.map((section) => (
          <A
            href={`/settings/${section.id}`}
            aria-current={props.section === section.id ? 'page' : undefined}
          >
            {section.label}
          </A>
        ))}
      </nav>
      <Errored fallback={(error) => <ReaderFailure error={error()} />}>
        <Loading fallback={<ReaderLoading label="Loading settings" />}>
          <Show when={props.section === 'reader'}>
            <section class="bible-settings__section" aria-labelledby="reader-settings-title">
              <div>
                <p class="bible-reader__eyebrow">Reading display</p>
                <h2 id="reader-settings-title">Make the page yours</h2>
                <p>These choices follow you between the web and desktop readers.</p>
              </div>
              <label>
                <span>Reading theme</span>
                <select
                  value={preferences().colorMode}
                  onChange={(event) =>
                    patch({
                      colorMode: Schema.decodeUnknownSync(ColorMode)(event.currentTarget.value),
                    })
                  }
                >
                  <option value="system">Follow system</option>
                  <option value="light">Light</option>
                  <option value="sepia">Sepia</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label>
                <span>Typeface</span>
                <select
                  value={preferences().readerTypeface}
                  onChange={(event) =>
                    patch({
                      readerTypeface: Schema.decodeUnknownSync(ReaderTypeface)(
                        event.currentTarget.value,
                      ),
                    })
                  }
                >
                  <option value="crimson-pro">Crimson Pro</option>
                  <option value="lora">Lora</option>
                  <option value="literata">Literata</option>
                  <option value="eb-garamond">EB Garamond</option>
                  <option value="georgia">Georgia</option>
                  <option value="system-serif">System serif</option>
                  <option value="source-sans-3">Source Sans</option>
                  <option value="system-sans">System sans</option>
                  <option value="system-mono">System mono</option>
                </select>
              </label>
              <RangeSetting
                label="Text size"
                value={preferences().fontSizePx}
                minimum={14}
                maximum={32}
                suffix="px"
                update={(fontSizePx) => patch({ fontSizePx })}
              />
              <RangeSetting
                label="Line height"
                value={preferences().lineHeightRatio}
                minimum={1}
                maximum={2.4}
                step={0.05}
                update={(lineHeightRatio) => patch({ lineHeightRatio })}
              />
              <RangeSetting
                label="Reading measure"
                value={preferences().measureCh}
                minimum={40}
                maximum={120}
                suffix="ch"
                update={(measureCh) => patch({ measureCh })}
              />
              <fieldset class="bible-settings__choices">
                <legend>Scripture layout</legend>
                {(['verse', 'paragraph'] as const).map((layout) => (
                  <label>
                    <input
                      type="radio"
                      name="bible-layout"
                      checked={preferences().bibleLayout === layout}
                      onChange={() => patch({ bibleLayout: layout })}
                    />
                    <span>{layout === 'verse' ? 'One verse at a time' : 'Natural paragraphs'}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset class="bible-settings__choices">
                <legend>Study detail</legend>
                <ToggleSetting
                  label="Strong’s numbers"
                  checked={preferences().showStrongs}
                  update={(showStrongs) => patch({ showStrongs })}
                />
                <ToggleSetting
                  label="Margin notes"
                  checked={preferences().showMarginNotes}
                  update={(showMarginNotes) => patch({ showMarginNotes })}
                />
                <ToggleSetting
                  label="Cross-references"
                  checked={preferences().showCrossReferences}
                  update={(showCrossReferences) => patch({ showCrossReferences })}
                />
              </fieldset>
              <Show when={saving()}>
                <p class="bible-form-status" role="status">
                  Saving…
                </p>
              </Show>
              <Show when={failure()}>
                {(message) => (
                  <p class="bible-form-status bible-form-status--error" role="alert">
                    {message()}
                  </p>
                )}
              </Show>
            </section>
          </Show>
          <Show when={props.section === 'sync'}>
            <section class="bible-settings__section bible-settings__notice">
              <div>
                <p class="bible-reader__eyebrow">Local first</p>
                <h2>Your reading never waits for a network</h2>
                <p>
                  Changes commit to this device first. The shared sync runtime journals them in
                  order and safely retries when a transport is available.
                </p>
              </div>
              <Popover label="How local-first sync works" trigger="How sync works">
                SQLite remains the source of truth. Each validated change updates local state and
                its durable journal together before the reading cache refreshes.
              </Popover>
            </section>
          </Show>
          <Show when={props.section === 'data'}>
            <section class="bible-settings__section bible-settings__notice">
              <div>
                <p class="bible-reader__eyebrow">Portable library</p>
                <h2>Import and export</h2>
                <p>
                  Save a versioned copy of your preferences, annotations, collections, plans, and
                  memory practice. Importing merges those records into this library.
                </p>
              </div>
              <div class="bible-settings__data-actions">
                <Button onClick={exportLibrary} disabled={capabilities.fileExport === undefined}>
                  Export library
                </Button>
                <Button onClick={importLibrary} disabled={capabilities.fileImport === undefined}>
                  Import backup
                </Button>
              </div>
              <Show when={dataStatus()}>
                {(message) => (
                  <p class="bible-form-status" role="status">
                    {message()}
                  </p>
                )}
              </Show>
              <Show when={dataFailure()}>
                {(message) => (
                  <p class="bible-form-status bible-form-status--error" role="alert">
                    {message()}
                  </p>
                )}
              </Show>
            </section>
          </Show>
          <Show when={props.section === 'shortcuts'}>
            <section class="bible-settings__section">
              <div>
                <p class="bible-reader__eyebrow">Keyboard</p>
                <h2>Move without leaving the text</h2>
              </div>
              <dl class="bible-shortcuts">
                <div>
                  <dt>Search</dt>
                  <dd>
                    <kbd>/</kbd>
                  </dd>
                </div>
                <div>
                  <dt>Close the current layer</dt>
                  <dd>
                    <kbd>Esc</kbd>
                  </dd>
                </div>
                <div>
                  <dt>Move through controls</dt>
                  <dd>
                    <kbd>Tab</kbd>
                  </dd>
                </div>
              </dl>
            </section>
          </Show>
          <Show when={props.section === 'about'}>
            <SettingsNotice
              eyebrow="The Word"
              title="A minimal, local-first reading library"
              body="One Solid application, one Effect runtime model, and the same durable SQLite state on web and desktop."
            />
          </Show>
        </Loading>
      </Errored>
    </article>
  );
};

const RangeSetting = (props: {
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly step?: number;
  readonly suffix?: string;
  readonly update: (value: number) => void;
}) => (
  <label class="bible-range-setting">
    <span>
      {props.label} <output>{`${String(props.value)}${props.suffix ?? ''}`}</output>
    </span>
    <input
      type="range"
      min={props.minimum}
      max={props.maximum}
      step={props.step ?? 1}
      value={props.value}
      onChange={(event) => props.update(event.currentTarget.valueAsNumber)}
    />
  </label>
);

const ToggleSetting = (props: {
  readonly label: string;
  readonly checked: boolean;
  readonly update: (checked: boolean) => void;
}) => (
  <label>
    <input
      type="checkbox"
      checked={props.checked}
      onChange={(event) => props.update(event.currentTarget.checked)}
    />
    <span>{props.label}</span>
  </label>
);

const SettingsNotice = (props: {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
}) => (
  <section class="bible-settings__section bible-settings__notice">
    <div>
      <p class="bible-reader__eyebrow">{props.eyebrow}</p>
      <h2>{props.title}</h2>
      <p>{props.body}</p>
    </div>
    <Button disabled>Not available in this host</Button>
  </section>
);
