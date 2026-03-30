import { useState, useEffect, useCallback, useRef, useMemo } from 'preact/hooks';
import { scoreRiver, HALF_LIVES } from './riverEngine.js';
import { useRiver } from './hooks/useRiver.js';
import { useTheme } from './hooks/useTheme.js';
import { River } from './components/River.js';
import { AppShell } from './components/AppShell.js';
import { ConnectScreen } from './components/ConnectScreen.js';
import { Settings } from './components/Settings.js';
import { ReadingView } from './components/ReadingView.js';
import { KeyboardHelp } from './components/KeyboardHelp.js';
import { FilterBar } from './components/FilterBar.js';
import { FreshRSSAdapter } from './adapters/freshrss.js';
import { FeedbinAdapter } from './adapters/feedbin.js';
import { loadDisplayPrefs, applyDisplayPrefs } from './displayPrefs.js';
import { activeMutedIds, muteSource, unmuteSource, cleanExpiredMutes, getMutedSources, type MuteEntry } from './mutedSources.js';
import { purgeDismissed } from './dismissedArticles.js';
import { isPaused, pauseRiver, resumeRiver, effectiveNow } from './quietHours.js';
import { logArticleOpen, generateSuggestions, dismissSuggestion, type VelocitySuggestion } from './velocitySuggestions.js';
import type { Article, Category, Source, StreamAdapter, AdapterConfig } from './types.js';
import './theme.css';

// ---------------------------------------------------------------------------
// Velocity config — stored in localStorage, keyed by sourceId
// ---------------------------------------------------------------------------

const VELOCITY_KEY = 'stream-velocity';

type VelocityEntry = { tier: 1|2|3|4|5; isVoice: boolean };
type VelocityConfig = Record<string, VelocityEntry>;

