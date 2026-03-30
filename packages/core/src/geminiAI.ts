import type { Category, Source } from './types.js';

const GEMINI_KEY_STORAGE  = 'stream-gemini-key';
const AI_DISMISSED_KEY    = 'stream-ai-dismissed';
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const GEMINI_MODEL        = 'gemini-2.5-flash';
const GEMINI_BASE         = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_SOURCES         = 100;

export interface AICategorySuggestion {
  sourceId: string;
  sourceTitle: string;
  suggestedCategoryName: string;
  isNewCategory: boolean;
  reason: string;
}

export interface AIFeedSuggestion {
  feedUrl: string;
  title: string;
  reason: string;
}

export interface AIVelocitySuggestion {
  categoryId: string;
  categoryTitle: string;
  suggestedTier: 1 | 2 | 3 | 4 | 5;
  reason: string;
}

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

export function loadGeminiKey(): string | null {
  return localStorage.getItem(GEMINI_KEY_STORAGE);
}

export function saveGeminiKey(key: string): void {
  localStorage.setItem(GEMINI_KEY_STORAGE, key.trim());
}

export function clearGeminiKey(): void {
  localStorage.removeItem(GEMINI_KEY_STORAGE);
}

// ---------------------------------------------------------------------------
// Dismissal
// ---------------------------------------------------------------------------

type DismissedMap = Record<string, number>; // id → dismissedUntil timestamp

function loadDismissed(): DismissedMap {
  try {
    const raw = localStorage.getItem(AI_DISMISSED_KEY);
    if (raw) return JSON.parse(raw) as DismissedMap;
  } catch {}
  return {};
}

export function dismissAISuggestion(id: string): void {
  const map = loadDismissed();
  map[id] = Date.now() + DISMISS_DURATION_MS;
  localStorage.setItem(AI_DISMISSED_KEY, JSON.stringify(map));
}

function notDismissed(id: string): boolean {
  const map = loadDismissed();
  const until = map[id];
  return !until || Date.now() >= until;
}

// ---------------------------------------------------------------------------
// Gemini API
// ---------------------------------------------------------------------------

