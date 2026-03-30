import { useState } from 'preact/hooks';
import type { ScoredArticle } from '../riverEngine.js';
import type { Source } from '../types.js';
import { useRelativeTime } from '../hooks/useRelativeTime.js';
import { VISIBILITY_THRESHOLD } from '../riverEngine.js';
import { MUTE_DURATIONS } from '../mutedSources.js';
import styles from './RiverCard.module.css';

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function makePreview(html: string): string {
  const text = stripHtml(html);
  if (text.length <= 100) return text;
  return text.slice(0, 100).replace(/\s\S*$/, '') + '\u2026';
}

function readingMins(html: string): number | null {
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  if (words < 50) return null;
  return Math.max(1, Math.ceil(words / 200));
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
  isSaved: boolean;
  isCopied?: boolean;
  onDismiss: (id: string) => void;
  onSave: (id: string) => void;
  onOpen: (id: string) => void;
  onMute: (sourceId: string, mutedUntil: number) => void;
  cardRef?: (el: HTMLElement | null) => void;
}

export function RiverCard({
  scored,
  source,
  isFocused,
  isSaved,
  isCopied = false,
  onDismiss,
  onSave,
  onOpen,
  onMute,
  cardRef,
}: RiverCardProps) {
  const { article } = scored;
  const relTime = useRelativeTime(article.publishedAt);
  const cardAge = scoreToAge(scored.score);
  const preview = makePreview(article.content);
  const mins = readingMins(article.content);
  const [copied, setCopied] = useState(false);
  const [showMuteMenu, setShowMuteMenu] = useState(false);

  const handleFaviconError = (e: Event) => {
    (e.target as HTMLImageElement).setAttribute('data-error', '');
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ url: article.url, title: article.title }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(article.url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const showCopied = isCopied || copied;

  return (
    <article
      ref={cardRef}
      class={`${styles.card} ${showCopied ? styles.cardCopied : ''}`}
      style={{ ['--card-age' as string]: cardAge.toFixed(3) } as never}
      aria-current={isFocused ? 'true' : undefined}
      aria-label={article.title}
    >
      {showCopied && (
        <div class={styles.copiedBanner} aria-live="polite">✓ Link copied</div>
      )}
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
              loading="lazy"
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

        {mins !== null && (
          <span class={styles.readingTime} aria-label={`${mins} minute read`}>
            · {mins} min read
          </span>
        )}

        <div class={styles.actions}>
          {showMuteMenu ? (
            <div class={styles.muteMenu}>
              <span class={styles.muteLabel}>Mute source:</span>
              {MUTE_DURATIONS.map(({ label, ms }) => (
                <button
                  key={label}
                  class={`${styles.actionBtn} ${styles.muteDurationBtn}`}
                  onClick={() => { onMute(article.sourceId, Date.now() + ms); setShowMuteMenu(false); }}
                >
                  {label}
                </button>
              ))}
              <button
                class={`${styles.actionBtn} ${styles.dismissBtn}`}
                onClick={() => setShowMuteMenu(false)}
                aria-label="Cancel mute"
                title="Cancel"
              >
                &times;
              </button>
            </div>
          ) : (
            <>
              <button
                class={`${styles.actionBtn} ${styles.muteBtn}`}
                onClick={() => setShowMuteMenu(true)}
                aria-label="Mute source"
                title="Mute source"
              >
                ⊘
              </button>
              <button
                class={`${styles.actionBtn} ${styles.shareBtn} ${copied ? styles.shareBtnActive : ''}`}
                onClick={handleShare}
                aria-label={copied ? 'Link copied' : 'Share article'}
                title={copied ? 'Copied!' : 'Share'}
              >
                {copied ? '✓' : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true">
                    <circle cx="18" cy="5" r="3"/>
                    <circle cx="6" cy="12" r="3"/>
                    <circle cx="18" cy="19" r="3"/>
                    <line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/>
                    <line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/>
                  </svg>
                )}
              </button>
              <button
                class={`${styles.actionBtn} ${styles.saveBtn} ${isSaved ? styles.saveBtnActive : ''}`}
                onClick={() => onSave(article.id)}
                aria-label={isSaved ? 'Saved' : 'Save to Read Later'}
                title={isSaved ? 'Saved' : 'Save'}
                aria-pressed={isSaved}
              >
                {isSaved ? '\u2665' : '\u2661'}
              </button>
              <button
                class={`${styles.actionBtn} ${styles.dismissBtn}`}
                onClick={() => onDismiss(article.id)}
                aria-label="Dismiss article"
                title="Dismiss"
              >
                &times;
              </button>
            </>
          )}
        </div>
      </div>

      <div class={styles.body}>
        <div class={styles.bodyText}>
          <button
            class={styles.titleLink}
            onClick={() => onOpen(article.id)}
            aria-label={`Read: ${article.title}`}
          >
            <h2 class={styles.title}>{article.title}</h2>
          </button>

          {preview && (
            <button class={styles.preview} onClick={() => onOpen(article.id)} aria-label={`Read: ${article.title}`}>
              {preview}
            </button>
          )}
        </div>

        {article.imageUrl && (
          <img
            class={styles.thumbnail}
            src={article.imageUrl}
            alt={article.title}
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </div>
    </article>
  );
}
