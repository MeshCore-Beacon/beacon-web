import type { ReactNode } from "react";

// One card with a heading and one purpose; the heading names the region for assistive tech.
export function ProfileSection({ id, title, description, aside, danger, children }: { id: string; title: string; description?: ReactNode; aside?: ReactNode; danger?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`flex flex-col gap-4 rounded-lg border bg-bg-surface p-4 sm:p-6 ${danger ? "border-danger/40" : "border-border"}`}>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id={id} className="font-mono text-base font-semibold text-text-bright">{title}</h2>
          {aside}
        </div>
        {description && <p className="text-sm text-text-muted">{description}</p>}
      </header>
      {children}
    </section>
  );
}

// The little heading inside a card that holds more than one form.
export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="font-mono text-sm font-semibold text-text-bright">{children}</h3>;
}
