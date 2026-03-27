import { useState, useRef, useEffect } from 'preact/hooks';
import type { Category, Source, StreamAdapter } from '../types.js';
import { HALF_LIVES } from '../riverEngine.js';
import {
  loadDisplayPrefs, saveDisplayPrefs, applyDisplayPrefs,
  ACCENT_OPTIONS,
  type TextSize, type FadeLevel, type DisplayPrefs,
} from '../displayPrefs.js';
import type { MuteEntry } from '../mutedSources.js';
import type { VelocitySuggestion } from '../velocitySuggestions.js';
import styles from './Settings.module.css';

const TIERS: Array<{ tier: 1|2|3|4|5; label: string }> = [
  { tier: 1, label: `${HALF_LIVES[1]}h` },
  { tier: 2, label: `${HALF_LIVES[2]}h` },
  { tier: 3, label: `${HALF_LIVES[3]}h` },
  { tier: 4, label: `${HALF_LIVES[4]}h` },
  { tier: 5, label: '7d' },
];

type AsyncStatus = { type: 'idle' } | { type: 'loading' } | { type: 'ok'; message: string } | { type: 'error'; message: string };

interface SettingsProps {
  sources: Source[];
  categories?: Category[];
  adapter?: StreamAdapter;
  onUpdate: (sourceId: string, tier: 1|2|3|4|5) => void;
  onCategoryChange: (sourceId: string, categoryId: string) => void;
  onImported?: () => void;
  mutedEntries?: MuteEntry[];
  onUnmute?: (sourceId: string) => void;
  suggestions?: VelocitySuggestion[];
  onApplySuggestion?: (sourceId: string, tier: 1|2|3|4|5) => void;
  onDismissSuggestion?: (sourceId: string) => void;
}

const EXPORT_VERSION = '1';
const EXPORT_KEYS: Record<string, string> = {
  velocity: 'stream-velocity',
  display:  'stream-display',
  muted:    'stream-muted-sources',
};

