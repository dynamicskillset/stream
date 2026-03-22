import { useEffect, useRef } from 'preact/hooks';
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
  onDismiss: (id: string) => void;
  onSave: (id: string) => void;
  onOpen: (id: string) => void;
  onUndo: () => void;
}

export function River({
  items,
  focusedIndex,
  sourceMap,
  savedIds,
  pendingUndo,
  onDismiss,
  onSave,
  onOpen,
  onUndo,
}: RiverProps) {
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

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
        <p class={styles.empty}>The river is quiet.</p>
      </div>
    );
  }

  return (
    <div class={styles.river} role="feed" aria-label="Article river">
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
            onDismiss={onDismiss}
            onSave={onSave}
            onOpen={onOpen}
            cardRef={el => { cardRefs.current[index] = el; }}
          />
        );
      })}

      {pendingUndo && (
        <UndoToast
          articleTitle={pendingUndo.article.title}
          onUndo={onUndo}
        />
      )}
    </div>
  );
}
