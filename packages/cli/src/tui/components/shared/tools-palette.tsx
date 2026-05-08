/**
 * Tools Palette Component
 *
 * Global palette for navigating between tools (EGW Library, Messages, etc.)
 * and changing themes. Opened with Ctrl+T from anywhere in the app.
 */

import { useModalKeyboard } from '../../hooks/use-modal-keyboard.js';
import { createSignal, For, Show } from 'solid-js';

import { useTheme } from '../../context/theme.js';

interface ToolsPaletteProps {
  onClose: () => void;
  onNavigateToRoute: (route: string) => void;
}

type PaletteMode = 'tools' | 'themes';

export function ToolsPalette(props: ToolsPaletteProps) {
  const { theme, themeName, setTheme, availableThemes } = useTheme();
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [mode, setMode] = createSignal<PaletteMode>('tools');

  const tools = () => [
    { label: 'Bible', description: 'Read the Bible', route: 'bible' },
    { label: 'EGW Library', description: 'Browse EGW writings', route: 'egw' },
    {
      label: 'Messages',
      description: 'Generate sermon messages',
      route: 'messages',
    },
    {
      label: 'Sabbath School',
      description: 'Process lesson outlines',
      route: 'sabbath-school',
    },
    { label: 'Studies', description: 'Create Bible studies', route: 'studies' },
    {
      label: 'Themes',
      description: `Current: ${themeName()}`,
      action: 'themes',
    },
  ];

  const themes = () => availableThemes();

  const currentItems = () => (mode() === 'tools' ? tools() : themes());

  const handleSelectTool = () => {
    const tool = tools()[selectedIndex()];
    if (tool) {
      if (tool.route) {
        props.onNavigateToRoute(tool.route);
        props.onClose();
      } else if (tool.action === 'themes') {
        setMode('themes');
        setSelectedIndex(themes().indexOf(themeName()));
      }
    }
  };

  const handleSelectTheme = () => {
    const themeName = themes()[selectedIndex()];
    if (themeName) {
      setTheme(themeName);
      props.onClose();
    }
  };

  useModalKeyboard((key) => {
    if (key.name === 'escape') {
      if (mode() === 'themes') {
        setMode('tools');
        setSelectedIndex(tools().findIndex((t) => t.action === 'themes'));
      } else {
        props.onClose();
      }
      return;
    }

    if (key.name === 'return') {
      if (mode() === 'tools') {
        handleSelectTool();
      } else {
        handleSelectTheme();
      }
      return;
    }

    // Left arrow to go back to tools from themes
    if (key.name === 'left' && mode() === 'themes') {
      setMode('tools');
      setSelectedIndex(tools().findIndex((t) => t.action === 'themes'));
      return;
    }

    // Right arrow to enter themes from Themes option
    if (key.name === 'right' && mode() === 'tools') {
      const tool = tools()[selectedIndex()];
      if (tool?.action === 'themes') {
        setMode('themes');
        setSelectedIndex(themes().indexOf(themeName()));
      }
      return;
    }

    if (key.name === 'up') {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (key.name === 'down') {
      const maxIndex = currentItems().length - 1;
      setSelectedIndex((i) => Math.min(maxIndex, i + 1));
      return;
    }

    // Number keys for quick select (tools mode only)
    if (mode() === 'tools') {
      const num = parseInt(key.name ?? '', 10);
      if (num >= 1 && num <= tools().length) {
        setSelectedIndex(num - 1);
        handleSelectTool();
      }
    }
  });

  return (
    <box
      flexDirection="column"
      border
      borderColor={theme().borderFocused}
      backgroundColor={theme().backgroundPanel}
      padding={1}
      width={50}
    >
      <text fg={theme().textHighlight} marginBottom={1}>
        <strong>{mode() === 'tools' ? 'Tools' : 'Themes'}</strong>
      </text>

      <Show when={mode() === 'tools'}>
        <For each={tools()}>
          {(tool, index) => (
            <box
              flexDirection="row"
              justifyContent="space-between"
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={index() === selectedIndex() ? theme().accent : undefined}
            >
              <text fg={index() === selectedIndex() ? theme().background : theme().text}>
                <span
                  style={{
                    fg: index() === selectedIndex() ? theme().background : theme().textMuted,
                  }}
                >
                  {index() + 1}.{' '}
                </span>
                {tool.label}
              </text>
              <text fg={index() === selectedIndex() ? theme().background : theme().textMuted}>
                {tool.description}
                {tool.action === 'themes' ? ' →' : ''}
              </text>
            </box>
          )}
        </For>
      </Show>

      <Show when={mode() === 'themes'}>
        <For each={themes()}>
          {(name, index) => {
            const isSelected = () => index() === selectedIndex();
            const isCurrent = name === themeName();

            return (
              <box
                flexDirection="row"
                justifyContent="space-between"
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={isSelected() ? theme().accent : undefined}
              >
                <text fg={isSelected() ? theme().background : theme().text}>{name}</text>
                <Show when={isCurrent}>
                  <text fg={isSelected() ? theme().background : theme().textMuted}>(current)</text>
                </Show>
              </box>
            );
          }}
        </For>
      </Show>

      <box height={1} marginTop={1}>
        <text fg={theme().textMuted}>
          <Show when={mode() === 'tools'}>
            <span style={{ fg: theme().accent }}>1-{tools().length}</span> select{'  '}
            <span style={{ fg: theme().accent }}>→</span> expand{'  '}
          </Show>
          <Show when={mode() === 'themes'}>
            <span style={{ fg: theme().accent }}>←</span> back{'  '}
          </Show>
          <span style={{ fg: theme().accent }}>Esc</span> close
        </text>
      </box>
    </box>
  );
}
