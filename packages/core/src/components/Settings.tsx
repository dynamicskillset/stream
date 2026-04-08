import { useState, useRef, useEffect, useMemo } from 'preact/hooks';
import type { Category, Source, StreamAdapter } from '../types.js';
import { HALF_LIVES } from '../riverEngine.js';
import {
  loadDisplayPrefs, saveDisplayPrefs, applyDisplayPrefs,
  ACCENT_OPTIONS, EXPIRY_OPTIONS,
  type TextSize, type FadeLevel, type ExpiryDays, type DisplayPrefs,
} from '../displayPrefs.js';
import type { MuteEntry } from '../mutedSources.js';
import type { VelocitySuggestion } from '../velocitySuggestions.js';
import {
  loadGeminiKey, saveGeminiKey, clearGeminiKey, testGeminiKey,
  suggestCategories, suggestFeeds, suggestVelocityTiers, dismissAISuggestion,
  countUncategorised,
  type AICategorySuggestion, type AIFeedSuggestion, type AIVelocitySuggestion,
} from '../geminiAI.js';
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
  onBulkVelocityUpdate?: (changes: Array<{ sourceId: string; tier: 1|2|3|4|5 }>) => void;
  onCategoryChange: (sourceId: string, categoryId: string) => Promise<void> | void;
  onBulkCategoryChange?: (changes: Array<{ sourceId: string; categoryName: string }>) => Promise<void>;
  onImported?: () => void;
  mutedEntries?: MuteEntry[];
  onUnmute?: (sourceId: string) => void;
  suggestions?: VelocitySuggestion[];
  onApplySuggestion?: (sourceId: string, tier: 1|2|3|4|5) => void;
  onDismissSuggestion?: (sourceId: string) => void;
  onDeleteSource?: (sourceId: string) => Promise<void>;
  onExpiryChange?: (days: ExpiryDays) => void;
  onTogglePin?: (sourceId: string, pinned: boolean) => void;
}

const SECTIONS_KEY = 'stream-settings-sections';
const DEFAULT_SECTIONS = { addFeeds: true, display: true, ai: false, velocity: true, mutedSources: false, exportImport: false };
type SectionState = typeof DEFAULT_SECTIONS;

