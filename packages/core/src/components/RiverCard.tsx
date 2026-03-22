import type { ScoredArticle } from '../riverEngine.js';
import type { Source } from '../types.js';
import { useRelativeTime } from '../hooks/useRelativeTime.js';
import { VISIBILITY_THRESHOLD } from '../riverEngine.js';
import styles from './RiverCard.module.css';

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function makePreview(html: string): string {
  const text = stripHtml(html);
  if (text.length <= 100) return text;
  return text.slice(0, 100).replace(/\s\S*$/, '') + '\u2026';
}

// Maps score (0.05–1.0) to card-age (0.0 = fresh, 1.0 = near-threshold)
function scoreToAge(score: number): number {
  const age = 1 - (score - VISIBILITY_THRESHOLD) / (1 - VISIBILITY_THRESHOLD);
  return Math.max(0, Math.min(1, age));
}

interface RiverCardProps {
  scored: ScoredArticle;
  source: Source;
  isFocused: boolean;
  onDismiss: (id: string) => void;
  onSave: (id: string) => void;
  cardRef?: (el: HTMLElement | null) => void;
}

export function RiverCard({
  scored,
  source,
  isFocused,
  onDismiss,
  onSave,
  cardRef,
}: RiverCardProps) {
  const { article } = scored;
  const relTime = useRelativeTime(article.publishedAt);
  const cardAge = scoreToAge(scored.score);
  const preview = makePreview(article.content);

  const handleFaviconError = (e: Event) => {
    (e.target as HTMLImageElement).setAttribute('data-error', '');
  };

  return (
    <article
      ref={cardRef}
      class={styles.card}
      style={{ ['--card-age' as string]: cardAge.toFixed(3) } as never}
      aria-current={isFocused ? 'true' : undefined}
      aria-label={article.title}
    >
      <div class={styles.header}>
        <div class={styles.faviconWrap}>
          {source.faviconUrl ? (
            <img
              class={styles.favicon}
              src={source.faviconUrl}
              alt=""
              aria-hidden="true"
              width={16}
              height={16}
              onError={handleFaviconError}
            />
          ) : (
            <span class={styles.favicon} data-error="" />
          )}
          <span class={styles.faviconFallback} aria-hidden="true">
            {source.title.charAt(0)}
          </span>
        </div>

        <span class={styles.sourceName}>{source.title}</span>

        <time class={styles.time} dateTime={article.publishedAt.toISOString()}>
          {relTime}
        </time>

        <div class={styles.actions}>
          <button
            class={`${styles.actionBtn} ${styles.saveBtn}`}
            onClick={() => onSave(article.id)}
            aria-label="Save to Read Later"
            title="Save"
          >
            &#x2661;
          </button>
          <button
            class={`${styles.actionBtn} ${styles.dismissBtn}`}
            onClick={() => onDismiss(article.id)}
            aria-label="Dismiss article"
            title="Dismiss"
          >
            &times;
          </button>
        </div>
      </div>

      <a
        class={styles.titleLink}
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <h2 class={styles.title}>{article.title}</h2>
      </a>

      {preview && <p class={styles.preview}>{preview}</p>}
    </article>
  );
}
