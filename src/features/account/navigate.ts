// A seam so tests can observe the hand-off to the app without a real navigation.
export function navigateTo(url: string): void {
  window.location.assign(url);
}
