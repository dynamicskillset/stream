import styles from './UndoToast.module.css';

interface UndoToastProps {
  articleTitle: string;
  onUndo: () => void;
}

export function UndoToast({ articleTitle: _title, onUndo }: UndoToastProps) {
  return (
    <div class={styles.toast} role="status" aria-live="polite">
      <span class={styles.message}>Article released</span>
      <button class={styles.undoBtn} onClick={onUndo}>
        Undo
      </button>
      <div class={styles.countdown} aria-hidden="true" />
    </div>
  );
}
