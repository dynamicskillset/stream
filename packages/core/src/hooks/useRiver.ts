import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { ScoredArticle } from '../riverEngine.js';
import type { Article } from '../types.js';

interface DismissedItem {
  scored: ScoredArticle;
  atIndex: number;
  timerId: ReturnType<typeof setTimeout>;
}

export interface PendingUndo {
  article: Article;
}

export interface RiverHook {
  items: ScoredArticle[];
  focusedIndex: number;
  pendingUndo: PendingUndo | null;
  dismiss: (id: string) => void;
  save: (id: string) => void;
  undo: () => void;
}

export function useRiver(initialItems: ScoredArticle[]): RiverHook {
  const [items, setItems] = useState<ScoredArticle[]>(initialItems);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [pendingUndo, setPendingUndo] = useState<DismissedItem | null>(null);

  // Stale-ref: always holds current state for use inside stable callbacks
  const stateRef = useRef({ items, focusedIndex, pendingUndo });
  useEffect(() => {
    stateRef.current = { items, focusedIndex, pendingUndo };
  });

  const dismiss = useCallback((id: string) => {
    const { items: current, pendingUndo: existing } = stateRef.current;

    const atIndex = current.findIndex(s => s.article.id === id);
    if (atIndex === -1) return;

    const dismissed = current[atIndex];

    // Cancel any in-flight undo
    if (existing) clearTimeout(existing.timerId);

    setItems(current.filter((_, i) => i !== atIndex));

    setFocusedIndex(fi => {
      if (fi === -1) return -1;
      const newLen = current.length - 1;
      return fi >= newLen ? Math.max(0, newLen - 1) : fi;
    });

    const timerId = setTimeout(() => setPendingUndo(null), 5_000);
    setPendingUndo({ scored: dismissed, atIndex, timerId });
  }, []);

  const save = useCallback((id: string) => {
    // TODO: Phase 1 — call adapter.setArticleStarred
    console.log('[stream] saved:', id);
  }, []);

  const undo = useCallback(() => {
    const existing = stateRef.current.pendingUndo;
    if (!existing) return;

    clearTimeout(existing.timerId);
    setPendingUndo(null);

    setItems(prev => {
      const next = [...prev];
      next.splice(existing.atIndex, 0, existing.scored);
      return next;
    });
  }, []);

  // Keyboard navigation — single stable listener via stale-ref pattern
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches('input, textarea, select, [contenteditable]')) return;

      const { items: cur, focusedIndex: fi } = stateRef.current;

      switch (e.key) {
        case 'j':
          e.preventDefault();
          setFocusedIndex(prev =>
            prev === -1 ? 0 : Math.min(prev + 1, cur.length - 1)
          );
          break;
        case 'k':
          e.preventDefault();
          setFocusedIndex(prev =>
            Math.max(0, prev === -1 ? 0 : prev - 1)
          );
          break;
        case 'Enter':
        case 'o':
          if (fi >= 0 && fi < cur.length) {
            e.preventDefault();
            window.open(cur[fi].article.url, '_blank', 'noopener,noreferrer');
          }
          break;
        case 'd':
          if (fi >= 0 && fi < cur.length) {
            e.preventDefault();
            dismiss(cur[fi].article.id);
          }
          break;
        case 's':
          if (fi >= 0 && fi < cur.length) {
            e.preventDefault();
            save(cur[fi].article.id);
          }
          break;
        case 'z':
          e.preventDefault();
          undo();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dismiss, save, undo]);

  return {
    items,
    focusedIndex,
    pendingUndo: pendingUndo ? { article: pendingUndo.scored.article } : null,
    dismiss,
    save,
    undo,
  };
}