function handleExport() {
  const data: Record<string, unknown> = {
    version:    EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
  };
  for (const [field, key] of Object.entries(EXPORT_KEYS)) {
    try { data[field] = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { /* skip */ }
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `stream-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function Settings({ sources, categories, adapter, onUpdate, onCategoryChange, onImported, mutedEntries, onUnmute, suggestions, onApplySuggestion, onDismissSuggestion }: SettingsProps) {
  const [query, setQuery]             = useState('');
  const [importStatus, setImportStatus] = useState<AsyncStatus>({ type: 'idle' });
  const [dataImportStatus, setDataImportStatus] = useState<AsyncStatus>({ type: 'idle' });
  const dataFileRef = useRef<HTMLInputElement>(null);
  const [addStatus, setAddStatus]     = useState<AsyncStatus>({ type: 'idle' });
  const [feedUrl, setFeedUrl]         = useState('');
  const [display, setDisplay]         = useState<DisplayPrefs>(loadDisplayPrefs);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    applyDisplayPrefs(display);
  }, [display]);

  const handleFileChange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !adapter) return;

    setImportStatus({ type: 'loading' });
    try {
      const xml   = await file.text();
      const added = await adapter.importOPML(xml);
      setImportStatus({ type: 'ok', message: `✓ ${added.length} feeds added` });
      onImported?.();
      setTimeout(() => setImportStatus({ type: 'idle' }), 3_000);
    } catch (err) {
      setImportStatus({ type: 'error', message: err instanceof Error ? err.message : 'Import failed.' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleAddFeed = async (e: Event) => {
    e.preventDefault();
    const url = feedUrl.trim();
    if (!url || !adapter) return;

    setAddStatus({ type: 'loading' });
    try {
      await adapter.addSource(url);
      setAddStatus({ type: 'ok', message: '✓ Feed added' });
      setFeedUrl('');
      onImported?.();
      setTimeout(() => setAddStatus({ type: 'idle' }), 3_000);
    } catch (err) {
      setAddStatus({ type: 'error', message: err instanceof Error ? err.message : 'Could not add feed.' });
    }
  };

  const handleDataImport = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    setDataImportStatus({ type: 'loading' });
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Record<string, unknown>;
      if (data.version !== EXPORT_VERSION) throw new Error('Incompatible export version.');
      for (const [field, key] of Object.entries(EXPORT_KEYS)) {
        if (data[field] !== null && data[field] !== undefined) {
          localStorage.setItem(key, JSON.stringify(data[field]));
        }
      }
      setDataImportStatus({ type: 'ok', message: '✓ Settings imported — reload to apply' });
    } catch (err) {
      setDataImportStatus({ type: 'error', message: err instanceof Error ? err.message : 'Import failed.' });
    } finally {
      if (dataFileRef.current) dataFileRef.current.value = '';
    }
  };

  const filtered = query.trim()
    ? sources.filter(s => s.title.toLowerCase().includes(query.toLowerCase()))
    : sources;

  const sorted = [...filtered].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div class={styles.wrap}>
      <h2 class={styles.heading}>Settings</h2>

      {adapter && (
        <details class={styles.section} open>
          <summary class={styles.sectionHeading}>Add feeds</summary>

          <form class={styles.addForm} onSubmit={handleAddFeed}>
            <input
              class={styles.addInput}
              type="url"
              placeholder="https://example.com/feed.xml"
              value={feedUrl}
              onInput={e => setFeedUrl((e.target as HTMLInputElement).value)}
              aria-label="Feed URL"
              spellcheck={false}
              autocomplete="off"
            />
            <button
              class={styles.importBtn}
              type="submit"
              disabled={addStatus.type === 'loading' || !feedUrl.trim()}
            >
              {addStatus.type === 'loading' ? 'Adding…' : 'Add feed'}
            </button>
            {addStatus.type === 'ok'    && <span class={styles.importOk}>{addStatus.message}</span>}
            {addStatus.type === 'error' && <span class={styles.importErr}>{addStatus.message}</span>}
          </form>

          <div class={styles.importWrap}>
            <input
              ref={fileRef}
              type="file"
              accept=".opml,.xml"
              class={styles.fileInput}
              aria-label="Import OPML file"
              onChange={handleFileChange}
            />
            <button
              class={styles.importBtn}
              onClick={() => fileRef.current?.click()}
              disabled={importStatus.type === 'loading'}
            >
              {importStatus.type === 'loading' ? 'Importing…' : 'Import OPML'}
            </button>
            {importStatus.type === 'ok' && (
              <span class={styles.importOk}>{importStatus.message}</span>
            )}
            {importStatus.type === 'error' && (
              <span class={styles.importErr}>{importStatus.message}</span>
            )}
          </div>
        </details>
      )}

      <details class={styles.section} open>
        <summary class={styles.sectionHeading}>Display</summary>
        <div class={styles.displayGrid}>
          <span class={styles.displayLabel}>Text size</span>
          <div class={styles.tiers} role="group" aria-label="Text size">
            {(['small', 'default', 'large'] as TextSize[]).map(size => (
              <button
                key={size}
                class={`${styles.tierBtn} ${display.textSize === size ? styles.active : ''}`}
                onClick={() => { const next = { ...display, textSize: size }; setDisplay(next); saveDisplayPrefs(next); }}
                aria-pressed={display.textSize === size}
              >
                {size.charAt(0).toUpperCase() + size.slice(1)}
              </button>
            ))}
          </div>

          <span class={styles.displayLabel}>Highlight</span>
          <div class={styles.swatches} role="group" aria-label="Highlight colour">
            {ACCENT_OPTIONS.map(({ id, label, swatch }) => (
              <button
                key={id}
                class={`${styles.swatchBtn} ${display.accentColor === id ? styles.swatchActive : ''}`}
                onClick={() => { const next = { ...display, accentColor: id }; setDisplay(next); saveDisplayPrefs(next); }}
                aria-pressed={display.accentColor === id}
                aria-label={label}
                title={label}
                style={{ ['--swatch' as string]: swatch } as never}
              />
            ))}
          </div>

          <span class={styles.displayLabel}>Fade intensity</span>
          <div class={styles.tiers} role="group" aria-label="Fade intensity">
            {(['none', 'subtle', 'full'] as FadeLevel[]).map(level => (
              <button
                key={level}
                class={`${styles.tierBtn} ${display.fadeLevel === level ? styles.active : ''}`}
                onClick={() => { const next = { ...display, fadeLevel: level }; setDisplay(next); saveDisplayPrefs(next); }}
                aria-pressed={display.fadeLevel === level}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </details>

      <details class={styles.section} open>
        <summary class={styles.sectionHeading}>Velocity</summary>
        <p class={styles.sub}>
          How quickly should each source's articles fade? Shorter = faster.
        </p>

        {suggestions && suggestions.length > 0 && (
          <div class={styles.suggestions}>
            <h3 class={styles.subHeading}>Suggestions</h3>
            {suggestions.map(s => (
              <div key={s.sourceId} class={styles.suggestionRow}>
                <div class={styles.suggestionMeta}>
                  <span class={styles.suggestionTitle}>{s.sourceTitle}</span>
                  <span class={styles.suggestionReason}>{s.reason}</span>
                </div>
                <div class={styles.suggestionActions}>
                  <button
                    class={styles.suggestionApply}
                    onClick={() => onApplySuggestion?.(s.sourceId, s.suggestedTier)}
                    title={`Change to tier ${s.suggestedTier}`}
                  >
                    Apply
                  </button>
                  <button
                    class={styles.suggestionDismiss}
                    onClick={() => onDismissSuggestion?.(s.sourceId)}
                    title="Dismiss for 30 days"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      {categories && categories.length > 0 && (
        <>
          <h3 class={styles.subHeading}>Categories</h3>
          <div class={styles.list} role="list">
            {categories.map(cat => (
              <CategoryRow
                key={cat.id}
                category={cat}
                sources={sources}
                onUpdate={onUpdate}
              />
            ))}
          </div>
          <h3 class={styles.subHeading}>Sources</h3>
        </>
      )}

      <input
        class={styles.search}
        type="search"
        placeholder="Filter sources…"
        value={query}
        onInput={e => setQuery((e.target as HTMLInputElement).value)}
        aria-label="Filter sources"
      />

      {sorted.length === 0 ? (
        <p class={styles.empty}>No sources match.</p>
      ) : (
        <div class={styles.list} role="list">
          {sorted.map(source => (
            <SourceRow
              key={source.id}
              source={source}
              categories={categories}
              onUpdate={onUpdate}
              onCategoryChange={onCategoryChange}
            />
          ))}
        </div>
      )}
      </details>

      {mutedEntries && mutedEntries.length > 0 && (
        <details class={styles.section}>
          <summary class={styles.sectionHeading}>
            Muted sources
            <span class={styles.mutedBadge}>{mutedEntries.length}</span>
          </summary>
          <div class={styles.list} role="list">
            {mutedEntries.map(entry => {
              const until = new Date(entry.mutedUntil);
              const label = until.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              return (
                <div key={entry.sourceId} class={styles.mutedRow} role="listitem">
                  <span class={styles.mutedTitle}>{entry.sourceTitle}</span>
                  <span class={styles.mutedUntil}>until {label}</span>
                  <button
                    class={styles.unmuteBtn}
                    onClick={() => onUnmute?.(entry.sourceId)}
                  >
                    Unmute
                  </button>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <details class={styles.section}>
        <summary class={styles.sectionHeading}>Export &amp; import</summary>
        <p class={styles.sub}>
          Export your velocity tiers, display settings, and muted sources as a JSON file.
          Import on another device or browser to restore your configuration.
        </p>
        <div class={styles.dataActions}>
          <button class={styles.importBtn} onClick={handleExport}>
            Export settings
          </button>
          <input
            ref={dataFileRef}
            type="file"
            accept=".json"
            class={styles.fileInput}
            aria-label="Import settings file"
            onChange={handleDataImport}
          />
          <button
            class={styles.importBtn}
            onClick={() => dataFileRef.current?.click()}
            disabled={dataImportStatus.type === 'loading'}
          >
            {dataImportStatus.type === 'loading' ? 'Importing…' : 'Import settings'}
          </button>
          {dataImportStatus.type === 'ok'    && <span class={styles.importOk}>{dataImportStatus.message}</span>}
          {dataImportStatus.type === 'error' && <span class={styles.importErr}>{dataImportStatus.message}</span>}
        </div>
      </details>

      <footer class={styles.footer}>
        <a
          class={styles.footerLink}
          href="https://dynamicskillset.github.io/stream/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Stream
        </a>
        <span class={styles.footerSep}>·</span>
        <a
          class={styles.footerLink}
          href="https://github.com/dynamicskillset/stream"
          target="_blank"
          rel="noopener noreferrer"
          title="Source on GitHub — AGPL-3.0"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          AGPL-3.0
        </a>
      </footer>
    </div>
  );
}

interface SourceRowProps {
  source: Source;
  categories?: Category[];
  onUpdate: (sourceId: string, tier: 1|2|3|4|5) => void;
  onCategoryChange: (sourceId: string, categoryId: string) => void;
}

function SourceRow({ source, categories, onUpdate, onCategoryChange }: SourceRowProps) {
  const handleFaviconError = (e: Event) => {
    (e.target as HTMLImageElement).setAttribute('data-error', '');
  };

  const handleCategorySelect = (e: Event) => {
    const val = (e.target as HTMLSelectElement).value;
    if (val === '__new__') {
      const name = prompt('New category name:')?.trim();
      if (name) {
        onCategoryChange(source.id, name);
      } else {
        // Revert the select to its previous value
        (e.target as HTMLSelectElement).value = source.categoryId ?? '';
      }
    } else {
      onCategoryChange(source.id, val);
    }
  };

  return (
    <div class={styles.row} role="listitem">
      {source.faviconUrl ? (
        <img
          class={styles.favicon}
          src={source.faviconUrl}
          alt=""
          aria-hidden="true"
          width={14}
          height={14}
          onError={handleFaviconError}
        />
      ) : (
        <span class={styles.favicon} style={{ display: 'inline-block', background: 'var(--border)' }} />
      )}

      <span class={styles.sourceName} title={source.title}>
        {source.title}
      </span>

      {categories !== undefined && (
        <select
          class={styles.catSelect}
          value={source.categoryId ?? ''}
          onChange={handleCategorySelect}
          aria-label={`Category for ${source.title}`}
        >
          <option value="">Uncategorized</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
          <option value="__new__">+ New category…</option>
        </select>
      )}

      <div class={styles.tiers} role="group" aria-label={`Velocity for ${source.title}`}>
        {TIERS.map(({ tier, label }) => (
          <button
            key={tier}
            class={`${styles.tierBtn} ${source.velocityTier === tier ? styles.active : ''}`}
            onClick={() => onUpdate(source.id, tier)}
            aria-pressed={source.velocityTier === tier}
            title={tierTitle(tier)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function tierTitle(tier: 1|2|3|4|5): string {
  const names = ['Breaking', 'News', 'Article', 'Essay', 'Evergreen'];
  return names[tier - 1];
}

interface CategoryRowProps {
  category: Category;
  sources: Source[];
  onUpdate: (sourceId: string, tier: 1|2|3|4|5) => void;
}

function CategoryRow({ category, sources, onUpdate }: CategoryRowProps) {
  const catSources = sources.filter(s => s.categoryId === category.id);

  // If all sources in the category share the same tier, show it as active
  const sharedTier: 1|2|3|4|5 | null =
    catSources.length > 0 && catSources.every(s => s.velocityTier === catSources[0].velocityTier)
      ? catSources[0].velocityTier
      : null;

  const handleTier = (tier: 1|2|3|4|5) => {
    for (const s of catSources) onUpdate(s.id, tier);
  };

  return (
    <div class={styles.row} role="listitem">
      <span class={styles.catIcon} aria-hidden="true">◈</span>
      <span class={styles.sourceName} title={category.title}>
        {category.title}
        {catSources.length > 0 && (
          <span class={styles.catCount}> · {catSources.length}</span>
        )}
      </span>
      <div class={styles.tiers} role="group" aria-label={`Velocity for ${category.title}`}>
        {TIERS.map(({ tier, label }) => (
          <button
            key={tier}
            class={`${styles.tierBtn} ${sharedTier === tier ? styles.active : ''}`}
            onClick={() => handleTier(tier)}
            aria-pressed={sharedTier === tier}
            title={tierTitle(tier)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
