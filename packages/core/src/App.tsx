import { useState, useEffect } from 'preact/hooks';
import { scoreRiver } from './riverEngine.js';
import { useRiver } from './hooks/useRiver.js';
import { River } from './components/River.js';
import type { Article, Source } from './types.js';
import './theme.css';

// ---------------------------------------------------------------------------
// Mock data — spread across 4 sources/tiers so the aging gradient is obvious
// ---------------------------------------------------------------------------

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);

const MOCK_SOURCES: Source[] = [
  {
    id: 's1',
    title: 'Breaking Wire',
    feedUrl: '',
    velocityTier: 1,   // 3h half-life
    isVoice: false,
  },
  {
    id: 's2',
    title: 'Tech Digest',
    feedUrl: '',
    velocityTier: 2,   // 12h half-life
    isVoice: false,
  },
  {
    id: 's3',
    title: 'Long Reads',
    feedUrl: '',
    velocityTier: 4,   // 72h half-life
    isVoice: false,
  },
  {
    id: 's4',
    title: 'Evergreen Weekly',
    feedUrl: '',
    velocityTier: 5,   // 168h half-life
    isVoice: false,
  },
];

const MOCK_ARTICLES: Article[] = [
  // Breaking Wire (3h half-life) — 30m, 2h, 6h articles
  {
    id: 'a1',
    sourceId: 's1',
    title: 'Markets edge higher as central banks signal pause on rate rises',
    author: 'Reuters',
    url: '#',
    content: 'Global equities climbed on Thursday after policymakers at two major central banks hinted they may hold rates steady at upcoming meetings, easing fears of a prolonged tightening cycle.',
    publishedAt: ago(0.5),
    isRead: false,
    isStarred: false,
  },
  {
    id: 'a2',
    sourceId: 's1',
    title: 'New wildfire warning issued for southern California counties',
    author: 'AP',
    url: '#',
    content: 'The National Weather Service has issued a red flag warning covering parts of Los Angeles, Ventura, and San Bernardino counties through Saturday, citing strong offshore winds and critically low humidity.',
    publishedAt: ago(2),
    isRead: false,
    isStarred: false,
  },
  {
    id: 'a3',
    sourceId: 's1',
    title: 'UN Security Council holds emergency session over disputed territory',
    author: 'AFP',
    url: '#',
    content: 'Members of the Security Council convened in an unscheduled session to discuss rising tensions along a disputed border, with several delegations calling for immediate de-escalation.',
    publishedAt: ago(6),
    isRead: false,
    isStarred: false,
  },

  // Tech Digest (12h half-life) — 1h, 10h, 20h articles
  {
    id: 'a4',
    sourceId: 's2',
    title: 'Valve quietly updates Steam Deck OLED firmware with new suspend behaviour',
    author: 'Ars Technica',
    url: '#',
    content: 'The latest SteamOS beta introduces a revised power management model that dramatically reduces battery drain during standby, a persistent complaint since the OLED model launched.',
    publishedAt: ago(1),
    isRead: false,
    isStarred: false,
  },
  {
    id: 'a5',
    sourceId: 's2',
    title: 'Firefox 130 ships with cross-origin isolation improvements',
    author: 'The Verge',
    url: '#',
    content: 'Mozilla has shipped Firefox 130, bringing changes to how the browser handles cross-origin isolation headers, making it easier for developers to enable SharedArrayBuffer without a full COOP/COEP deployment.',
    publishedAt: ago(10),
    isRead: false,
    isStarred: false,
  },
  {
    id: 'a6',
    sourceId: 's2',
    title: 'Open-source project releases offline-first sync library for SQLite',
    author: 'Hacker News',
    url: '#',
    content: 'A small team of database engineers has published a permissive-licensed library that brings conflict-free replicated data type semantics to SQLite, targeting local-first applications.',
    publishedAt: ago(20),
    isRead: false,
    isStarred: false,
  },

  // Long Reads (72h half-life) — 5h, 48h, 90h articles
  {
    id: 'a7',
    sourceId: 's3',
    title: 'The cartography of forgetting: how maps make memory',
    author: 'Aeon',
    url: '#',
    content: 'Every map is an argument about what matters. When we decide what to include and what to omit, we are not just recording space — we are shaping how future generations will remember it.',
    publishedAt: ago(5),
    isRead: false,
    isStarred: false,
  },
  {
    id: 'a8',
    sourceId: 's3',
    title: 'On slowness: a defence of the long project',
    author: 'Craig Mod',
    url: '#',
    content: 'There is a particular kind of work that cannot be hurried. Not because the maker is slow, but because the work itself requires a duration — an accumulation of attention that has no shortcut.',
    publishedAt: ago(48),
    isRead: false,
    isStarred: false,
  },
  {
    id: 'a9',
    sourceId: 's3',
    title: 'Why economists keep getting inequality wrong',
    author: 'Boston Review',
    url: '#',
    content: 'The models we use to measure economic inequality were designed in an era of wage labour and relatively stable asset prices. Neither assumption holds today, and the gap between what the models show and what people experience keeps widening.',
    publishedAt: ago(90),
    isRead: false,
    isStarred: false,
  },

  // Evergreen Weekly (168h half-life) — 24h, 96h, 144h articles
  {
    id: 'a10',
    sourceId: 's4',
    title: 'A practical guide to CSS custom properties',
    author: 'Smashing Magazine',
    url: '#',
    content: 'CSS custom properties are not just variables. They are scope-aware, inheritable, and dynamic at runtime — properties that make them fundamentally different from preprocessor variables.',
    publishedAt: ago(24),
    isRead: false,
    isStarred: false,
  },
  {
    id: 'a11',
    sourceId: 's4',
    title: 'How to write a technical decision record',
    author: 'Joel on Software',
    url: '#',
    content: 'A decision record is a short document that captures an important architectural decision: what it was, why it was made, and what alternatives were considered. The value compounds over years.',
    publishedAt: ago(96),
    isRead: false,
    isStarred: false,
  },
  {
    id: 'a12',
    sourceId: 's4',
    title: 'The unreasonable effectiveness of plain text',
    author: 'Paul Graham',
    url: '#',
    content: 'Plain text has survived every wave of software fashion for fifty years. The reason is not inertia. It is that plain text is the format closest to thought — and thought does not have a version number.',
    publishedAt: ago(144),
    isRead: false,
    isStarred: false,
  },
];

// ---------------------------------------------------------------------------

const SOURCE_MAP = new Map<string, Source>(MOCK_SOURCES.map(s => [s.id, s]));

export function App() {
  // Recalculate scores every 60s so cards age visibly during a session
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const scoredItems = scoreRiver(MOCK_ARTICLES, SOURCE_MAP, now);
  const river = useRiver(scoredItems);

  return (
    <River
      items={river.items}
      focusedIndex={river.focusedIndex}
      sourceMap={SOURCE_MAP}
      pendingUndo={river.pendingUndo}
      onDismiss={river.dismiss}
      onSave={river.save}
      onUndo={river.undo}
    />
  );
}
