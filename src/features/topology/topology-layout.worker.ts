import { buildTopology } from "./topology";
import type { TopologyLayoutInput } from "./layout-worker";

self.onmessage = (event: MessageEvent<TopologyLayoutInput>) => {
  const { nodes, iatas, routes } = event.data;
  self.postMessage(buildTopology(nodes, iatas, routes));
};
