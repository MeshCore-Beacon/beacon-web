import { forceLayout, type ForceLayoutInput } from "./graph-layout";

self.onmessage = (e: MessageEvent<ForceLayoutInput>) => {
  const xy = forceLayout(e.data);
  self.postMessage(xy, { transfer: [xy.buffer] });
};
