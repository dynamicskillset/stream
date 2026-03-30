import { useCallback, useEffect, useRef } from 'preact/hooks';
import type { ScoredArticle } from '../riverEngine.js';
import type { Source, Article } from '../types.js';
import { RiverCard } from './RiverCard.js';
import { UndoToast } from './UndoToast.js';
import styles from './River.module.css';

interface RiverProps {
  items: ScoredArticle[];
  focusedIndex: number;
  sourceMap: Map<string, Source>;
  savedIds: Set<string>;
  pendingUndo: { article: Article } | null;
  emptyMessage?: string;
  copiedId?: string | null;
  onDismiss: (id: string) => void;
  onSave: (id: string) => void;
  onOpen: (id: string) => void;
  onUndo: () => void;
  onMute: (sourceId: string, mutedUntil: number) => void;
}

export function River({
  items,
  focusedIndex,
  sourceMap,
  savedIds,
  pendingUndo,
  emptyMessage = 'The stream is quiet.',
  copiedId,
  onDismiss,
  onSave,
  onOpen,
  onUndo,
  onMute,
}: RiverProps) {
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const setCardRef = useCallback((index: number) => (el: HTMLElement | null) => {
    cardRefs.current[index] = el;
  }, []);

  // Scroll focused card into view on keyboard navigation
  useEffect(() => {
    if (focusedIndex >= 0 && cardRefs.current[focusedIndex]) {
      cardRefs.current[focusedIndex]!.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [focusedIndex]);

  if (items.length === 0) {
    return (
      <div class={styles.river}>
        <h1 class={styles.srOnly}>Stream</h1>
        <p class={styles.empty}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div class={styles.river} role="feed" aria-label="Article stream">
      <h1 class={styles.srOnly}>Stream</h1>
      {items.map((scored, index) => {
        const source = sourceMap.get(scored.article.sourceId);
        if (!source) return null;

        return (
          <RiverCard
            key={scored.article.id}
            scored={scored}
            source={source}
            isFocused={index === focusedIndex}
            isSaved={savedIds.has(scored.article.id)}
            isCopied={copiedId === scored.article.id}
            onDismiss={onDismiss}
            onSave={onSave}
            onOpen={onOpen}
            onMute={onMute}
            cardRef={setCardRef(index)}
          />
        );
      })}

      {pendingUndo && (
        <UndoToast onUndo={onUndo} />
      )}
    </div>
  );
}
