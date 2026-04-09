// Minimal fixture data for FreshRSS Google Reader API responses.
// Routes are intercepted by Playwright — no real backend needed.

export const BASE_URL = 'https://test.freshrss.local';

export const AUTH_RESPONSE = 'SID=test-sid\nLSID=test-lsid\nAuth=test-auth-token\n';

export const T_TOKEN_RESPONSE = 'test-t-token';

export const SUBSCRIPTIONS_RESPONSE = {
  subscriptions: [
    {
      id: 'feed/https://example.com/tech.xml',
      title: 'Tech News',
      htmlUrl: 'https://example.com',
      url: 'https://example.com/tech.xml',
      iconUrl: '',
      categories: [{ id: 'user/-/label/Tech', label: 'Tech' }],
    },
    {
      id: 'feed/https://example.com/science.xml',
      title: 'Science Weekly',
      htmlUrl: 'https://science.example.com',
      url: 'https://example.com/science.xml',
      iconUrl: '',
      categories: [{ id: 'user/-/label/Science', label: 'Science' }],
    },
  ],
};

export const TAGS_RESPONSE = {
  tags: [
    { id: 'user/-/label/Tech' },
    { id: 'user/-/label/Science' },
    { id: 'user/-/state/com.google/starred' },
    { id: 'user/-/state/com.google/read' },
  ],
};

const now = Math.floor(Date.now() / 1000);

export const STREAM_RESPONSE = {
  items: [
    {
      id: 'tag:google.com,2005:reader/item/0001',
      title: 'Breakthrough in quantum computing announced',
      canonical: [{ href: 'https://example.com/article-1' }],
      author: 'Alice Reporter',
      published: now - 3600,
      summary: { content: '<p>Scientists have made a major breakthrough in quantum computing today.</p>' },
      origin: { streamId: 'feed/https://example.com/tech.xml' },
      categories: [],
    },
    {
      id: 'tag:google.com,2005:reader/item/0002',
      title: 'New species discovered in deep ocean',
      canonical: [{ href: 'https://example.com/article-2' }],
      author: 'Bob Writer',
      published: now - 7200,
      summary: { content: '<p>Marine biologists have identified a previously unknown species.</p>' },
      origin: { streamId: 'feed/https://example.com/science.xml' },
      categories: [],
    },
    {
      id: 'tag:google.com,2005:reader/item/0003',
      title: 'Open source AI model tops benchmarks',
      canonical: [{ href: 'https://example.com/article-3' }],
      author: 'Carol Dev',
      published: now - 10800,
      summary: { content: '<p>A new open source model has outperformed proprietary alternatives.</p>' },
      origin: { streamId: 'feed/https://example.com/tech.xml' },
      categories: [],
    },
  ],
};

// localStorage connection config that skips the connect screen
export const SAVED_CONNECTION = {
  adapterId: 'freshrss',
  baseUrl: BASE_URL,
  username: 'testuser',
  password: 'testpass',
};
