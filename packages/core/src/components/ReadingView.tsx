import { useEffect, useRef, useState } from 'preact/hooks';
import type { Article, Source } from '../types.js';
import { useRelativeTime } from '../hooks/useRelativeTime.js';
import { getProgress, saveProgress, purgeProgress } from '../readingProgress.js';
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
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ url: article.url, title: article.title }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(article.url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const readingMins = (() => {
    const words = article.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    if (words < 50) return null;
    return Math.max(1, Math.ceil(words / 200));
  })();

  // Close on Escape + focus trap; return focus to the triggering element on close
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
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
    return () => {
      window.removeEventListener('keydown', handler);
      trigger?.focus();
    };
  }, [onClose]);

  // Restore saved scroll position, then save on scroll (debounced)
  useEffect(() => {
    purgeProgress();
    const el = overlayRef.current;
    if (!el) return;

    const saved = getProgress(article.id);
    if (saved !== null && saved > 0) {
      // Defer until content has painted
      const raf = requestAnimationFrame(() => {
        el.scrollTop = saved * (el.scrollHeight - el.clientHeight);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [article.id]);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const max = el.scrollHeight - el.clientHeight;
        if (max > 0) saveProgress(article.id, el.scrollTop / max);
      }, 300);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); clearTimeout(timer); };
  }, [article.id]);

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
            <button
              class={`${styles.shareBtn} ${copied ? styles.shareBtnActive : ''}`}
              onClick={handleShare}
              aria-label={copied ? 'Link copied' : 'Share article'}
              title={copied ? 'Copied!' : 'Share'}
            >
              {copied ? '✓ Copied' : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true" class={styles.shareBtnIcon}>
                    <circle cx="18" cy="5" r="3"/>
                    <circle cx="6" cy="12" r="3"/>
                    <circle cx="18" cy="19" r="3"/>
                    <line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/>
                    <line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/>
                  </svg>
                  Share
                </>
              )}
            </button>
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
