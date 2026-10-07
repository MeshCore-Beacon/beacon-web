import { useTranslation } from "react-i18next";

const SPARK_W = 120;
const SPARK_H = 24;
const sparkSpacer = <div className="mt-1 h-6" />;

export function Sparkline({ values, color, markPeak, times, gapMs }: { values: (number | null)[]; color: string; markPeak?: boolean; times?: number[]; gapMs?: number }) {
  const { t } = useTranslation();
  const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const max = known.length ? Math.max(...known) : 0, min = known.length ? Math.min(...known) : 0;
  const range = max - min;
  const timed = times?.length === values.length && times.every((v,i) => Number.isFinite(v) && (!i || v > times[i-1]!)) && times.at(-1)! > times[0]! ? times : null;
  const x = (i: number) => timed ? 2 + (timed[i]! - timed[0]!) / (timed.at(-1)! - timed[0]!) * (SPARK_W - 4) : values.length > 1 ? 2 + i / (values.length - 1) * (SPARK_W - 4) : SPARK_W / 2;
  const y = (v: number) => range ? SPARK_H - 3 - (v - min) / range * (SPARK_H - 6) : SPARK_H / 2;
  const runs: string[][] = [], bridges: [number,number][] = [];
  let previous = -1;
  values.forEach((v,i) => {
    if (v === null || !Number.isFinite(v)) return;
    const gap = previous >= 0 && (i > previous + 1 || !!(timed && gapMs && timed[i]! - timed[previous]! > gapMs));
    if (previous < 0 || gap) runs.push([]);
    if (gap) bridges.push([previous,i]);
    runs.at(-1)!.push(`${x(i)},${y(v)}`); previous = i;
  });
  const peak = values.indexOf(max);
  return <svg width="100%" height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" className="beacon-sparkline mt-1 overflow-visible" style={{color}} aria-hidden>
    <title>{t("charts.gapLegend")}</title>
    {known.length === 0 && <line data-no-data x1="0" x2={SPARK_W} y1={SPARK_H/2} y2={SPARK_H/2} stroke={color} strokeWidth="0.6" strokeDasharray="2 4" opacity="0.18" />}
    {bridges.map(([a,b]) => <line key={`gap-${a}`} data-gap x1={x(a)} y1={y(values[a]!)} x2={x(b)} y2={y(values[b]!)} stroke={color} strokeWidth="1.3" strokeDasharray="3 3" opacity="0.55" vectorEffect="non-scaling-stroke" />)}
    {runs.map(run => run.length > 1 ? <polyline key={run[0]} fill="none" stroke={color} strokeWidth="1.8" points={run.join(" ")} vectorEffect="non-scaling-stroke" /> : <polyline key={run[0]} data-sample points={`${run[0]} ${run[0]}`} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
    {markPeak && known.length > 0 && <line data-peak x1={x(peak)} x2={x(peak)} y1={y(max)} y2={y(max)} stroke={color} strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
  </svg>;
}

// One bar per run of hours that reported, so gaps read at a glance.
export function PresenceStrip({ hours, color }: { hours: boolean[]; color: string }) {
  if (hours.length === 0) return sparkSpacer;
  const slot = SPARK_W / hours.length;
  const bars: { start: number; length: number }[] = [];
  hours.forEach((on, i) => {
    const last = bars.at(-1);
    if (!on) return;
    if (last && last.start + last.length === i) last.length++;
    else bars.push({ start: i, length: 1 });
  });
  return (
    <svg width="100%" height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" className="mt-1.5" aria-hidden>
      <line x1="0" x2={SPARK_W} y1={SPARK_H / 2} y2={SPARK_H / 2} stroke={color} strokeWidth="1" opacity="0.25" />
      {bars.map((bar) => (
        <rect key={bar.start} x={bar.start * slot} y={SPARK_H / 2 - 4} width={bar.length * slot} height="8" fill={color} />
      ))}
    </svg>
  );
}
