/**
 * Live / finished match clock line: API-Football often keeps statusShort as AET while
 * populating score.penalty — prefer showing the shootout over "120'".
 */
export function liveFixtureClockLabel(
  statusShort: string,
  elapsedMinutes: number | null,
  penaltyHome: number | null | undefined,
  penaltyAway: number | null | undefined,
  isFinished: boolean,
): string {
  if (!isFinished) {
    return elapsedMinutes != null ? `${elapsedMinutes}'` : statusShort;
  }
  if (penaltyHome != null && penaltyAway != null) {
    return `Pens ${penaltyHome}–${penaltyAway}`;
  }
  if (statusShort === "PEN") {
    return "Penalties";
  }
  if (elapsedMinutes != null) {
    return `${elapsedMinutes}'`;
  }
  return statusShort;
}
