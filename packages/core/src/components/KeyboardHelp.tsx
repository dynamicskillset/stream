import { useEffect } from 'preact/hooks';
import styles from './KeyboardHelp.module.css';

const SHORTCUTS = [
  { key: 'j / k',       desc: 'Navigate down / up' },
  { key: 'Enter / o',   desc: 'Open article' },
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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
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
        <table class={styles.table}>
          <tbody>
            {SHORTCUTS.map(({ key, desc }) => (
              <tr key={key} class={styles.row}>
                <td class={styles.key}><kbd>{key}</kbd></td>
                <td class={styles.desc}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
