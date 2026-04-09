import { useEffect, useRef, useState } from 'preact/hooks';
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

function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1"/>
      <rect x="14" y="4" width="4" height="16" rx="1"/>
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

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
  // Announce background refresh completion to screen readers
  const prevRefreshing = useRef(refreshing);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (prevRefreshing.current === true && refreshing === false) {
      setAnnouncement('Stream updated');
      setTimeout(() => setAnnouncement(''), 1000);
    }
    prevRefreshing.current = refreshing;
  }, [refreshing]);

  return (
    <>
      <a href="#main-content" class={styles.skipLink}>Skip to content</a>
      <header class={styles.header}>
        <div class={styles.inner}>
          <div class={styles.brand}>
            <button
              class={`${styles.logoBtn} ${onLogoClick ? '' : styles.logoBtnStatic}`}
              onClick={onLogoClick ?? undefined}
              aria-label={onLogoClick ? 'Back to stream' : undefined}
              title={onLogoClick ? 'Back to stream' : undefined}
              tabIndex={onLogoClick ? 0 : -1}
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
                {paused ? <IconPlay /> : <IconPause />}
              </button>
            )}
            {onRefresh && (
              <button
                class={styles.themeBtn}
                onClick={onRefresh}
                disabled={refreshing}
                aria-label="Refresh articles"
                title="Refresh"
              >
                <span class={refreshing ? styles.spinning : undefined}><IconRefresh /></span>
              </button>
            )}
            {onSettings && (
              <button
                class={`${styles.themeBtn} ${inSettings ? styles.active : ''}`}
                onClick={onSettings}
                aria-label={inSettings ? 'Back to stream' : 'Settings'}
                title={inSettings ? 'Back to stream' : 'Settings'}
              >
                <IconSettings />
              </button>
            )}
            <button
              class={styles.themeBtn}
              onClick={onToggleTheme}
              aria-label={THEME_LABEL[theme]}
              title={THEME_LABEL[theme]}
            >
              {theme === 'paper' ? <IconMoon /> : <IconSun />}
            </button>
          </div>
        </div>
      </header>
      {paused && (
        <div class={styles.pauseBanner}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <rect x="1.5" y="1" width="3.5" height="10" rx="1"/>
            <rect x="7" y="1" width="3.5" height="10" rx="1"/>
          </svg>
          River paused — articles are not fading
          <button class={styles.pauseBannerBtn} onClick={onTogglePause}>Resume</button>
        </div>
      )}
      <div aria-live="polite" aria-atomic="true" class={styles.srOnly}>{announcement}</div>
      <main id="main-content">{children}</main>
    </>
  );
}
