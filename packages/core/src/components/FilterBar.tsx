import type { Category } from '../types.js';
import styles from './FilterBar.module.css';

interface FilterBarProps {
  categories: Category[];
  activeCategory: string | null;
  unreadOnly: boolean;
  savedOnly: boolean;
  onCategory: (id: string | null) => void;
  onUnreadOnly: (v: boolean) => void;
  onSavedOnly: (v: boolean) => void;
}

export function FilterBar({
  categories,
  activeCategory,
  unreadOnly,
  savedOnly,
  onCategory,
  onUnreadOnly,
  onSavedOnly,
}: FilterBarProps) {
  const hasCats = categories.length > 0;

  return (
    <div class={styles.bar}>
      {hasCats && (
        <div class={styles.cats}>
          <button
            class={`${styles.pill} ${activeCategory === null ? styles.active : ''}`}
            onClick={() => onCategory(null)}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              class={`${styles.pill} ${activeCategory === cat.id ? styles.active : ''}`}
              onClick={() => onCategory(activeCategory === cat.id ? null : cat.id)}
            >
              {cat.title}
            </button>
          ))}
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
