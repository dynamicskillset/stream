import type { ComponentChildren } from 'preact';
import type { ResolvedTheme } from '../hooks/useTheme.js';
import styles from './AppShell.module.css';

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
  children: ComponentChildren;
}

export function AppShell({
  theme,
  onToggleTheme,
  onRefresh,
  refreshing,
  children,
}: AppShellProps) {
  return (
    <>
      <header class={styles.header}>
        <div class={styles.inner}>
          <span class={styles.wordmark}>Stream</span>
          <div class={styles.controls}>
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
      {children}
    </>
  );
}
