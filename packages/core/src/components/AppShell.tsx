import type { ComponentChildren } from 'preact';
import type { ResolvedTheme } from '../hooks/useTheme.js';
import { version } from '../../package.json';
import styles from './AppShell.module.css';

// Inline SVG so stroke inherits currentColor — follows app theme, not OS preference
function StreamLogo({ class: cls }: { class?: string }) {
  return (
    <svg class={cls} viewBox="0 0 32 32" width={22} height={22} fill="none" aria-hidden="true">
      <defs>
        <clipPath id="wc"><circle cx="16" cy="16" r="13"/></clipPath>
      </defs>
      <circle cx="16" cy="16" r="14.5" stroke="currentColor" stroke-width="1.5"/>
      <g clip-path="url(#wc)" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
        <path d="M2 10 Q9 6 16 10 Q23 14 30 10"/>
        <path d="M2 16 Q9 12 16 16 Q23 20 30 16"/>
        <path d="M2 22 Q9 18 16 22 Q23 26 30 22"/>
      </g>
    </svg>
  );
}

const THEME_ICON: Record<ResolvedTheme, string> = {
  paper: '☽',
  ink:   '☀',
};
const THEME_LABEL: Record<ResolvedTheme, string> = {
  paper: 'Switch to dark mode',
  ink:   'Switch to light mode',
};

interface AppShellProps {
  theme: ResolvedTheme;
  onToggleTheme: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  onSettings?: () => void;
  inSettings?: boolean;
  onLogoClick?: () => void;
  paused?: boolean;
  onTogglePause?: () => void;
  children: ComponentChildren;
}

export function AppShell({
  theme,
  onToggleTheme,
  onRefresh,
  refreshing,
  onSettings,
  inSettings,
  onLogoClick,
  paused,
  onTogglePause,
  children,
}: AppShellProps) {
  return (
    <>
      <header class={styles.header}>
        <div class={styles.inner}>
          <div class={styles.brand}>
            <button
              class={styles.logoBtn}
              onClick={onLogoClick ?? undefined}
              aria-label={onLogoClick ? 'Back to stream' : undefined}
              title={onLogoClick ? 'Back to stream' : undefined}
              tabIndex={onLogoClick ? 0 : -1}
              style={onLogoClick ? undefined : { cursor: 'default' }}
            >
              <StreamLogo class={styles.logo} />
              <span class={styles.wordmark}>Stream</span>
            </button>
            <span class={styles.version}>{version}</span>
          </div>
          <div class={styles.controls}>
            {onTogglePause && (
              <button
                class={`${styles.themeBtn} ${paused ? styles.active : ''}`}
                onClick={onTogglePause}
                aria-label={paused ? 'Resume river (unpause)' : 'Pause river'}
                title={paused ? 'River paused — click to resume' : 'Pause river'}
              >
                {paused ? '▶' : '⏸'}
              </button>
            )}
            {onRefresh && (
              <button
                class={`${styles.themeBtn} ${refreshing ? styles.spinning : ''}`}
                onClick={onRefresh}
                disabled={refreshing}
                aria-label="Refresh articles"
                title="Refresh"
              >
                ↻
              </button>
            )}
            {onSettings && (
              <button
                class={`${styles.themeBtn} ${inSettings ? styles.active : ''}`}
                onClick={onSettings}
                aria-label={inSettings ? 'Back to stream' : 'Settings'}
                title={inSettings ? 'Back to stream' : 'Settings'}
              >
                ≋
              </button>
            )}
            <button
              class={styles.themeBtn}
              onClick={onToggleTheme}
              aria-label={THEME_LABEL[theme]}
              title={THEME_LABEL[theme]}
            >
              {THEME_ICON[theme]}
            </button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
