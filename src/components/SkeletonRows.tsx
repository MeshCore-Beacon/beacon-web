// placeholder rows shown while a list/table loads, in place of bare "loading…" text

interface SkeletonRowsProps {
  rows?: number;
}

export function SkeletonRows({ rows = 8 }: SkeletonRowsProps) {
  return (
    <div className="flex flex-col gap-2 p-4" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-7 rounded bg-bg-raised animate-pulse"
          style={{ opacity: Math.max(1 - i * 0.07, 0.3) }}
        />
      ))}
    </div>
  );
}
