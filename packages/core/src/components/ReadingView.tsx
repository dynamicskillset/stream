import { useEffect, useRef, useState } from 'preact/hooks';
import type { Article, Source } from '../types.js';
import { useRelativeTime } from '../hooks/useRelativeTime.js';
import { getProgress, saveProgress, purgeProgress } from '../readingProgress.js';
import styles from './ReadingView.module.css';

function IconArrowLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function IconHeartFilled() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  );
}

function IconHeartOutline() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  );
}

function IconExternalLink() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  );
}

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
            <IconArrowLeft /> Stream
          </button>
          <div class={styles.toolbarRight}>
            <button
              class={`${styles.shareBtn} ${copied ? styles.shareBtnActive : ''}`}
              onClick={handleShare}
              aria-label={copied ? 'Link copied' : 'Share article'}
              title={copied ? 'Copied!' : 'Share'}
            >
              {copied ? (
                <><IconCheck /> Copied</>
              ) : (
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
                {isSaved ? <IconHeartFilled /> : <IconHeartOutline />}
              </button>
            )}
            <a
              class={styles.externalLink}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open original <IconExternalLink />
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
