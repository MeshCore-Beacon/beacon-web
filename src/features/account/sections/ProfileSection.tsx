import type { ReactNode } from "react";

// One titled block with a thin divider; the heading names the region for assistive tech.
export function ProfileSection({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-border-subtle pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="font-mono text-sm font-semibold text-text-bright">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
