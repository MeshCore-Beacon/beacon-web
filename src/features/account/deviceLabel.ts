const MAX = 60;

// Browser and OS family only, so the sessions list reads "Firefox on macOS" and carries no fingerprint.
export function deviceLabel(userAgent: string): string {
  const ua = userAgent.slice(0, 400);
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\/|FxiOS/.test(ua) ? "Firefox"
    : /Chrome\/|CriOS/.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : null;
  const os = /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /CrOS/.test(ua) ? "ChromeOS"
    : /Linux|X11/.test(ua) ? "Linux"
    : null;
  const label = browser && os ? `${browser} on ${os}` : (browser ?? os ?? "Web browser");
  return label.slice(0, MAX);
}
