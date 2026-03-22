import { useState, useEffect } from 'preact/hooks';

export function formatRelativeTime(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) return 'just now';

  const diffMins  = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays  = Math.floor(diffMs / 86_400_000);

  if (diffMins  < 1)  return 'just now';
  if (diffMins  < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'yesterday';

  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function useRelativeTime(date: Date): string {
  const [text, setText] = useState(() => formatRelativeTime(date, new Date()));

  useEffect(() => {
    const interval = setInterval(() => {
      setText(formatRelativeTime(date, new Date()));
    }, 60_000);
    return () => clearInterval(interval);
  }, [date]);

  return text;
}
