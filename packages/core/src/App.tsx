import { useState } from 'preact/hooks';

export function App() {
  const [ready] = useState(false);

  // TODO: Phase 1 — replace with connection check + river load
  return (
    <main>
      <h1>Stream</h1>
      {!ready && (
        <p>Connect your RSS backend to begin.</p>
      )}
    </main>
  );
}
