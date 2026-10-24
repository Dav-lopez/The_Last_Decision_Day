export type SchoolTimeBalance = {
  dailyLimit: number;
  spent: number;
  remaining: number;
  resetsAt: string;
};

/** Invalid or missing reset timestamps must not permit new activity executions. */
export function millisecondsUntilReset(balance: SchoolTimeBalance | null, nowMs = Date.now()): number | null {
  if (!balance) return null;
  const resetMs = Date.parse(balance.resetsAt);
  if (!Number.isFinite(resetMs) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, resetMs - nowMs);
}

export function canStartSchoolActivity(
  balance: SchoolTimeBalance | null,
  cost: number,
  nowMs = Date.now(),
): boolean {
  const remainingMs = millisecondsUntilReset(balance, nowMs);
  return balance !== null &&
    remainingMs !== null && remainingMs > 0 &&
    Number.isInteger(cost) && cost > 0 &&
    Number.isInteger(balance.remaining) && balance.remaining >= cost;
}
