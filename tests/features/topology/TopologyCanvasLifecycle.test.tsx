import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TopologyCanvas } from "../../../src/features/topology/TopologyCanvas";
import { createRenderer } from "../../../src/features/topology/topology-renderer";
import { buildTopology, LiveTraffic, DEFAULT_CAMERA } from "../../../src/features/topology/topology";
import type { ChartColors } from "../../../src/features/stats/chartTheme";
import type { NodeSummary } from "../../../src/features/nodes/types";

vi.mock("../../../src/features/topology/topology-renderer",()=>({createRenderer:vi.fn()}));

it("releases inactive canvas resources and restores its camera on return",()=>{
  const view={camera:DEFAULT_CAMERA,region:"YKF",extent:300};
  const dispose=vi.fn();
  vi.mocked(createRenderer).mockReturnValue({update:vi.fn(),dispose,view:()=>view,zoom:vi.fn(),fit:vi.fn(),angle:vi.fn()});
  const graph=buildTopology([{id:"a",publicKey:"ab".repeat(32),iatas:[{iata:"YKF",lastHeard:1}],knownNeighborCount:0} as NodeSummary]);
  const props={graph,traffic:new LiveTraffic(),colors:{} as ChartColors,selected:"",onSelect:vi.fn(),region:"",onRegion:vi.fn(),heading:null,controls:null,settings:null,motion:true,tick:0};
  const page=render(<TopologyCanvas {...props} active />);
  page.rerender(<TopologyCanvas {...props} active={false} />);
  expect(dispose).toHaveBeenCalledOnce();expect(createRenderer).toHaveBeenCalledOnce();
  page.rerender(<TopologyCanvas {...props} active />);
  expect(createRenderer).toHaveBeenCalledTimes(2);
  expect(vi.mocked(createRenderer).mock.calls[1]![6]).toEqual(view);
  page.unmount();expect(dispose).toHaveBeenCalledTimes(2);
});
