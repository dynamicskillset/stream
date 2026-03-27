const QUIET_KEY = 'stream-quiet-hours';

interface QuietHoursState {
  pausedAt?: number;     // wall timestamp when the current pause started (undefined = not paused)
  accumulatedMs: number; // total paused time accumulated from all previous pause sessions
}

const DEFAULTS: QuietHoursState = { accumulatedMs: 0 };

function load(): QuietHoursState {
  try {
    const raw = localStorage.getItem(QUIET_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

function save(state: QuietHoursState): void {
  localStorage.setItem(QUIET_KEY, JSON.stringify(state));
}

export function isPaused(): boolean {
  return load().pausedAt !== undefined;
}

export function pauseRiver(): void {
  const state = load();
  if (state.pausedAt !== undefined) return; // already paused
  save({ ...state, pausedAt: Date.now() });
}

export function resumeRiver(): void {
  const state = load();
  if (state.pausedAt === undefined) return; // not paused
  const additionalMs = Date.now() - state.pausedAt;
  save({ accumulatedMs: state.accumulatedMs + additionalMs });
}

/**
 * Returns the effective "now" timestamp for use in river scoring.
 * While paused, the effective now does not advance — articles don't fade further.
 * Time spent paused is subtracted from the wall clock.
 *
 * @param wallNow  Current wall-clock timestamp (Date.now()).
 */
export function effectiveNow(wallNow: number): number {
  const state = load();
  const currentPauseMs = state.pausedAt !== undefined ? wallNow - state.pausedAt : 0;
  return wallNow - state.accumulatedMs - currentPauseMs;
}
