import { useState, useEffect, useCallback } from 'preact/hooks';
import { scoreRiver, HALF_LIVES } from './riverEngine.js';
import { useRiver } from './hooks/useRiver.js';
import { useTheme } from './hooks/useTheme.js';
import { River } from './components/River.js';
import { AppShell } from './components/AppShell.js';
import { ConnectScreen } from './components/ConnectScreen.js';
import { VelocitySettings } from './components/VelocitySettings.js';
import { ReadingView } from './components/ReadingView.js';
import { FreshRSSAdapter } from './adapters/freshrss.js';
import { FeedbinAdapter } from './adapters/feedbin.js';
import type { Article, Source, StreamAdapter, AdapterConfig } from './types.js';
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
  | { status: 'ready';     adapter: StreamAdapter; sources: Source[]; articles: Article[] }
  | { status: 'settings';  adapter: StreamAdapter; sources: Source[]; articles: Article[] }
  | { status: 'error';     message: string };

export function App() {
  const { theme, toggle } = useTheme();
  const [state, setState] = useState<AppState>({ status: 'connect' });
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Live score recalculation every 60s
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const loadData = useCallback(async (adapter: StreamAdapter) => {
    setState({ status: 'loading', adapter });
    try {
      const rawSources = await adapter.fetchSources();
      const sources    = applySavedVelocity(rawSources, loadVelocityConfig());
      const articles   = await fetchAllArticles(adapter, sources);
      setState({ status: 'ready', adapter, sources, articles });
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
      if (prev.status === 'settings') return { ...prev, status: 'ready' };
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

  const handleRefresh = useCallback(async () => {
    if (state.status !== 'ready' || refreshing) return;
    setRefreshing(true);
    try {
      const sources  = applySavedVelocity(
        await state.adapter.fetchSources(), loadVelocityConfig()
      );
      const articles = await fetchAllArticles(state.adapter, sources);
      setState(prev =>
        prev.status === 'ready'
          ? { ...prev, sources, articles }
          : prev
      );
    } catch {
      // Silent fail on refresh — keep existing data
    } finally {
      setRefreshing(false);
    }
  }, [state, refreshing]);

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
              now={now}
              hidden={inSettings}
            />
            {inSettings && (
              <VelocitySettings
                sources={state.sources}
                adapter={state.adapter}
                onUpdate={handleVelocityUpdate}
                onImported={handleImported}
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
      Loading your river…
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
  now: number;
  hidden?: boolean;
}

function ReadyView({ adapter, sources, articles, now, hidden }: ReadyViewProps) {
  const [openArticle, setOpenArticle] = useState<Article | null>(null);

  const sourceMap   = new Map(sources.map(s => [s.id, s]));
  const scoredItems = scoreRiver(articles, sourceMap, now);

  const handleOpen = useCallback((article: Article) => {
    setOpenArticle(article);
    adapter.setArticleRead(article.id).catch(() => {});
  }, [adapter]);

  const handleSave = useCallback(
    (article: Article) => adapter.setArticleStarred(article.id, true),
    [adapter],
  );

  const handleRead = useCallback(
    (article: Article) => adapter.setArticleRead(article.id),
    [adapter],
  );

  const river = useRiver(scoredItems, handleOpen, handleSave, handleRead);

  return (
    <div style={hidden ? { display: 'none' } : undefined}>
      <River
        items={river.items}
        focusedIndex={river.focusedIndex}
        sourceMap={sourceMap}
        savedIds={river.savedIds}
        pendingUndo={river.pendingUndo}
        onDismiss={river.dismiss}
        onSave={river.save}
        onOpen={river.openItem}
        onUndo={river.undo}
      />
      {openArticle && (
        <ReadingView
          article={openArticle}
          source={sourceMap.get(openArticle.sourceId)}
          isSaved={river.savedIds.has(openArticle.id)}
          onSave={() => river.save(openArticle.id)}
          onClose={() => setOpenArticle(null)}
        />
      )}
    </div>
  );
}
