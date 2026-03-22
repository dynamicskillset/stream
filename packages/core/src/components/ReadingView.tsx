import { useEffect } from 'preact/hooks';
import type { Article, Source } from '../types.js';
import { useRelativeTime } from '../hooks/useRelativeTime.js';
import styles from './ReadingView.module.css';

function sanitiseHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, form').forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
    }
  });
  return doc.body.innerHTML;
}

interface ReadingViewProps {
  article: Article;
  source?: Source;
  isSaved?: boolean;
  onSave?: () => void;
  onClose: () => void;
}

export function ReadingView({ article, source, isSaved, onSave, onClose }: ReadingViewProps) {
  const relTime = useRelativeTime(article.publishedAt);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleFaviconError = (e: Event) => {
    (e.target as HTMLImageElement).setAttribute('data-error', '');
  };

  const safe = sanitiseHtml(article.content);

  return (
    <div class={styles.overlay} role="dialog" aria-modal="true" aria-label={article.title}>
      <div class={styles.inner}>
        <div class={styles.toolbar}>
          <button class={styles.backBtn} onClick={onClose} aria-label="Back to river">
            ← Stream
          </button>
          <div class={styles.toolbarRight}>
            {onSave && (
              <button
                class={`${styles.saveBtn} ${isSaved ? styles.saveBtnActive : ''}`}
                onClick={onSave}
                aria-label={isSaved ? 'Saved' : 'Save to Read Later'}
                aria-pressed={isSaved}
              >
                {isSaved ? '\u2665' : '\u2661'}
              </button>
            )}
            <a
              class={styles.externalLink}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open original ↗
            </a>
          </div>
        </div>

        {source && (
          <div class={styles.meta}>
            {source.faviconUrl && (
              <img
                class={styles.favicon}
                src={source.faviconUrl}
                alt=""
                aria-hidden="true"
                width={14}
                height={14}
                onError={handleFaviconError}
              />
            )}
            <span class={styles.sourceName}>{source.title}</span>
            <span class={styles.dot} aria-hidden="true">●</span>
            <time class={styles.time} dateTime={article.publishedAt.toISOString()}>
              {relTime}
            </time>
          </div>
        )}

        <h1 class={styles.title}>{article.title}</h1>

        {safe ? (
          <div
            class={styles.body}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: safe }}
          />
        ) : (
          <p class={styles.noContent}>
            No content available. <a href={article.url} target="_blank" rel="noopener noreferrer">Read on the original site ↗</a>
          </p>
        )}
      </div>
    </div>
  );
}
