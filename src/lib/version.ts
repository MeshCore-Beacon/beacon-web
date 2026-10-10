const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

// True when current is strictly older than min. Anything not plain X.Y.Z compares as "not below",
// so a bad value from the server can never lock users out.
export function isBelowVersion(current: string, min: string | null | undefined): boolean {
  const a = VERSION_RE.exec(current), b = min ? VERSION_RE.exec(min) : null;
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(a[i]) - Number(b[i]);
    if (diff !== 0) return diff < 0;
  }
  return false;
}
