// Tree-shaken ECharts registration. Import `echarts` from here (never the `echarts` barrel) so the
// bundle only pulls the chart types + components the Stats page actually uses. We deliberately avoid
// the `echarts-for-react` wrapper (it was hit by a supply-chain attack 2026-05-19); EChart.tsx wraps
// the core API directly instead.
import * as echarts from "echarts/core";
import { LineChart, BarChart, PieChart, GaugeChart } from "echarts/charts";
import {
  GridComponent,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GraphicComponent,
  DataZoomComponent,
  MarkLineComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GaugeChart,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GraphicComponent,
  DataZoomComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export { echarts };
export type EChartsInstance = ReturnType<typeof echarts.init>;
export type EChartsOption = Parameters<EChartsInstance["setOption"]>[0];