function loadSections(): SectionState {
  try {
    const saved = localStorage.getItem(SECTIONS_KEY);
    if (saved) return { ...DEFAULT_SECTIONS, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SECTIONS };
}

const EXPORT_VERSION = '1';
const EXPORT_KEYS: Record<string, string> = {
  velocity:   'stream-velocity',
  display:    'stream-display',
  muted:      'stream-muted-sources',
  dismissed:  'stream-dismissed',
  geminiKey:  'stream-gemini-key',
  aiDismissed:'stream-ai-dismissed',
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

export function Settings({ sources, categories, adapter, onUpdate, onBulkVelocityUpdate, onCategoryChange, onBulkCategoryChange, onImported, mutedEntries, onUnmute, suggestions, onApplySuggestion, onDismissSuggestion, onDeleteSource, onExpiryChange, onTogglePin }: SettingsProps) {
  const [query, setQuery]             = useState('');
  const [importStatus, setImportStatus] = useState<AsyncStatus>({ type: 'idle' });
  const [dataImportStatus, setDataImportStatus] = useState<AsyncStatus>({ type: 'idle' });
  const dataFileRef = useRef<HTMLInputElement>(null);
  const [addStatus, setAddStatus]     = useState<AsyncStatus>({ type: 'idle' });
  const [feedUrl, setFeedUrl]         = useState('');
  const [display, setDisplay]         = useState<DisplayPrefs>(loadDisplayPrefs);
  const [sections, setSections]       = useState<SectionState>(loadSections);
  const fileRef = useRef<HTMLInputElement>(null);

  // AI assistant local state
  const [aiKeyInput, setAiKeyInput]     = useState('');
  const [aiKeySaved, setAiKeySaved]     = useState(() => !!loadGeminiKey());
  const [aiKeyStatus, setAiKeyStatus]   = useState<AsyncStatus>({ type: 'idle' });
  const [aiCatSuggestions, setAiCatSuggestions] = useState<AICategorySuggestion[]>([]);
  const [aiFeedSuggestions, setAiFeedSuggestions] = useState<AIFeedSuggestion[]>([]);
  const [aiVelocitySuggestions, setAiVelocitySuggestions] = useState<AIVelocitySuggestion[]>([]);
  const [aiCatStatus, setAiCatStatus]   = useState<AsyncStatus>({ type: 'idle' });
  const [aiFeedStatus, setAiFeedStatus] = useState<AsyncStatus>({ type: 'idle' });
  const [aiVelocityStatus, setAiVelocityStatus] = useState<AsyncStatus>({ type: 'idle' });
  const [undoVelocity, setUndoVelocity] = useState<{ label: string; prevTiers: Record<string, 1|2|3|4|5> } | null>(null);
  const [undoFading, setUndoFading] = useState(false);
  const [aiCatApplyProgress, setAiCatApplyProgress] = useState<{ done: number; total: number } | null>(null);

  function toggleSection(key: keyof SectionState, open: boolean) {
    setSections(prev => {
      const next = { ...prev, [key]: open };
      try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  useEffect(() => {
    applyDisplayPrefs(display);
  }, [display]);

  // Auto-dismiss undo bar: fade at 6s, remove at 8s
  useEffect(() => {
    if (!undoVelocity) { setUndoFading(false); return; }
    const fadeTimer    = setTimeout(() => setUndoFading(true),  6_000);
    const dismissTimer = setTimeout(() => setUndoVelocity(null), 8_000);
    return () => { clearTimeout(fadeTimer); clearTimeout(dismissTimer); };
  }, [undoVelocity]);

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

  const handleAiKeySave = async () => {
    const key = aiKeyInput.trim();
    if (!key) return;
    setAiKeyStatus({ type: 'loading' });
    const ok = await testGeminiKey(key);
    if (ok) {
      saveGeminiKey(key);
      setAiKeySaved(true);
      setAiKeyInput('');
      setAiKeyStatus({ type: 'idle' });
    } else {
      setAiKeyStatus({ type: 'error', message: 'Invalid key — check it and try again.' });
    }
  };

  const handleAiKeyRemove = () => {
    clearGeminiKey();
    setAiKeySaved(false);
    setAiKeyInput('');
    setAiKeyStatus({ type: 'idle' });
    setAiCatSuggestions([]);
    setAiFeedSuggestions([]);
    setAiVelocitySuggestions([]);
    setAiCatStatus({ type: 'idle' });
    setAiFeedStatus({ type: 'idle' });
    setAiVelocityStatus({ type: 'idle' });
    setUndoVelocity(null);
  };

  const handleAiCatSuggest = async () => {
    setAiCatStatus({ type: 'loading' });
    setAiCatSuggestions([]);
    try {
      const results = await suggestCategories(sources, categories ?? []);
      setAiCatSuggestions(results);
      setAiCatStatus(results.length === 0
        ? { type: 'ok', message: 'All feeds are already categorised.' }
        : { type: 'idle' });
    } catch (err) {
      setAiCatStatus({ type: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  };

  const handleAiFeedSuggest = async () => {
    setAiFeedStatus({ type: 'loading' });
    setAiFeedSuggestions([]);
    try {
      const results = await suggestFeeds(sources, categories ?? []);
      setAiFeedSuggestions(results);
      setAiFeedStatus(results.length === 0
        ? { type: 'ok', message: 'No suggestions available.' }
        : { type: 'idle' });
    } catch (err) {
      setAiFeedStatus({ type: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  };

  const handleApplyAiCat = (sourceId: string, categoryName: string) => {
    onCategoryChange(sourceId, categoryName);
    dismissAISuggestion(sourceId);
    setAiCatSuggestions(prev => prev.filter(s => s.sourceId !== sourceId));
  };

  const handleDismissAiCat = (sourceId: string) => {
    dismissAISuggestion(sourceId);
    setAiCatSuggestions(prev => prev.filter(s => s.sourceId !== sourceId));
  };

  const handleApplyAiFeed = async (feedUrl: string) => {
    if (!adapter) return;
    setAiFeedStatus({ type: 'loading' });
    try {
      await adapter.addSource(feedUrl);
      onImported?.();
      dismissAISuggestion(feedUrl);
      setAiFeedSuggestions(prev => prev.filter(s => s.feedUrl !== feedUrl));
      setAiFeedStatus({ type: 'idle' });
    } catch (err) {
      setAiFeedStatus({ type: 'error', message: err instanceof Error ? err.message : 'Could not add feed.' });
      setTimeout(() => setAiFeedStatus({ type: 'idle' }), 3_000);
    }
  };

  const handleDismissAiFeed = (feedUrl: string) => {
    dismissAISuggestion(feedUrl);
    setAiFeedSuggestions(prev => prev.filter(s => s.feedUrl !== feedUrl));
  };

  const handleAiVelocitySuggest = async () => {
    setAiVelocityStatus({ type: 'loading' });
    setAiVelocitySuggestions([]);
    setUndoVelocity(null);
    try {
      const results = await suggestVelocityTiers(sources, categories ?? []);
      setAiVelocitySuggestions(results);
      setAiVelocityStatus(results.length === 0
        ? { type: 'ok', message: 'No velocity suggestions at this time.' }
        : { type: 'idle' });
    } catch (err) {
      setAiVelocityStatus({ type: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  };

  const handleApplyAiVelocity = (s: AIVelocitySuggestion) => {
    const catSrcs = sources.filter(src => src.categoryId === s.categoryId);
    const prevTiers: Record<string, 1|2|3|4|5> = {};
    const changes = catSrcs.map(src => {
      prevTiers[src.id] = src.velocityTier;
      return { sourceId: src.id, tier: s.suggestedTier };
    });
    setUndoVelocity({ label: s.categoryTitle, prevTiers });
    if (onBulkVelocityUpdate) {
      onBulkVelocityUpdate(changes);
    } else {
      for (const c of changes) onUpdate(c.sourceId, c.tier);
    }
    dismissAISuggestion(`velocity:${s.categoryId}`);
    setAiVelocitySuggestions(prev => prev.filter(x => x.categoryId !== s.categoryId));
  };

  const handleDismissAiVelocity = (categoryId: string) => {
    dismissAISuggestion(`velocity:${categoryId}`);
    setAiVelocitySuggestions(prev => prev.filter(x => x.categoryId !== categoryId));
  };

  const handleApplyAllAiVelocity = () => {
    const all = [...aiVelocitySuggestions];
    const prevTiers: Record<string, 1|2|3|4|5> = {};
    const changes: Array<{ sourceId: string; tier: 1|2|3|4|5 }> = [];
    for (const s of all) {
      for (const src of sources.filter(x => x.categoryId === s.categoryId)) {
        prevTiers[src.id] = src.velocityTier;
        changes.push({ sourceId: src.id, tier: s.suggestedTier });
      }
      dismissAISuggestion(`velocity:${s.categoryId}`);
    }
    setUndoVelocity({ label: `${all.length} categories`, prevTiers });
    if (onBulkVelocityUpdate) {
      onBulkVelocityUpdate(changes);
    } else {
      for (const c of changes) onUpdate(c.sourceId, c.tier);
    }
    setAiVelocitySuggestions([]);
  };

  const handleUndoVelocity = () => {
    if (!undoVelocity) return;
    for (const [sourceId, tier] of Object.entries(undoVelocity.prevTiers)) {
      onUpdate(sourceId, tier);
    }
    setUndoVelocity(null);
  };

  const uncategorisedCount = useMemo(
    () => countUncategorised(sources, categories ?? []),
    [sources, categories],
  );

  // Group category suggestions by suggested category name for grouped rendering
  const aiCatGroups = useMemo(() => {
    const groups = new Map<string, AICategorySuggestion[]>();
    for (const s of aiCatSuggestions) {
      if (!groups.has(s.suggestedCategoryName)) groups.set(s.suggestedCategoryName, []);
      groups.get(s.suggestedCategoryName)!.push(s);
    }
    return [...groups.entries()];
  }, [aiCatSuggestions]);

  const handleApplyAllAiCat = async () => {
    const all = [...aiCatSuggestions];
    setAiCatSuggestions([]);
    setAiCatApplyProgress({ done: 0, total: all.length });
    if (onBulkCategoryChange) {
      await onBulkCategoryChange(all.map(s => ({ sourceId: s.sourceId, categoryName: s.suggestedCategoryName })));
      for (const s of all) dismissAISuggestion(s.sourceId);
    } else {
      for (let i = 0; i < all.length; i++) {
        await onCategoryChange(all[i].sourceId, all[i].suggestedCategoryName);
        dismissAISuggestion(all[i].sourceId);
        setAiCatApplyProgress({ done: i + 1, total: all.length });
      }
    }
    setAiCatApplyProgress(null);
  };

  const handleApplyAiCatGroup = async (catName: string) => {
    const group = aiCatSuggestions.filter(s => s.suggestedCategoryName === catName);
    setAiCatSuggestions(prev => prev.filter(s => s.suggestedCategoryName !== catName));
    if (onBulkCategoryChange) {
      await onBulkCategoryChange(group.map(s => ({ sourceId: s.sourceId, categoryName: s.suggestedCategoryName })));
      for (const s of group) dismissAISuggestion(s.sourceId);
    } else {
      for (const s of group) {
        await onCategoryChange(s.sourceId, s.suggestedCategoryName);
        dismissAISuggestion(s.sourceId);
      }
    }
  };

  const filtered = query.trim()
    ? sources.filter(s => s.title.toLowerCase().includes(query.toLowerCase()))
    : sources;

  const sorted = [...filtered].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div class={styles.wrap}>
      <h1 class={styles.heading}>Settings</h1>

      <details class={styles.section} open={sections.display} onToggle={(e) => toggleSection('display', (e.currentTarget as HTMLDetailsElement).open)}>
        <summary class={styles.sectionHeading}>
          <span class={styles.sectionLabel}>
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="1" y="2" width="10" height="7" rx="1.5" stroke-linejoin="round"/><line x1="4" y1="11" x2="8" y2="11"/><line x1="6" y1="9" x2="6" y2="11"/></svg>
            Display
          </span>
        </summary>
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

          <span class={styles.displayLabel}>Auto-expiry</span>
          <div class={styles.tiers} role="group" aria-label="Auto-expiry">
            {EXPIRY_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                class={`${styles.tierBtn} ${display.expiryDays === value ? styles.active : ''}`}
                onClick={() => {
                  const next = { ...display, expiryDays: value };
                  setDisplay(next);
                  saveDisplayPrefs(next);
                  onExpiryChange?.(value);
                }}
                aria-pressed={display.expiryDays === value}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </details>

      {adapter && (
        <details class={styles.section} open={sections.addFeeds} onToggle={(e) => toggleSection('addFeeds', (e.currentTarget as HTMLDetailsElement).open)}>
          <summary class={styles.sectionHeading}>
            <span class={styles.sectionLabel}>
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="6" r="4.5"/><line x1="6" y1="3" x2="6" y2="9"/><line x1="3" y1="6" x2="9" y2="6"/></svg>
              Add feeds
            </span>
          </summary>

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

      <details class={styles.section} open={sections.ai} onToggle={(e) => toggleSection('ai', (e.currentTarget as HTMLDetailsElement).open)}>
        <summary class={styles.sectionHeading}>
          <span class={styles.sectionLabel}>
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M6 1L7.5 4.5L11 6L7.5 7.5L6 11L4.5 7.5L1 6L4.5 4.5Z"/></svg>
            AI assistant
          </span>
        </summary>
        <p class={styles.sub}>
          Stream can use Google's Gemini AI to suggest categories for your feeds and recommend new ones to follow. This is entirely optional.
        </p>
        <p class={styles.sub}>
          Your API key is stored in your browser only and never sent to Stream's servers. Requests go directly from your browser to Google. Only your feed titles and URLs are shared — not your articles or reading habits.
        </p>

        {!aiKeySaved ? (
          <>
            <p class={styles.sub}>
              To get started: visit{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>,
              {' '}create an API key (it starts with <code>AIza</code>), then paste it below.
            </p>
            <div class={styles.aiKeyRow}>
              <input
                class={styles.addInput}
                type="password"
                placeholder="AIza..."
                value={aiKeyInput}
                onInput={e => setAiKeyInput((e.target as HTMLInputElement).value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAiKeySave(); }}
                aria-label="Gemini API key"
                spellcheck={false}
                autocomplete="off"
              />
              <button
                class={styles.importBtn}
                onClick={handleAiKeySave}
                disabled={aiKeyStatus.type === 'loading' || !aiKeyInput.trim()}
              >
                {aiKeyStatus.type === 'loading' ? 'Checking…' : 'Save'}
              </button>
            </div>
            {aiKeyStatus.type === 'error' && <span class={styles.importErr}>{aiKeyStatus.message}</span>}
          </>
        ) : (
          <>
            <div class={styles.aiKeyRow}>
              <span class={styles.importOk}>✓ Key saved</span>
              <button class={styles.suggestionDismiss} onClick={handleAiKeyRemove}>Remove</button>
            </div>

            {uncategorisedCount > 0
              ? <p class={styles.sub}>{uncategorisedCount} feed{uncategorisedCount !== 1 ? 's are' : ' is'} uncategorised.</p>
              : <p class={styles.sub}>All feeds are categorised.</p>
            }

            <div class={styles.aiActions}>
              {(() => {
                const anyLoading = aiCatStatus.type === 'loading' || aiFeedStatus.type === 'loading' || aiVelocityStatus.type === 'loading';
                return (
                  <>
                    <button
                      class={styles.importBtn}
                      onClick={handleAiCatSuggest}
                      disabled={anyLoading || uncategorisedCount === 0}
                    >
                      {aiCatStatus.type === 'loading' ? 'Analysing…' : 'Suggest categories'}
                    </button>
                    <button
                      class={styles.importBtn}
                      onClick={handleAiVelocitySuggest}
                      disabled={anyLoading || sources.length === 0}
                    >
                      {aiVelocityStatus.type === 'loading' ? 'Thinking…' : 'Suggest velocity'}
                    </button>
                    <button
                      class={styles.importBtn}
                      onClick={handleAiFeedSuggest}
                      disabled={anyLoading || sources.length === 0}
                    >
                      {aiFeedStatus.type === 'loading' ? 'Thinking…' : 'Suggest feeds'}
                    </button>
                  </>
                );
              })()}
            </div>

            {aiCatStatus.type === 'loading' && (
              <div class={styles.aiLoadingNote}>
                <span class={styles.aiLoadingSpinner} aria-hidden="true" />
                <span>
                  Sending {uncategorisedCount} feed titles and URLs to Gemini for categorisation.
                  Only titles and URLs are shared — no article content.
                  With a large collection this can take 30–60 seconds.
                </span>
              </div>
            )}

            {aiCatStatus.type === 'error' && (
              <div class={styles.aiLoadingNote} style="border-color: var(--accent-new); margin-top: 0.5rem;">
                <span>{aiCatStatus.message}</span>
                <button class={styles.suggestionApply} onClick={handleAiCatSuggest} style="margin-left: auto; flex-shrink: 0;">Try again</button>
              </div>
            )}
            {aiCatApplyProgress && (
              <div class={styles.aiLoadingNote}>
                <span class={styles.aiLoadingSpinner} aria-hidden="true" />
                <span>Applying categories… {aiCatApplyProgress.done} of {aiCatApplyProgress.total}</span>
              </div>
            )}
            {aiCatGroups.length > 0 && (
              <div class={styles.suggestions}>
                <div class={styles.aiSuggestHeader}>
                  <span class={styles.aiSuggestTitle}>Suggested categories</span>
                  <button
                    class={styles.suggestionApply}
                    onClick={handleApplyAllAiCat}
                    disabled={!!aiCatApplyProgress}
                  >
                    Apply all {aiCatSuggestions.length}
                  </button>
                </div>
                {aiCatGroups.map(([catName, group]) => (
                  <div key={catName} class={styles.aiCatGroup}>
                    <div class={styles.aiCatGroupHeader}>
                      <span class={styles.aiCategoryTag}>{catName}</span>
                      {group[0].isNewCategory && <span class={styles.aiNewBadge}>new</span>}
                      <span class={styles.aiCatGroupCount}>{group.length} feed{group.length !== 1 ? 's' : ''}</span>
                      <button
                        class={styles.suggestionApply}
                        onClick={() => handleApplyAiCatGroup(catName)}
                        disabled={!!aiCatApplyProgress}
                      >
                        Apply {group.length}
                      </button>
                    </div>
                    {group.map(s => (
                      <div key={s.sourceId} class={styles.suggestionRow}>
                        <div class={styles.suggestionMeta}>
                          <span class={styles.suggestionTitle}>{s.sourceTitle}</span>
                          <span class={styles.suggestionReason}>{s.reason}</span>
                        </div>
                        <div class={styles.suggestionActions}>
                          <button
                            class={styles.suggestionApply}
                            onClick={() => handleApplyAiCat(s.sourceId, catName)}
                          >
                            Apply
                          </button>
                          <button
                            class={styles.suggestionDismiss}
                            onClick={() => handleDismissAiCat(s.sourceId)}
                            title="Dismiss for 30 days"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {aiFeedStatus.type === 'ok'    && <p class={styles.sub}>{aiFeedStatus.message}</p>}
            {aiFeedStatus.type === 'error' && <p class={styles.importErr}>{aiFeedStatus.message}</p>}
            {aiFeedSuggestions.length > 0 && (
              <div class={styles.suggestions}>
                <h3 class={styles.subHeading}>Suggested feeds</h3>
                {aiFeedSuggestions.map(s => (
                  <div key={s.feedUrl} class={styles.suggestionRow}>
                    <div class={styles.suggestionMeta}>
                      <span class={styles.suggestionTitle}>{s.title}</span>
                      <span class={styles.suggestionReason}>{s.reason}</span>
                    </div>
                    <div class={styles.suggestionActions}>
                      <button
                        class={styles.suggestionApply}
                        onClick={() => handleApplyAiFeed(s.feedUrl)}
                        disabled={!adapter || aiFeedStatus.type === 'loading'}
                      >
                        Add
                      </button>
                      <button
                        class={styles.suggestionDismiss}
                        onClick={() => handleDismissAiFeed(s.feedUrl)}
                        title="Dismiss for 30 days"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {aiVelocityStatus.type === 'ok'    && <p class={styles.sub}>{aiVelocityStatus.message}</p>}
            {aiVelocityStatus.type === 'error' && <p class={styles.importErr}>{aiVelocityStatus.message}</p>}
            {undoVelocity && (
              <div class={`${styles.aiUndoBar} ${undoFading ? styles.aiUndoBarFading : ''}`}>
                <span>Velocity updated for <strong>{undoVelocity.label}</strong></span>
                <button class={styles.suggestionApply} onClick={handleUndoVelocity}>Undo</button>
                <button class={styles.aiUndoDismiss} onClick={() => setUndoVelocity(null)} aria-label="Dismiss">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )}
            {aiVelocitySuggestions.length > 0 && (
              <div class={styles.suggestions}>
                <div class={styles.aiSuggestHeader}>
                  <span class={styles.aiSuggestTitle}>Suggested velocity</span>
                  <button class={styles.suggestionApply} onClick={handleApplyAllAiVelocity}>
                    Apply all {aiVelocitySuggestions.length}
                  </button>
                </div>
                {aiVelocitySuggestions.map(s => (
                  <div key={s.categoryId} class={styles.suggestionRow}>
                    <div class={styles.suggestionMeta}>
                      <span class={styles.suggestionTitle}>{s.categoryTitle}</span>
                      <span class={styles.suggestionReason}>
                        <span class={styles.aiVelocityTierBadge}>Tier {s.suggestedTier} — {TIERS[s.suggestedTier - 1].label}</span>
                        {' '}{s.reason}
                      </span>
                    </div>
                    <div class={styles.suggestionActions}>
                      <button
                        class={styles.suggestionApply}
                        onClick={() => handleApplyAiVelocity(s)}
                      >
                        Apply
                      </button>
                      <button
                        class={styles.suggestionDismiss}
                        onClick={() => handleDismissAiVelocity(s.categoryId)}
                        title="Dismiss for 30 days"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </details>

      <details class={styles.section} open={sections.velocity} onToggle={(e) => toggleSection('velocity', (e.currentTarget as HTMLDetailsElement).open)}>
        <summary class={styles.sectionHeading}>
          <span class={styles.sectionLabel}>
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="7" r="4.5"/><polyline points="6,4.5 6,7 8,9" stroke-linejoin="round"/><line x1="4.5" y1="1" x2="7.5" y2="1"/></svg>
            Velocity
          </span>
        </summary>
        <p class={styles.sub}>
          Shorter half-lives push older articles down faster.
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

      <div class={styles.searchWrap}>
        <input
          class={styles.search}
          type="search"
          placeholder="Filter sources…"
          value={query}
          onInput={e => setQuery((e.target as HTMLInputElement).value)}
          aria-label="Filter sources"
        />
      </div>

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
              onDelete={onDeleteSource}
              onTogglePin={onTogglePin}
            />
          ))}
        </div>
      )}
      </details>

      {mutedEntries && mutedEntries.length > 0 && (
        <details class={styles.section} open={sections.mutedSources} onToggle={(e) => toggleSection('mutedSources', (e.currentTarget as HTMLDetailsElement).open)}>
          <summary class={styles.sectionHeading}>
            <span class={styles.sectionLabel}>
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 4H3L6 1V11L3 8H1Z"/><line x1="8.5" y1="3.5" x2="11" y2="8.5"/><line x1="11" y1="3.5" x2="8.5" y2="8.5"/></svg>
              Muted sources
              <span class={styles.mutedBadge}>{mutedEntries.length}</span>
            </span>
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

      <details class={styles.section} open={sections.exportImport} onToggle={(e) => toggleSection('exportImport', (e.currentTarget as HTMLDetailsElement).open)}>
        <summary class={styles.sectionHeading}>
          <span class={styles.sectionLabel}>
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3.5" y1="9.5" x2="3.5" y2="2"/><polyline points="1,4.5 3.5,2 6,4.5"/><line x1="8.5" y1="2.5" x2="8.5" y2="10"/><polyline points="6,7.5 8.5,10 11,7.5"/></svg>
            Export &amp; import
          </span>
        </summary>
        <p class={styles.sub}>
          Export your velocity tiers, display settings, muted sources, and dismissed articles as a JSON file.
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
  onDelete?: (sourceId: string) => Promise<void>;
  onTogglePin?: (sourceId: string, pinned: boolean) => void;
}

function SourceRow({ source, categories, onUpdate, onCategoryChange, onDelete, onTogglePin }: SourceRowProps) {
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(source.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed.');
      setDeleting(false);
      setTimeout(() => setDeleteError(null), 3_000);
    }
  };

  const handleFaviconError = (e: Event) => {
    (e.target as HTMLImageElement).setAttribute('data-error', '');
  };

  const handleCategorySelect = (e: Event) => {
    const val = (e.target as HTMLSelectElement).value;
    if (val === '__new__') {
      setAddingCategory(true);
      setNewCatName('');
    } else {
      onCategoryChange(source.id, val);
    }
  };

  const commitNewCategory = () => {
    const name = newCatName.trim();
    if (name) onCategoryChange(source.id, name);
    setAddingCategory(false);
    setNewCatName('');
  };

  const cancelNewCategory = () => {
    setAddingCategory(false);
    setNewCatName('');
  };

  const handleNewCatKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitNewCategory(); }
    if (e.key === 'Escape') cancelNewCategory();
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
        addingCategory ? (
          <input
            class={styles.newCatInput}
            type="text"
            value={newCatName}
            placeholder="Category name"
            aria-label="New category name"
            autoFocus
            onInput={(e) => setNewCatName((e.target as HTMLInputElement).value)}
            onKeyDown={handleNewCatKeyDown}
            onBlur={commitNewCategory}
          />
        ) : (
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
        )
      )}

      {!source.isVoice && (
        <VelocitySlider
          tier={source.velocityTier}
          label={`Velocity for ${source.title}`}
          onChange={(t) => onUpdate(source.id, t)}
        />
      )}

      {onTogglePin && (
        <button
          class={`${styles.pinBtn} ${source.isVoice ? styles.pinBtnActive : ''}`}
          onClick={() => onTogglePin(source.id, !source.isVoice)}
          aria-pressed={source.isVoice}
          aria-label={source.isVoice ? `Unpin ${source.title}` : `Pin ${source.title}`}
          title={source.isVoice ? 'Pinned — never fades' : 'Pin — never fades'}
        >
          {source.isVoice ? '◆' : '◇'}
        </button>
      )}

      {onDelete && !confirmDelete && (
        <button
          class={styles.deleteBtn}
          onClick={() => setConfirmDelete(true)}
          aria-label={`Delete ${source.title}`}
          title="Remove feed"
        >
          &times;
        </button>
      )}
      {confirmDelete && (
        <div class={styles.confirmDelete}>
          <span class={styles.confirmText}>Remove?</span>
          <button
            class={styles.confirmYes}
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Removing\u2026' : 'Yes'}
          </button>
          <button
            class={styles.confirmNo}
            onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
            disabled={deleting}
          >
            Cancel
          </button>
        </div>
      )}
      {deleteError && (
        <span class={styles.importErr}>{deleteError}</span>
      )}
    </div>
  );
}

function tierTitle(tier: 1|2|3|4|5): string {
  const names = ['Breaking', 'News', 'Article', 'Essay', 'Evergreen'];
  return names[tier - 1];
}

interface VelocitySliderProps {
  tier: 1|2|3|4|5 | null;
  label: string;
  onChange: (tier: 1|2|3|4|5) => void;
}

function VelocitySlider({ tier, label, onChange }: VelocitySliderProps) {
  const isMixed = tier === null;
  const value = tier ?? 3;
  return (
    <div
      class={`${styles.slider} ${isMixed ? styles.sliderMixed : ''}`}
      role="group"
      aria-label={label}
    >
      <span class={styles.sliderEndpoint}>6 hours</span>
      <div class={styles.sliderTrack}>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onInput={(e) => onChange(Number((e.target as HTMLInputElement).value) as 1|2|3|4|5)}
          aria-label="Velocity"
          aria-valuetext={isMixed ? 'Mixed' : `${tierTitle(value as 1|2|3|4|5)} — ${TIERS[value - 1].label}`}
        />
        <div class={styles.sliderTicks}>
          {TIERS.map(({ tier: t, label: l }) => <span key={t}>{l}</span>)}
        </div>
      </div>
      <span class={styles.sliderEndpoint}>1 week</span>
    </div>
  );
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
      <VelocitySlider
        tier={sharedTier}
        label={`Velocity for ${category.title}`}
        onChange={handleTier}
      />
    </div>
  );
}
