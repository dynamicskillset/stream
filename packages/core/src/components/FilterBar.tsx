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
  // Show only categories with unread articles (plus the currently active one)
  const visibleCats = unreadByCategory
    ? categories.filter(cat =>
        (unreadByCategory.get(cat.id) ?? 0) > 0 || activeCategory === cat.id
      )
    : categories;

  const hasCats = visibleCats.length > 0;

  return (
    <div class={styles.bar}>
      {hasCats && (
        <div class={styles.catsWrap}>
          <div class={styles.cats}>
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
        </div>
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
