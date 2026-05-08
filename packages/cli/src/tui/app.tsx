import { isRoute, Route } from '@bible/core/app';
import type { EGWReference } from '@bible/core/app';
import { render, useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/solid';
import type { ManagedRuntime } from 'effect';
import { createResource, createSignal, Match, Show, Switch } from 'solid-js';

import type { Reference } from '../data/bible/types.js';
import { ToolsPalette } from './components/shared/tools-palette.js';
import { BibleProvider } from './context/bible.js';
import { ClientProvider } from './context/client.js';
import { DisplayProvider } from './context/display.js';
import { EGWNavigationProvider } from './context/egw-navigation.js';
import { EGWProvider } from './context/egw.js';
import { ExitProvider } from './context/exit.js';
import { ModelProvider, type ModelService } from './context/model.js';
import { NavigationProvider } from './context/navigation.js';
import { OverlayProvider, useOverlay } from './context/overlay.js';
import { RouterProvider, useRouter } from './context/router.js';
import { SearchProvider } from './context/search.js';
import { StudyDataProvider } from './context/study-data.js';
import { ThemeProvider, useTheme } from './context/theme.js';
import { WordModeProvider } from './context/word-mode.js';
import { getAppRuntime, RuntimeProvider, type AppServices } from './lib/index.js';
import { BibleView } from './routes/bible.js';
import { EGWView } from './routes/egw.js';
import { MessagesView } from './routes/messages.js';
import { SabbathSchoolView } from './routes/sabbath-school.js';
import { StudiesView } from './routes/studies.js';

// Re-export useExit for components that need it
export { useExit } from './context/exit.js';
// Re-export router hooks
export { useRouter, useRoute } from './context/router.js';
// Re-export runtime hooks for components using Effect
export {
  useAppRuntime,
  useRuntime,
  useEffectRunner,
  Result,
  isSuccess,
  isFailure,
  isInitial,
  isLoading,
  match,
} from './lib/index.js';
// Re-export client hooks
export {
  useClient,
  useBibleClient,
  useEGWClient,
  type BibleClient,
  type EGWClient,
} from './context/client.js';

interface AppProps {
  initialRef?: Reference;
  /** EGW reference. Pass empty object {} to open EGW reader without specific ref */
  initialEgwRef?: Partial<EGWReference>;
  model?: ModelService | null;
}

/**
 * Global keyboard handler component.
 * Must be inside OverlayProvider to access overlay state.
 */
function GlobalKeyboardHandler(props: {
  isToolsPaletteOpen: () => boolean;
  setIsToolsPaletteOpen: (v: boolean) => void;
  back: () => boolean;
  canGoBack: () => boolean;
  handleExit: () => void;
}) {
  const { isOpen: isOverlayOpen } = useOverlay();

  useKeyboard((key) => {
    // Skip global handlers if tools palette is open
    if (props.isToolsPaletteOpen()) return;

    // Skip all global handlers if any overlay is open (let routes handle their overlays)
    if (isOverlayOpen()) return;

    // Global: ESC to go back (only if no overlays and has history)
    if (key.name === 'escape') {
      if (props.canGoBack()) {
        props.back();
      }
      return;
    }

    // Global: Ctrl+C to exit
    if (key.ctrl && key.name === 'c') {
      props.handleExit();
    }

    // Global: Ctrl+T to open tools palette
    if (key.ctrl && key.name === 't') {
      props.setIsToolsPaletteOpen(true);
    }
  });

  return null;
}

function AppContent(props: AppProps) {
  const { theme } = useTheme();
  const dimensions = useTerminalDimensions();
  const renderer = useRenderer();
  const {
    route,
    back,
    canGoBack,
    navigateToBible,
    navigateToMessages,
    navigateToSabbathSchool,
    navigateToStudies,
    navigateToEgw,
  } = useRouter();

  // Global tools palette state
  const [isToolsPaletteOpen, setIsToolsPaletteOpen] = createSignal(false);

  const handleExit = () => {
    renderer.destroy();
    process.exit(0);
  };

  const handleNavigateToRoute = (routeName: string) => {
    switch (routeName) {
      case 'bible':
        navigateToBible();
        break;
      case 'messages':
        navigateToMessages();
        break;
      case 'sabbath-school':
        navigateToSabbathSchool();
        break;
      case 'studies':
        navigateToStudies();
        break;
      case 'egw':
        navigateToEgw();
        break;
    }
  };

  return (
    <NavigationProvider initialRef={props.initialRef}>
      <SearchProvider>
        <DisplayProvider>
          <OverlayProvider>
            <StudyDataProvider>
              <WordModeProvider>
                <ExitProvider onExit={handleExit}>
                  <GlobalKeyboardHandler
                    isToolsPaletteOpen={isToolsPaletteOpen}
                    setIsToolsPaletteOpen={setIsToolsPaletteOpen}
                    back={back}
                    canGoBack={canGoBack}
                    handleExit={handleExit}
                  />
                  <box
                    width={dimensions().width}
                    height={dimensions().height}
                    flexDirection="column"
                    backgroundColor={theme().background}
                  >
                    <Switch>
                      <Match when={isRoute.bible(route())}>
                        <BibleView onNavigateToRoute={handleNavigateToRoute} />
                      </Match>
                      <Match when={isRoute.messages(route())}>
                        <MessagesView onBack={() => back() || navigateToBible()} />
                      </Match>
                      <Match when={isRoute.sabbathSchool(route())}>
                        <SabbathSchoolView onBack={() => back() || navigateToBible()} />
                      </Match>
                      <Match when={isRoute.studies(route())}>
                        <StudiesView onBack={() => back() || navigateToBible()} />
                      </Match>
                      <Match when={isRoute.egw(route())}>
                        <EGWProvider>
                          <EGWNavigationProvider
                            initialRef={
                              isRoute.egw(route())
                                ? (
                                    route() as {
                                      _tag: 'egw';
                                      ref?: EGWReference;
                                    }
                                  ).ref
                                : undefined
                            }
                          >
                            <EGWView
                              onBack={() => {
                                // Only go back if there's history, otherwise stay
                                if (canGoBack()) {
                                  back();
                                }
                              }}
                            />
                          </EGWNavigationProvider>
                        </EGWProvider>
                      </Match>
                    </Switch>

                    {/* Global Tools Palette */}
                    <Show when={isToolsPaletteOpen()}>
                      <box
                        position="absolute"
                        top={Math.floor(dimensions().height / 6)}
                        left={Math.floor((dimensions().width - 50) / 2)}
                      >
                        <ToolsPalette
                          onClose={() => setIsToolsPaletteOpen(false)}
                          onNavigateToRoute={handleNavigateToRoute}
                        />
                      </box>
                    </Show>
                  </box>
                </ExitProvider>
              </WordModeProvider>
            </StudyDataProvider>
          </OverlayProvider>
        </DisplayProvider>
      </SearchProvider>
    </NavigationProvider>
  );
}

// Wrapper that provides ThemeProvider with renderer access
function AppWithTheme(props: AppProps) {
  const renderer = useRenderer();

  return (
    <ThemeProvider renderer={renderer}>
      <ModelProvider model={props.model ?? null}>
        <AppContent {...props} />
      </ModelProvider>
    </ThemeProvider>
  );
}

/**
 * App with runtime wrapper
 *
 * Loads the centralized Effect runtime and provides it to the tree.
 * Uses RuntimeProvider from the gent pattern.
 */
function AppWithRuntime(
  props: AppProps & { runtime: ManagedRuntime.ManagedRuntime<AppServices, unknown> },
) {
  // Determine initial route based on props
  // initialEgwRef can be {} to indicate "go to EGW" without a specific reference
  const initialRoute = props.initialEgwRef
    ? Route.egw(props.initialEgwRef.bookCode ? (props.initialEgwRef as EGWReference) : undefined)
    : props.initialRef
      ? Route.bible({
          book: props.initialRef.book,
          chapter: props.initialRef.chapter,
          verse: props.initialRef.verse,
        })
      : Route.bible();

  return (
    <RuntimeProvider runtime={props.runtime}>
      <ClientProvider>
        <BibleProvider>
          <RouterProvider initialRoute={initialRoute}>
            <AppWithTheme {...props} />
          </RouterProvider>
        </BibleProvider>
      </ClientProvider>
    </RuntimeProvider>
  );
}

// Export App for testing
export function App(props: AppProps) {
  // Load runtime asynchronously
  const [runtime] = createResource(getAppRuntime);

  return (
    <Show
      when={runtime()}
      fallback={
        <box>
          <text>Loading...</text>
        </box>
      }
    >
      {(rt) => <AppWithRuntime {...props} runtime={rt()} />}
    </Show>
  );
}

export interface TuiOptions {
  initialRef?: Reference;
  /** EGW reference. Pass empty object {} to open EGW reader without specific ref */
  initialEgwRef?: Partial<EGWReference>;
  model?: ModelService | null;
}

export async function tui(options?: TuiOptions) {
  await render(
    () => (
      <App
        initialRef={options?.initialRef}
        initialEgwRef={options?.initialEgwRef}
        model={options?.model}
      />
    ),
    {
      exitOnCtrlC: false,
    },
  );
}
