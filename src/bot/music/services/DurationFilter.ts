export const MIN_DURATION_MS = 120_000;
export const MAX_DURATION_MS = 480_000;

export function isInDurationRange(track: any): boolean {
  const d = track.info?.length || track.info?.durationMs || track.info?.duration || 0;
  if (!d) return true;
  return d >= MIN_DURATION_MS && d <= MAX_DURATION_MS;
}
