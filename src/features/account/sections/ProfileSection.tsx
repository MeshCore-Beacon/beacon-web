import type { ReactNode } from "react";

// One titled block with a thin divider; the heading names the region for assistive tech.
export function ProfileSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-border-subtle pt-5">
      <h2 id={id} className="font-mono text-sm font-semibold text-text-bright">{title}</h2>
      {children}
    </section>
  );
}
