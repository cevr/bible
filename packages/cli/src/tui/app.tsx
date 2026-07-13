import type { EGWLocation } from '@bible/core/egw';
import { render, useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/solid';
import { createSignal, Match, Show, Switch } from 'solid-js';

import type { ReaderReference } from '../app/reader-reference.js';
import { isRoute, Route } from '../app/route.js';
import { ToolsPalette } from './components/shared/tools-palette.js';
import { BibleProvider } from './context/bible.js';
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
import { getAppRuntime, RuntimeProvider, type AppRuntime } from './lib/index.js';
import { BibleView } from './routes/bible.js';
import { EGWView } from './routes/egw.js';
import { MessagesView } from './routes/messages.js';
import { SabbathSchoolView } from './routes/sabbath-school.js';
import { StudiesView } from './routes/studies.js';

// Re-export useExit for components that need it
export { useExit } from './context/exit.js';
// Re-export router hooks
export { useRouter } from './context/router.js';
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
interface AppProps {
  initialRef?: ReaderReference;
  /** Open the EGW reader, optionally at a parsed location. */
  initialEgw?: true | EGWLocation;
  model?: ModelService | null;
  runtime: AppRuntime;
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

  const currentEgwLocation = () => {
    const current = route();
    return isRoute.egw(current) ? current.ref : undefined;
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
                          <EGWNavigationProvider initialRef={currentEgwLocation()}>
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
function AppWithRuntime(props: AppProps & { runtime: AppRuntime }) {
  // Determine initial route based on props
  const initialRoute = props.initialEgw
    ? Route.egw(props.initialEgw === true ? undefined : props.initialEgw)
    : props.initialRef
      ? Route.bible(props.initialRef)
      : Route.bible();

  return (
    <RuntimeProvider runtime={props.runtime}>
      <BibleProvider>
        <RouterProvider initialRoute={initialRoute}>
          <AppWithTheme {...props} />
        </RouterProvider>
      </BibleProvider>
    </RuntimeProvider>
  );
}

// Export App for testing
export function App(props: AppProps) {
  return <AppWithRuntime {...props} runtime={props.runtime} />;
}

export interface TuiOptions {
  initialRef?: ReaderReference;
  /** Open the EGW reader, optionally at a parsed location. */
  initialEgw?: true | EGWLocation;
  model?: ModelService | null;
}

export async function tui(options?: TuiOptions) {
  const runtime = await getAppRuntime();
  await render(
    () => (
      <App
        runtime={runtime}
        initialRef={options?.initialRef}
        initialEgw={options?.initialEgw}
        model={options?.model}
      />
    ),
    {
      exitOnCtrlC: false,
    },
  );
}
