import { useState } from 'preact/hooks';
import { FreshRSSAdapter } from '../adapters/freshrss.js';
import type { StreamAdapter, AdapterConfig } from '../types.js';
import styles from './ConnectScreen.module.css';

interface ConnectScreenProps {
  onConnect: (adapter: StreamAdapter, config: AdapterConfig & { adapterId: string }) => void;
  initialError?: string;
}

export function ConnectScreen({ onConnect, initialError }: ConnectScreenProps) {
  const [backend, setBackend] = useState<'freshrss' | 'feedbin'>('freshrss');
  const [url, setUrl]         = useState('');
  const [user, setUser]       = useState('');
  const [pass, setPass]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(initialError ?? '');

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const adapter = new FreshRSSAdapter();
      const config: AdapterConfig = {
        baseUrl:  url.replace(/\/$/, ''),
        username: user,
        password: pass,
      };

      const result = await adapter.authenticate(config);

      if (!result.success) {
        setError(result.error ?? 'Could not connect. Check your URL and credentials.');
        return;
      }

      onConnect(adapter, { ...config, adapterId: 'freshrss' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class={styles.wrap}>
      <div class={styles.card}>
        <h1 class={styles.heading}>Connect Stream</h1>
        <p class={styles.sub}>
          Stream connects to your existing RSS backend. Your credentials stay on your device.
        </p>

        <div class={styles.tabs} role="tablist">
          <button
            class={`${styles.tab} ${backend === 'freshrss' ? styles.active : ''}`}
            role="tab"
            aria-selected={backend === 'freshrss'}
            onClick={() => setBackend('freshrss')}
          >
            FreshRSS
          </button>
          <button
            class={`${styles.tab} ${styles.disabled}`}
            role="tab"
            aria-selected={false}
            disabled
          >
            Feedbin
            <span class={styles.comingSoon}>coming soon</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {backend === 'freshrss' && (
            <div class={styles.field}>
              <label class={styles.label} for="freshrss-url">Server URL (root, not /api)</label>
              <input
                id="freshrss-url"
                class={styles.input}
                type="url"
                placeholder="https://freshrss.example.com"
                value={url}
                onInput={e => setUrl((e.target as HTMLInputElement).value)}
                required
                autocomplete="url"
                spellcheck={false}
              />
            </div>
          )}

          <div class={styles.field}>
            <label class={styles.label} for="stream-user">Username</label>
            <input
              id="stream-user"
              class={styles.input}
              type="text"
              placeholder="you@example.com"
              value={user}
              onInput={e => setUser((e.target as HTMLInputElement).value)}
              required
              autocomplete="username"
              spellcheck={false}
            />
          </div>

          <div class={styles.field}>
            <label class={styles.label} for="stream-pass">
              {backend === 'freshrss' ? 'API password' : 'Password'}
            </label>
            <input
              id="stream-pass"
              class={styles.input}
              type="password"
              placeholder="••••••••"
              value={pass}
              onInput={e => setPass((e.target as HTMLInputElement).value)}
              required
              autocomplete="current-password"
            />
            {backend === 'freshrss' && (
              <p class={styles.hint}>
                Not your login password — set one under Settings → Profile → API management.
              </p>
            )}
          </div>

          {error && <p class={styles.error} role="alert">{error}</p>}

          <button class={styles.submit} type="submit" disabled={loading}>
            {loading && <span class={styles.spinner} aria-hidden="true" />}
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  );
}
