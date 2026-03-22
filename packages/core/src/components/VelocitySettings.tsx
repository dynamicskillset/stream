import { useState, useRef } from 'preact/hooks';
import type { Source, StreamAdapter } from '../types.js';
import { HALF_LIVES } from '../riverEngine.js';
import styles from './VelocitySettings.module.css';

const TIERS: Array<{ tier: 1|2|3|4|5; label: string }> = [
  { tier: 1, label: `${HALF_LIVES[1]}h` },
  { tier: 2, label: `${HALF_LIVES[2]}h` },
  { tier: 3, label: `${HALF_LIVES[3]}h` },
  { tier: 4, label: `${HALF_LIVES[4]}h` },
  { tier: 5, label: '7d' },
];

type ImportStatus = { type: 'idle' } | { type: 'loading' } | { type: 'ok'; count: number } | { type: 'error'; message: string };

interface VelocitySettingsProps {
  sources: Source[];
  adapter?: StreamAdapter;
  onUpdate: (sourceId: string, tier: 1|2|3|4|5) => void;
  onImported?: () => void;
}

export function VelocitySettings({ sources, adapter, onUpdate, onImported }: VelocitySettingsProps) {
  const [query, setQuery] = useState('');
  const [importStatus, setImportStatus] = useState<ImportStatus>({ type: 'idle' });
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !adapter) return;

    setImportStatus({ type: 'loading' });
    try {
      const xml    = await file.text();
      const added  = await adapter.importOPML(xml);
      setImportStatus({ type: 'ok', count: added.length });
      onImported?.();
      setTimeout(() => setImportStatus({ type: 'idle' }), 3_000);
    } catch (err) {
      setImportStatus({ type: 'error', message: err instanceof Error ? err.message : 'Import failed.' });
    } finally {
      // Reset so the same file can be re-selected
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const filtered = query.trim()
    ? sources.filter(s => s.title.toLowerCase().includes(query.toLowerCase()))
    : sources;

  const sorted = [...filtered].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div class={styles.wrap}>
      <div class={styles.headingRow}>
        <h2 class={styles.heading}>Velocity</h2>
        {adapter && (
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
              <span class={styles.importOk}>✓ {importStatus.count} feeds added</span>
            )}
            {importStatus.type === 'error' && (
              <span class={styles.importErr}>{importStatus.message}</span>
            )}
          </div>
        )}
      </div>
      <p class={styles.sub}>
        How quickly should each source's articles fade? Shorter = faster.
      </p>

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
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SourceRowProps {
  source: Source;
  onUpdate: (sourceId: string, tier: 1|2|3|4|5) => void;
}

function SourceRow({ source, onUpdate }: SourceRowProps) {
  const handleFaviconError = (e: Event) => {
    (e.target as HTMLImageElement).setAttribute('data-error', '');
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
