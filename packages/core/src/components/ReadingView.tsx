import { useEffect, useRef } from 'preact/hooks';
import type { Article, Source } from '../types.js';
import { useRelativeTime } from '../hooks/useRelativeTime.js';
import styles from './ReadingView.module.css';

function sanitiseHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, form').forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
      if (['href', 'src', 'action'].includes(attr.name) && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  doc.querySelectorAll('img').forEach(img => img.setAttribute('loading', 'lazy'));
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
  const overlayRef = useRef<HTMLDivElement>(null);

  const readingMins = (() => {
    const words = article.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    if (words < 50) return null;
    return Math.max(1, Math.ceil(words / 200));
  })();

  // Close on Escape + focus trap
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'Tab' && overlayRef.current) {
        const focusable = overlayRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', handler);
    // Auto-focus first focusable element
    const first = overlayRef.current?.querySelector<HTMLElement>('button, [href]');
    first?.focus();
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleFaviconError = (e: Event) => {
    (e.target as HTMLImageElement).setAttribute('data-error', '');
  };

  const safe = sanitiseHtml(article.content);

  return (
    <div ref={overlayRef} class={styles.overlay} role="dialog" aria-modal="true" aria-label={article.title}>
      <div class={styles.inner}>
        <div class={styles.toolbar}>
          <button class={styles.backBtn} onClick={onClose} aria-label="Back to stream">
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
            {readingMins !== null && (
              <>
                <span class={styles.dot} aria-hidden="true">●</span>
                <span class={styles.time} aria-label={`${readingMins} minute read`}>
                  {readingMins} min read
                </span>
              </>
            )}
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