function loadVelocityConfig(): VelocityConfig {
  try {
    return JSON.parse(localStorage.getItem(VELOCITY_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveVelocityConfig(cfg: VelocityConfig): void {
  localStorage.setItem(VELOCITY_KEY, JSON.stringify(cfg));
}

function applySavedVelocity(sources: Source[], cfg: VelocityConfig): Source[] {
  const updated: VelocityConfig = { ...cfg };
  const merged = sources.map(s => {
    const saved = cfg[s.id];
    if (!saved) {
      // First time seeing this source — save default
      updated[s.id] = { tier: 3, isVoice: false };
      return s;
    }
    return { ...s, velocityTier: saved.tier, isVoice: saved.isVoice };
  });
  saveVelocityConfig(updated);
  return merged;
}

// ---------------------------------------------------------------------------
// Connection config — stored in localStorage (password included)
// The PRD explicitly allows local credential storage for the web app.
// ---------------------------------------------------------------------------

const CONNECTION_KEY = 'stream-connection';

type SavedConnection = AdapterConfig & { adapterId: string };

function loadSavedConnection(): SavedConnection | null {
  try {
    const raw = localStorage.getItem(CONNECTION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Article fetching — paginated, respects 2× max half-life fetch window
// ---------------------------------------------------------------------------

async function fetchAllArticles(
  adapter: StreamAdapter,
  sources: Source[],
): Promise<Article[]> {
  const maxHalfLife = sources.reduce(
    (max, s) => Math.max(max, s.customHalfLife ?? HALF_LIVES[s.velocityTier]),
    HALF_LIVES[3],
  );
  const since = new Date(Date.now() - 2 * maxHalfLife * 3_600_000);

  const articles: Article[] = [];
  let continuation: string | undefined;

  do {
    const result = await adapter.fetchArticles({ since, limit: 100, continuation });
    articles.push(...result.articles);
    continuation = result.continuation;

    // Stop pagination once we've gone past the fetch window
    const oldest = result.articles.at(-1);
    if (oldest && oldest.publishedAt < since) break;
  } while (continuation);

  return articles;
}

// ---------------------------------------------------------------------------
// App state machine
// ---------------------------------------------------------------------------

type AppState =
  | { status: 'connect';   error?: string }
  | { status: 'loading';   adapter: StreamAdapter }
  | { status: 'ready';     adapter: StreamAdapter; sources: Source[]; articles: Article[]; categories: Category[] }
  | { status: 'settings';  adapter: StreamAdapter; sources: Source[]; articles: Article[]; categories: Category[] }
  | { status: 'error';     message: string };

export function App() {
  const { theme, toggle } = useTheme();
  const [state, setState] = useState<AppState>(
    loadSavedConnection() ? { status: 'loading', adapter: null! } : { status: 'connect' },
  );
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [mutedIds, setMutedIds] = useState<Set<string>>(() => {
    cleanExpiredMutes();
    purgeDismissed();
    return activeMutedIds();
  });
  const [mutedEntries, setMutedEntries] = useState<MuteEntry[]>(() => getMutedSources());
  const [paused, setPaused] = useState(() => isPaused());
  const [suggestions, setSuggestions] = useState<VelocitySuggestion[]>([]);
  const [expiryDays, setExpiryDays] = useState(() => loadDisplayPrefs().expiryDays);

  // Apply saved display prefs on mount (text size, fade intensity, accent colour)
  useEffect(() => {
    applyDisplayPrefs(loadDisplayPrefs());
  }, []);

  // Live score recalculation every 60s — pauses when tab is hidden
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!id) id = setInterval(() => setNow(Date.now()), 60_000); };
    const stop  = () => { if (id) { clearInterval(id); id = null; } };
    const onVis = () => { document.hidden ? stop() : (setNow(Date.now()), start()); };

    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const loadData = useCallback(async (adapter: StreamAdapter) => {
    setState({ status: 'loading', adapter });
    try {
      const rawSources = await adapter.fetchSources();
      const sources    = applySavedVelocity(rawSources, loadVelocityConfig());
      const [articles, categories] = await Promise.all([
        fetchAllArticles(adapter, sources),
        adapter.fetchCategories().catch(() => [] as Category[]),
      ]);
      setState({ status: 'ready', adapter, sources, articles, categories });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to load articles.',
      });
    }
  }, []);

  const handleConnect = useCallback(async (
    adapter: StreamAdapter,
    config: SavedConnection,
  ) => {
    localStorage.setItem(CONNECTION_KEY, JSON.stringify(config));
    await loadData(adapter);
  }, [loadData]);

  const handleSettings = useCallback(() => {
    setState(prev => {
      if (prev.status === 'ready') return { ...prev, status: 'settings' };
      if (prev.status === 'settings') {
        window.scrollTo({ top: 0, behavior: 'instant' });
        return { ...prev, status: 'ready' };
      }
      return prev;
    });
  }, []);

  const handleImported = useCallback(async () => {
    setState(prev => {
      if (prev.status !== 'settings') return prev;
      // Re-fetch sources async and update state when done
      applySavedVelocity([], loadVelocityConfig()); // no-op, just ensures cfg is initialised
      prev.adapter.fetchSources().then(raw => {
        const sources = applySavedVelocity(raw, loadVelocityConfig());
        setState(p => p.status === 'settings' ? { ...p, sources } : p);
      }).catch(() => {});
      return prev;
    });
  }, []);

  const handleVelocityUpdate = useCallback((sourceId: string, tier: 1|2|3|4|5) => {
    setState(prev => {
      if (prev.status !== 'settings' && prev.status !== 'ready') return prev;
      const cfg = loadVelocityConfig();
      cfg[sourceId] = { tier, isVoice: cfg[sourceId]?.isVoice ?? false };
      saveVelocityConfig(cfg);
      const sources = prev.sources.map(s =>
        s.id === sourceId ? { ...s, velocityTier: tier } : s
      );
      return { ...prev, sources };
    });
  }, []);

  const handleBulkVelocityUpdate = useCallback((changes: Array<{ sourceId: string; tier: 1|2|3|4|5 }>) => {
    setState(prev => {
      if (prev.status !== 'settings' && prev.status !== 'ready') return prev;
      const cfg = loadVelocityConfig();
      const tierMap = new Map(changes.map(c => [c.sourceId, c.tier]));
      for (const c of changes) {
        cfg[c.sourceId] = { tier: c.tier, isVoice: cfg[c.sourceId]?.isVoice ?? false };
      }
      saveVelocityConfig(cfg);
      const sources = prev.sources.map(s =>
        tierMap.has(s.id) ? { ...s, velocityTier: tierMap.get(s.id)! } : s
      );
      return { ...prev, sources };
    });
  }, []);

  const handleCategoryChange = useCallback(async (sourceId: string, categoryId: string) => {
    const s = stateRef.current;
    if (s.status !== 'settings') return;
    const adapter = s.adapter;

    // FreshRSS expects the full label stream ID; new names need the prefix added
    let backendCategoryId = categoryId;
    if (adapter.id === 'freshrss' && !categoryId.startsWith('user/-/label/')) {
      backendCategoryId = `user/-/label/${categoryId}`;
    }

    try {
      await adapter.setSourceCategory(sourceId, backendCategoryId);
      // Re-fetch so the updated categoryId and any new category appear in state
      const rawSources = await adapter.fetchSources();
      const sources    = applySavedVelocity(rawSources, loadVelocityConfig());
      const categories = await adapter.fetchCategories().catch(() => [] as Category[]);
      setState(prev =>
        prev.status === 'settings' ? { ...prev, sources, categories } : prev
      );
    } catch {
      // Silent fail — source row will remain unchanged until next refresh
    }
  }, []);

  /** Bulk version: fires all writes concurrently, then re-fetches once. */
  const handleBulkCategoryChange = useCallback(async (
    changes: Array<{ sourceId: string; categoryName: string }>,
  ) => {
    const s = stateRef.current;
    if (s.status !== 'settings') return;
    const adapter = s.adapter;

    await Promise.all(changes.map(({ sourceId, categoryName }) => {
      let backendId = categoryName;
      if (adapter.id === 'freshrss' && !categoryName.startsWith('user/-/label/')) {
        backendId = `user/-/label/${categoryName}`;
      }
      return adapter.setSourceCategory(sourceId, backendId).catch(() => {});
    }));

    const rawSources = await adapter.fetchSources();
    const sources    = applySavedVelocity(rawSources, loadVelocityConfig());
    const categories = await adapter.fetchCategories().catch(() => [] as Category[]);
    setState(prev =>
      prev.status === 'settings' ? { ...prev, sources, categories } : prev
    );
  }, []);

  const handleRefresh = useCallback(async () => {
    const s = stateRef.current;
    if (s.status !== 'ready') return;
    setRefreshing(true);
    try {
      const sources  = applySavedVelocity(
        await s.adapter.fetchSources(), loadVelocityConfig()
      );
      const articles = await fetchAllArticles(s.adapter, sources);
      const categories = await s.adapter.fetchCategories().catch(() => [] as Category[]);
      setState(prev =>
        prev.status === 'ready'
          ? { ...prev, sources, articles, categories }
          : prev
      );
    } catch {
      // Silent fail on refresh — keep existing data
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleTogglePause = useCallback(() => {
    if (isPaused()) {
      resumeRiver();
      setPaused(false);
    } else {
      pauseRiver();
      setPaused(true);
    }
    setNow(Date.now()); // force recompute of effectiveNow
  }, []);

  const handleMute = useCallback((sourceId: string, mutedUntil: number) => {
    const s = stateRef.current;
    const src = (s.status === 'ready' || s.status === 'settings')
      ? s.sources.find(sr => sr.id === sourceId)
      : undefined;
    muteSource(sourceId, src?.title ?? sourceId, mutedUntil);
    setMutedIds(prev => new Set([...prev, sourceId]));
    setMutedEntries(getMutedSources());
  }, []);

  const handleTogglePin = useCallback((sourceId: string, pinned: boolean) => {
    setState(prev => {
      if (prev.status !== 'settings' && prev.status !== 'ready') return prev;
      const cfg = loadVelocityConfig();
      cfg[sourceId] = { tier: cfg[sourceId]?.tier ?? 3, isVoice: pinned };
      saveVelocityConfig(cfg);
      const sources = prev.sources.map(s =>
        s.id === sourceId ? { ...s, isVoice: pinned } : s
      );
      return { ...prev, sources };
    });
  }, []);

  const handleDeleteSource = useCallback(async (sourceId: string) => {
    const s = stateRef.current;
    if (s.status !== 'settings') return;
    await s.adapter.removeSource(sourceId);
    const rawSources = await s.adapter.fetchSources();
    const sources = applySavedVelocity(rawSources, loadVelocityConfig());
    const categories = await s.adapter.fetchCategories().catch(() => [] as Category[]);
    setState(prev =>
      prev.status === 'settings'
        ? { ...prev, sources, categories, articles: prev.articles.filter(a => a.sourceId !== sourceId) }
        : prev
    );
  }, []);

  const handleUnmute = useCallback((sourceId: string) => {
    unmuteSource(sourceId);
    setMutedIds(prev => { const next = new Set(prev); next.delete(sourceId); return next; });
    setMutedEntries(getMutedSources());
  }, []);

  // Auto-connect on mount if credentials are saved
  useEffect(() => {
    const saved = loadSavedConnection();
    if (!saved) return;

    const adapter = saved.adapterId === 'feedbin'
      ? new FeedbinAdapter()
      : new FreshRSSAdapter();
    adapter.authenticate(saved).then(result => {
      if (result.success) {
        loadData(adapter);
      } else {
        setState({ status: 'connect', error: 'Session expired. Please reconnect.' });
      }
    }).catch(() => {
      setState({ status: 'connect', error: 'Could not reach your server.' });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Render
  const isReady    = state.status === 'ready' || state.status === 'settings';
  const inSettings = state.status === 'settings';

  return (
    <>
      <AppShell
        theme={theme}
        onToggleTheme={toggle}
        onRefresh={isReady ? handleRefresh : undefined}
        refreshing={refreshing}
        onSettings={isReady ? handleSettings : undefined}
        inSettings={inSettings}
        onLogoClick={inSettings ? handleSettings : undefined}
        paused={isReady ? paused : undefined}
        onTogglePause={isReady ? handleTogglePause : undefined}
      >
        {state.status === 'connect' && (
          <ConnectScreen
            onConnect={handleConnect}
            initialError={state.error}
          />
        )}

        {state.status === 'loading' && (
          <LoadingView />
        )}

        {state.status === 'error' && (
          <ErrorView
            message={state.message}
            onRetry={() => setState({ status: 'connect' })}
          />
        )}

        {(state.status === 'ready' || state.status === 'settings') && (
          <>
            <ReadyView
              adapter={state.adapter}
              sources={state.sources}
              articles={state.articles}
              categories={state.categories}
              now={effectiveNow(now)}
              hidden={inSettings}
              mutedIds={mutedIds}
              onMute={handleMute}
              expiryDays={expiryDays}
            />
            {inSettings && (
              <Settings
                sources={state.sources}
                categories={state.categories}
                adapter={state.adapter}
                onUpdate={handleVelocityUpdate}
                onBulkVelocityUpdate={handleBulkVelocityUpdate}
                onCategoryChange={handleCategoryChange}
                onBulkCategoryChange={handleBulkCategoryChange}
                onImported={handleImported}
                mutedEntries={mutedEntries}
                onUnmute={handleUnmute}
                suggestions={generateSuggestions(state.sources)}
                onApplySuggestion={(sourceId, tier) => {
                  handleVelocityUpdate(sourceId, tier);
                  dismissSuggestion(sourceId);
                  setSuggestions(generateSuggestions(state.sources));
                }}
                onDismissSuggestion={(sourceId) => {
                  dismissSuggestion(sourceId);
                  setSuggestions(generateSuggestions(state.sources));
                }}
                onDeleteSource={handleDeleteSource}
                onExpiryChange={setExpiryDays}
                onTogglePin={handleTogglePin}
              />
            )}
          </>
        )}
      </AppShell>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function LoadingView() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 'calc(100vh - 57px)',
      fontFamily: 'var(--font-serif)',
      color: 'var(--text-muted)',
      fontSize: '1rem',
    }}>
      Loading your stream…
    </div>
  );
}

interface ErrorViewProps {
  message: string;
  onRetry: () => void;
}

function ErrorView({ message, onRetry }: ErrorViewProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem',
      minHeight: 'calc(100vh - 57px)',
      padding: '2rem',
      fontFamily: 'var(--font-sans)',
      color: 'var(--text-muted)',
      textAlign: 'center',
    }}>
      <p style={{ margin: 0, fontSize: '0.9375rem' }}>{message}</p>
      <button
        onClick={onRetry}
        style={{
          padding: '0.5rem 1rem',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: 'var(--bg)',
          background: 'var(--accent-new)',
          borderRadius: 'var(--radius)',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Reconnect
      </button>
    </div>
  );
}

interface ReadyViewProps {
  adapter: StreamAdapter;
  sources: Source[];
  articles: Article[];
  categories: Category[];
  now: number;
  hidden?: boolean;
  mutedIds: Set<string>;
  onMute: (sourceId: string, mutedUntil: number) => void;
  expiryDays: number;
}

function ReadyView({ adapter, sources, articles, categories, now, hidden, mutedIds, onMute, expiryDays }: ReadyViewProps) {
  const [openArticle, setOpenArticle]       = useState<Article | null>(null);
  const [showHelp, setShowHelp]             = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly]         = useState(false);
  const [savedOnly, setSavedOnly]           = useState(false);
  const [starredOverrides, setStarredOverrides] = useState<Map<string, boolean>>(new Map());

  // Global '?' shortcut — only when not typing in an input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, textarea, select, [contenteditable]')) return;
      if (e.key === '?') { e.preventDefault(); setShowHelp(prev => !prev); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const sourceMap = new Map(sources.map(s => [s.id, s]));

  const expiryCutoff = expiryDays > 0
    ? new Date(now - expiryDays * 24 * 60 * 60 * 1000)
    : null;

  const filteredArticles = articles.filter(a => {
    if (mutedIds.has(a.sourceId)) return false;
    const starred = starredOverrides.has(a.id) ? starredOverrides.get(a.id) : a.isStarred;
    if (savedOnly && !starred) return false;
    if (unreadOnly && a.isRead) return false;
    // Auto-expiry: remove old articles unless saved
    if (expiryCutoff && !starred && a.publishedAt < expiryCutoff) return false;
    if (activeCategory !== null) {
      const src = sourceMap.get(a.sourceId);
      if (!src || src.categoryId !== activeCategory) return false;
    }
    return true;
  });

  const scoredItems = savedOnly
    ? scoreRiver(filteredArticles, sourceMap, now, true)
    : scoreRiver(filteredArticles, sourceMap, now);

  const handleOpen = useCallback((article: Article) => {
    setOpenArticle(article);
    adapter.setArticleRead(article.id).catch(() => {});
    logArticleOpen(article.id, article.sourceId);
  }, [adapter]);

  const handleSave = useCallback(async (article: Article) => {
    const current = starredOverrides.has(article.id)
      ? starredOverrides.get(article.id)!
      : article.isStarred;
    const next = !current;
    setStarredOverrides(prev => new Map(prev).set(article.id, next));
    try {
      await adapter.setArticleStarred(article.id, next);
    } catch {
      setStarredOverrides(prev => {
        const m = new Map(prev);
        m.delete(article.id);
        return m;
      });
    }
  }, [adapter, starredOverrides]);

  const handleRead = useCallback(
    (article: Article) => adapter.setArticleRead(article.id),
    [adapter],
  );

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleShare = useCallback((article: Article) => {
    const doCopy = () => {
      navigator.clipboard.writeText(article.url).catch(() => {});
      setCopiedId(article.id);
      setTimeout(() => setCopiedId(null), 1500);
    };
    if (navigator.share) {
      navigator.share({ url: article.url, title: article.title }).catch(() => doCopy());
    } else {
      doCopy();
    }
  }, []);

  const river = useRiver(scoredItems, handleOpen, handleSave, handleRead, handleShare);

  const savedIds = useMemo(() => new Set(
    articles
      .filter(a => starredOverrides.has(a.id) ? starredOverrides.get(a.id) : a.isStarred)
      .map(a => a.id),
  ), [articles, starredOverrides]);

  // Count unread articles per category for the filter bar
  const unreadByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of articles) {
      if (a.isRead || mutedIds.has(a.sourceId)) continue;
      const src = sourceMap.get(a.sourceId);
      if (src?.categoryId) {
        counts.set(src.categoryId, (counts.get(src.categoryId) ?? 0) + 1);
      }
    }
    return counts;
  }, [articles, mutedIds, sourceMap]);

  const emptyMessage = savedOnly ? 'No saved articles yet.' : 'The stream is quiet.';

  return (
    <div hidden={hidden}>
      <FilterBar
        categories={categories}
        activeCategory={activeCategory}
        unreadOnly={unreadOnly}
        savedOnly={savedOnly}
        unreadByCategory={unreadByCategory}
        onCategory={setActiveCategory}
        onUnreadOnly={setUnreadOnly}
        onSavedOnly={setSavedOnly}
      />
      <River
        items={river.items}
        focusedIndex={river.focusedIndex}
        sourceMap={sourceMap}
        savedIds={savedIds}
        pendingUndo={river.pendingUndo}
        emptyMessage={emptyMessage}
        copiedId={copiedId}
        onDismiss={river.dismiss}
        onSave={river.save}
        onOpen={river.openItem}
        onUndo={river.undo}
        onMute={onMute}
      />
      {openArticle && (
        <ReadingView
          article={openArticle}
          source={sourceMap.get(openArticle.sourceId)}
          isSaved={savedIds.has(openArticle.id)}
          onSave={() => handleSave(openArticle)}
          onClose={() => setOpenArticle(null)}
        />
      )}
      {showHelp && <KeyboardHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
}