async function callGemini(prompt: string): Promise<string> {
  const key = loadGeminiKey();
  if (!key) throw new Error('No Gemini API key configured.');

  const res = await fetch(`${GEMINI_BASE}?key=${encodeURIComponent(key)}`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini error ${res.status}${body ? `: ${body}` : ''}`);
  }

  const data = await res.json();
  const text: string = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
  if (!text) throw new Error('Empty response from Gemini.');

  // Strip markdown code fences if present
  return text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
}

/**
 * Tests whether the supplied key is valid by sending a minimal request.
 * Returns true if the API accepts it (HTTP 200).
 */
export async function testGeminiKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${GEMINI_BASE}?key=${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ contents: [{ parts: [{ text: 'Reply with: ok' }] }] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Category suggestions
// ---------------------------------------------------------------------------

/**
 * Asks Gemini to suggest categories for uncategorised feeds.
 * Only uncategorised sources are sent to Gemini — no article content or
 * reading data is ever included. Returns an empty array if all feeds are
 * already categorised.
 */
// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/** Normalise a feed URL for comparison: https, no www, no trailing slash. */
function normaliseUrl(url: string): string {
  try {
    const u = new URL(url.toLowerCase());
    u.protocol = 'https:';
    u.hostname = u.hostname.replace(/^www\./, '');
    return u.href.replace(/\/$/, '');
  } catch {
    return url.toLowerCase().trim().replace(/\/$/, '');
  }
}

/** Extract the base hostname (no www) for same-site deduplication. */
function baseHostname(url: string): string {
  try {
    return new URL(url.toLowerCase()).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Category titles that are placeholder "no real category" values
const UNCATEGORISED_TITLES = new Set(['uncategorized', 'uncategorised', 'unfiled', 'no category']);

export async function suggestCategories(
  sources: Source[],
  categories: Category[],
): Promise<AICategorySuggestion[]> {
  const categoryTitleMap = new Map(categories.map(c => [c.id, c.title.toLowerCase()]));

  const uncategorised = sources.filter(s => {
    if (!s.categoryId) return true;
    const title = categoryTitleMap.get(s.categoryId) ?? '';
    return UNCATEGORISED_TITLES.has(title);
  });
  if (uncategorised.length === 0) return [];

  const toClassify = uncategorised.slice(0, MAX_SOURCES);
  // Exclude placeholder category names from the list we offer Gemini as existing options
  const existingNames = categories
    .filter(c => !UNCATEGORISED_TITLES.has(c.title.toLowerCase()))
    .map(c => c.title);

  const prompt =
`You are a feed reader assistant helping to organise RSS feeds.
Existing categories: ${existingNames.length > 0 ? existingNames.join(', ') : 'None yet'}

Uncategorised feeds to classify:
${toClassify.map(s => `- id: "${s.id}" | title: "${s.title}" | url: ${s.feedUrl}`).join('\n')}

For each feed, suggest which category it belongs in. Use existing categories where possible, or propose new ones. Group similar feeds together. Each reason should be one concise sentence.

Return a JSON array only — no explanation, no code fences:
[{ "sourceId": "...", "categoryName": "...", "reason": "..." }]`;

  const raw    = await callGemini(prompt);
  const parsed = JSON.parse(raw) as Array<{ sourceId: string; categoryName: string; reason: string }>;

  const existingSet = new Set(existingNames.map(n => n.toLowerCase()));
  const sourceMap   = new Map(sources.map(s => [s.id, s]));

  return parsed
    .filter(item =>
      typeof item.sourceId     === 'string' &&
      typeof item.categoryName === 'string' &&
      typeof item.reason       === 'string' &&
      sourceMap.has(item.sourceId) &&
      notDismissed(item.sourceId),
    )
    .map(item => ({
      sourceId:              item.sourceId,
      sourceTitle:           sourceMap.get(item.sourceId)!.title,
      suggestedCategoryName: item.categoryName,
      isNewCategory:         !existingSet.has(item.categoryName.toLowerCase()),
      reason:                item.reason,
    }));
}

// ---------------------------------------------------------------------------
// Feed suggestions
// ---------------------------------------------------------------------------

/**
 * Asks Gemini to suggest new feeds the user might enjoy.
 * Only feed titles and URLs are sent — no article content or reading data.
 */
export async function suggestFeeds(
  sources: Source[],
  categories: Category[],
): Promise<AIFeedSuggestion[]> {
  const categoryMap = new Map(categories.map(c => [c.id, c.title]));
  const toSend      = sources.slice(0, MAX_SOURCES);

  const prompt =
`You are a feed reader assistant. Suggest RSS/Atom feeds the user might enjoy based on their subscriptions.

Current subscriptions:
${toSend.map(s => `- "${s.title}" (${s.feedUrl})${s.categoryId ? ` [${categoryMap.get(s.categoryId) ?? s.categoryId}]` : ''}`).join('\n')}
${sources.length > MAX_SOURCES ? `...and ${sources.length - MAX_SOURCES} more.` : ''}

Suggest 5–8 other RSS/Atom feeds the user might enjoy. Use real, active feed URLs. Each reason should be one concise sentence.

Return a JSON array only — no explanation, no code fences:
[{ "feedUrl": "https://...", "title": "...", "reason": "..." }]`;

  const raw    = await callGemini(prompt);
  const parsed = JSON.parse(raw) as Array<{ feedUrl: string; title: string; reason: string }>;

  const existingNormUrls = new Set(sources.map(s => normaliseUrl(s.feedUrl)));
  const existingHosts    = new Set(sources.map(s => baseHostname(s.feedUrl)).filter(Boolean));

  return parsed
    .filter(item =>
      typeof item.feedUrl === 'string' &&
      typeof item.title   === 'string' &&
      typeof item.reason  === 'string' &&
      item.feedUrl.startsWith('http') &&
      !existingNormUrls.has(normaliseUrl(item.feedUrl)) &&
      !existingHosts.has(baseHostname(item.feedUrl)) &&
      notDismissed(item.feedUrl),
    )
    .map(item => ({
      feedUrl: item.feedUrl,
      title:   item.title,
      reason:  item.reason,
    }));
}

// ---------------------------------------------------------------------------
// Velocity tier suggestions
// ---------------------------------------------------------------------------

/**
 * Asks Gemini to suggest velocity tiers for each category.
 * Only category names and feed titles are sent — no article content.
 */
export async function suggestVelocityTiers(
  sources: Source[],
  categories: Category[],
): Promise<AIVelocitySuggestion[]> {
  const catSources = new Map<string, Source[]>();
  for (const s of sources) {
    if (!s.categoryId) continue;
    if (!catSources.has(s.categoryId)) catSources.set(s.categoryId, []);
    catSources.get(s.categoryId)!.push(s);
  }

  const catMap = new Map(categories.map(c => [c.id, c]));
  const validCats = [...catSources.keys()]
    .map(id => catMap.get(id))
    .filter((c): c is Category => !!c && !UNCATEGORISED_TITLES.has(c.title.toLowerCase()));

  if (validCats.length === 0) return [];

  const catList = validCats.map(c => {
    const srcs  = catSources.get(c.id) ?? [];
    const sample = srcs.slice(0, 5).map(s => s.title).join(', ');
    return `- id: "${c.id}" | name: "${c.title}" | feeds: ${srcs.length} (${sample}${srcs.length > 5 ? ', …' : ''})`;
  }).join('\n');

  const prompt =
`You are a feed reader assistant. Suggest velocity tiers for RSS feed categories.

Velocity tiers:
- Tier 1 (3h half-life): Breaking news, live events
- Tier 2 (12h half-life): Daily news, frequent updates
- Tier 3 (24h half-life): Regular blogs, standard publications (default)
- Tier 4 (72h half-life): Weekly digests, slower analysis
- Tier 5 (168h half-life): Essays, long-form, reference, rarely updated

Categories:
${catList}

For each category, suggest the most appropriate tier based on the name and feed titles. Each reason should be one concise sentence.

Return a JSON array only — no explanation, no code fences:
[{ "categoryId": "...", "categoryTitle": "...", "suggestedTier": 1, "reason": "..." }]`;

  const raw    = await callGemini(prompt);
  const parsed = JSON.parse(raw) as Array<{
    categoryId: string;
    categoryTitle: string;
    suggestedTier: number;
    reason: string;
  }>;

  const validTiers = new Set([1, 2, 3, 4, 5]);

  return parsed
    .filter(item =>
      typeof item.categoryId    === 'string' &&
      typeof item.categoryTitle === 'string' &&
      typeof item.reason        === 'string' &&
      validTiers.has(item.suggestedTier) &&
      catMap.has(item.categoryId) &&
      !UNCATEGORISED_TITLES.has((catMap.get(item.categoryId)?.title ?? '').toLowerCase()) &&
      notDismissed(`velocity:${item.categoryId}`),
    )
    .map(item => ({
      categoryId:    item.categoryId,
      categoryTitle: item.categoryTitle,
      suggestedTier: item.suggestedTier as 1 | 2 | 3 | 4 | 5,
      reason:        item.reason,
    }));
}
