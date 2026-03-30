import { useRef, useState, useEffect } from 'preact/hooks';
import type { Category } from '../types.js';
import styles from './FilterBar.module.css';

interface FilterBarProps {
  categories: Category[];
  activeCategory: string | null;
  unreadOnly: boolean;
  savedOnly: boolean;
  unreadByCategory?: Map<string, number>;
  onCategory: (id: string | null) => void;
  onUnreadOnly: (v: boolean) => void;
  onSavedOnly: (v: boolean) => void;
}

export function FilterBar({
  categories,
  activeCategory,
  unreadOnly,
  savedOnly,
  unreadByCategory,
  onCategory,
  onUnreadOnly,
  onSavedOnly,
}: FilterBarProps) {
  const visibleCats = unreadByCategory
    ? categories.filter(cat =>
        (unreadByCategory.get(cat.id) ?? 0) > 0 || activeCategory === cat.id
      )
    : categories;

  const hasCats = visibleCats.length > 0;

  const catsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft]   = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScroll = () => {
    const el = catsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  };

  useEffect(() => {
    const el = catsRef.current;
    if (!el) return;
    updateScroll();
    el.addEventListener('scroll', updateScroll, { passive: true });
    const ro = new ResizeObserver(updateScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateScroll); ro.disconnect(); };
  }, [visibleCats]);

  const scrollBy = (dir: -1 | 1) =>
    catsRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });

  return (
    <div class={styles.bar}>
      {hasCats && (
        <nav aria-label="Filter by category" class={`${styles.catsWrap} ${canScrollLeft ? styles.fadeLeft : ''} ${canScrollRight ? styles.fadeRight : ''}`}>
          {canScrollLeft && (
            <button class={`${styles.scrollArrow} ${styles.scrollArrowLeft}`} onClick={() => scrollBy(-1)} aria-label="Scroll categories left">‹</button>
          )}
          <div ref={catsRef} class={styles.cats}>
            <button
              class={`${styles.pill} ${activeCategory === null ? styles.active : ''}`}
              onClick={() => onCategory(null)}
              aria-pressed={activeCategory === null}
            >
              All
            </button>
            {visibleCats.map(cat => (
              <button
                key={cat.id}
                class={`${styles.pill} ${activeCategory === cat.id ? styles.active : ''}`}
                onClick={() => onCategory(activeCategory === cat.id ? null : cat.id)}
                aria-pressed={activeCategory === cat.id}
              >
                {cat.title}
              </button>
            ))}
          </div>
          {canScrollRight && (
            <button class={`${styles.scrollArrow} ${styles.scrollArrowRight}`} onClick={() => scrollBy(1)} aria-label="Scroll categories right">›</button>
          )}
        </nav>
      )}
      <div class={`${styles.statusPills} ${hasCats ? '' : styles.solo}`}>
        <button
          class={`${styles.pill} ${unreadOnly ? styles.active : ''}`}
          onClick={() => onUnreadOnly(!unreadOnly)}
          aria-pressed={unreadOnly}
          title={unreadOnly ? 'Showing unread only — click to show all' : 'Show unread only'}
        >
          Unread
        </button>
        <button
          class={`${styles.pill} ${savedOnly ? styles.active : ''}`}
          onClick={() => onSavedOnly(!savedOnly)}
          aria-pressed={savedOnly}
          title={savedOnly ? 'Showing saved only — click to show all' : 'Show saved only'}
        >
          Saved
        </button>
      </div>
    </div>
  );
}
