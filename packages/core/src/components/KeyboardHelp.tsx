import { useEffect, useRef } from 'preact/hooks';
import styles from './KeyboardHelp.module.css';

const SHORTCUTS = [
  { key: 'j / k',       desc: 'Navigate down / up' },
  { key: 'Enter / o',   desc: 'Open article' },
  { key: 'b',           desc: 'Open in browser (new tab)' },
  { key: 'd',           desc: 'Dismiss article' },
  { key: 's',           desc: 'Save / star' },
  { key: 'z',           desc: 'Undo dismiss' },
  { key: 'Esc',         desc: 'Close reading view' },
  { key: '?',           desc: 'Show / hide this help' },
];

interface KeyboardHelpProps {
  onClose: () => void;
}

export function KeyboardHelp({ onClose }: KeyboardHelpProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && backdropRef.current) {
        const focusable = backdropRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', handler);
    const closeBtn = backdropRef.current?.querySelector<HTMLElement>('button');
    closeBtn?.focus();
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      class={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div class={styles.panel} onClick={e => e.stopPropagation()}>
        <div class={styles.header}>
          <h2 class={styles.title}>Keyboard shortcuts</h2>
          <button class={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <dl class={styles.list}>
          {SHORTCUTS.map(({ key, desc }) => (
            <div key={key} class={styles.row}>
              <dt class={styles.key}><kbd>{key}</kbd></dt>
              <dd class={styles.desc}>{desc}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
