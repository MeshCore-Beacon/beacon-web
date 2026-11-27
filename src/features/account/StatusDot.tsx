import type { Tone } from "./requestStatus";

const DOT: Record<Tone, string> = { ok: "bg-green", wait: "bg-warn", bad: "bg-danger", idle: "bg-text-dim" };

export function StatusDot({ tone }: { tone: Tone }) {
  return <span aria-hidden data-tone={tone} className={`mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} />;
}
