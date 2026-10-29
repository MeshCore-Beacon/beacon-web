import { CHAT_MS, type LiveChatter } from "./chatter";
import { nodeTypeColor, type ChartColors } from "../stats/chartTheme";
import { DEFAULT_CAMERA, FLOW_MS, createProjector, fitCamera, panCamera, pathControls, flowColor, linkContext, type Camera, type PathDisplay, type LiveTraffic, type Point3, type Topology } from "./topology";

export type CameraView = { camera: Camera; region: string; extent: number };

export function createRenderer(canvas: HTMLCanvasElement, graph: Topology, traffic: LiveTraffic, colors: ChartColors, select: (id: string) => void, focus: (code: string) => void, view?: CameraView, chatter?: LiveChatter) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let camera = { ...(view?.camera ?? DEFAULT_CAMERA), target: { ...(view?.camera.target ?? DEFAULT_CAMERA.target) } };
  let transition: { from: Camera; to: Camera; at: number } | null = null;
  const background = document.createElement("canvas"), backgroundCtx = background.getContext("2d");
  const underlay = document.createElement("canvas"), underlayCtx = underlay.getContext("2d");
  const foreground = document.createElement("canvas"), foregroundCtx = foreground.getContext("2d");
  if (!backgroundCtx || !underlayCtx || !foregroundCtx) return null;
  let trailsDirty = true, layersValid = false, movingUntil = 0, interactionPaint = false;
  const bubbleLayouts = new Map<string, { content: string; width: number; lines: string[] }>();
  const labelWidths = new Map<string, { font: string; label: string; width: number }>();
  let width = 1, height = 1, ratio = 1, frame = 0, previousFrame = -Infinity;
  let running = true, motion = true, selected = "", baseDirty = true, regionCode = view?.region ?? "";
  let fitted = !!view;
  let display: PathDisplay = "all";
  let regionHits: { code: string; x: number; y: number; width: number }[] = [];
  let lastTrailVersion = -1;
  let lastReport: LiveTraffic["reports"][number] | undefined, hadPulse = false, lastBubbles = "";
  let projected: { id: string; x: number; y: number; depth: number; scale: number }[] = [];
  let related = new Set<string>();
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = false, start = { x: 0, y: 0 }, panning = false;
  const regionByCode = new Map(graph.regions.map(r => [r.code, r]));
  // World geometry and evidence styling are immutable for this snapshot. Camera
  // movement changes their projection, not their identity, scope or curve lift.
  const links = graph.links.map(([a, b]) => {
    const from = graph.byId.get(a)!, to = graph.byId.get(b)!;
    const context = linkContext(from, to);
    return { a, b, from, to, ...context, route: graph.routeLinks.has([a, b].sort().join("|")), controls: pathControls(from, to, context.crossRegion) };
  });
  const extent = Math.max(220, ...graph.regions.map(r => Math.hypot(r.x, r.z) + r.radius));
  if (view) camera.zoom *= extent / view.extent;
  let projector = createProjector(camera, width, height, extent);
  const p = (point: Point3) => projector(point);
  const line = (a: Point3, b: Point3) => { const from = p(a), to = p(b); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); };
  const curve = (a: Point3, b: Point3, cross: boolean) => pathControls(a, b, cross).map(p);
  // Keep only currently animated segments. Expired flows cannot grow this cache,
  // and a camera/size change invalidates every projected control point.
  let flowCurves = new Map<[string, string], ReturnType<typeof curve>>();
  const appendCurve = (points: ReturnType<typeof curve>) => {
    // A cubic curve is contained in its control-point hull. Reject only curves
    // entirely outside the viewport, including stroke/antialias padding. Keep
    // crossing curves even when both endpoints are off screen.
    if (points.every(q => q.x < -8) || points.every(q => q.x > width + 8) ||
        points.every(q => q.y < -8) || points.every(q => q.y > height + 8)) return;
    const [a, c, d, b] = points;
    ctx.moveTo(a!.x, a!.y); ctx.bezierCurveTo(c!.x, c!.y, d!.x, d!.y, b!.x, b!.y);
  };
  const strokeCurve = (points: ReturnType<typeof curve>) => { ctx.beginPath(); appendCurve(points); ctx.stroke(); };
  // Rounded backing sizes can differ from CSS size * ratio by half a pixel.
  // Copy backing pixels 1:1 so fractional-DPR phones do not blur each layer.
  const composite = (layer: HTMLCanvasElement) => ctx.drawImage(layer, 0, 0, layer.width / ratio, layer.height / ratio);
  const wake = (changed = false) => { baseDirty ||= changed; if (!frame && running && !document.hidden) frame = requestAnimationFrame(draw); };
  function fit(smooth = true) {
    const regions = regionByCode.has(regionCode) ? [regionByCode.get(regionCode)!] : graph.regions;
    const points = regions.flatMap(r => [
      { x: r.x - r.radius - 20, y: 0, z: r.z - r.radius - 30 }, { x: r.x + r.radius + 20, y: 65, z: r.z + r.radius + 30 },
      { x: r.x - r.radius - 20, y: 0, z: r.z + r.radius + 30 }, { x: r.x + r.radius + 20, y: 0, z: r.z - r.radius - 30 },
    ]);
    if (!regionCode) for (const bundle of graph.bundles) {
      const a = regionByCode.get(bundle.from)!, b = regionByCode.get(bundle.to)!;
      points.push({ x: (a.x + b.x) / 2, y: pathControls(a, b, true)[1].y * 0.75, z: (a.z + b.z) / 2 });
    }
    const next = fitCamera(points, camera, width, height, extent);
    if (smooth && motion) transition = { from: camera, to: next, at: performance.now() };
    else { camera = next; transition = null; }
    wake(true);
  }

  function drawTrails() {
    for (const trail of traffic.trails.values()) {
      const from = graph.byId.get(trail.from), to = graph.byId.get(trail.to); if (!from || !to) continue;
      if (display !== "all" && selected !== from.id && selected !== to.id && !(display === "bundled" && regionCode && from.region === regionCode && to.region === regionCode)) continue;
      ctx!.globalAlpha = 0.35; ctx!.strokeStyle = flowColor(trail.kind, colors); ctx!.lineWidth = 1;
      strokeCurve(curve(from, to, from.region !== to.region));
    }
  }

  function draw(now: number) {
    frame = 0;
    if (!running || document.hidden) return;
    const time = Date.now();
    const bubbles = chatter?.visible(time) ?? [];
    const flows = motion ? traffic.flows.filter(r => time - r.at < FLOW_MS) : [];
    // A fixed 30 fps ceiling and capped pixel ratio bound work on phones and large meshes.
    if (now - previousFrame < 32) { frame = requestAnimationFrame(draw); return; }
    previousFrame = now;
    if (transition) {
      const t = Math.min(1, (now - transition.at) / 420), ease = 1 - (1 - t) ** 3;
      const mix = (a: number, b: number) => a + (b - a) * ease, { from, to } = transition;
      camera = { yaw: mix(from.yaw, to.yaw), pitch: mix(from.pitch, to.pitch), zoom: mix(from.zoom, to.zoom), target: { x: mix(from.target.x, to.target.x), y: mix(from.target.y, to.target.y), z: mix(from.target.z, to.target.z) } };
      baseDirty = true; if (t === 1) transition = null;
    }
    projector = createProjector(camera, width, height, extent);
    if (baseDirty) flowCurves.clear();
    // Keep the mesh below live trails and the nodes above them. Trail changes
    // only recomposite these bounded, pixel-ratio-capped layers; they do not
    // reproject, sort and stroke the entire graph.
    const cacheLayers = !transition && now >= movingUntil;
    // While navigating, stroke same-style mesh curves together. Geometry and
    // live particles are retained; only overlap blending is simplified. Restore
    // the full per-edge composite once the camera settles, even without traffic.
    if (interactionPaint && cacheLayers) baseDirty = true;
    let paintedScene = false;
    if (baseDirty || (trailsDirty && !layersValid)) {
    baseDirty = true;
    ctx!.clearRect(0, 0, width, height);
    ctx!.fillStyle = colors.bgBase;
    ctx!.fillRect(0, 0, width, height);
    ctx!.lineWidth = 1;
    ctx!.strokeStyle = colors.borderSubtle;
    ctx!.globalAlpha = 0.65;
    ctx!.beginPath();
    for (let i = -6; i <= 6; i++) {
      const v = extent * i / 6;
      line({ x: v, y: -16, z: -extent }, { x: v, y: -16, z: extent });
      line({ x: -extent, y: -16, z: v }, { x: extent, y: -16, z: v });
    }
    ctx!.stroke();
    ctx!.globalAlpha = 0.32;
    ctx!.strokeStyle = colors.primary;
    for (const region of graph.regions) {
      ctx!.beginPath();
      for (let i = 0; i <= 32; i++) {
        const q = p({ x: region.x + Math.cos(i * Math.PI / 16) * region.radius, y: -12, z: region.z + Math.sin(i * Math.PI / 16) * region.radius });
        if (i === 0) ctx!.moveTo(q.x, q.y); else ctx!.lineTo(q.x, q.y);
      }
      ctx!.fillStyle = colors.bgSurface; ctx!.globalAlpha = 0.9; ctx!.fill();
      ctx!.globalAlpha = region.code === regionCode ? 0.9 : 0.35; ctx!.stroke();
    }
    const batches = new Map<string, { color: string; alpha: number; lineWidth: number; dashed: boolean; curves: ReturnType<typeof curve>[] }>();
    for (const link of links) {
      const { a, b, from, to, crossRegion, sharedDefault, route, controls } = link;
      if (display !== "all" && a !== selected && b !== selected &&
          !(display === "bundled" && regionCode && from.region === regionCode && to.region === regionCode)) continue;
      const lit = selected === a || selected === b;
      const alpha = selected ? (lit ? 0.7 : 0.07) : 0.2;
      const color = lit ? colors.textBright : route ? colors.secondary : sharedDefault ? colors.green : crossRegion ? colors.primary : colors.textMuted;
      const lineWidth = lit ? 1.6 : 0.7, points = controls.map(p);
      if (!cacheLayers) {
        const key = `${color}|${alpha}|${lineWidth}|${crossRegion}`;
        let batch = batches.get(key);
        if (!batch) { batch = { color, alpha, lineWidth, dashed: crossRegion, curves: [] }; batches.set(key, batch); }
        batch.curves.push(points);
      } else {
        ctx!.globalAlpha = alpha; ctx!.strokeStyle = color;
        ctx!.setLineDash(crossRegion ? [3, 4] : []); ctx!.lineWidth = lineWidth;
        strokeCurve(points);
      }
    }
    for (const batch of batches.values()) {
      ctx!.globalAlpha = batch.alpha; ctx!.strokeStyle = batch.color;
      ctx!.setLineDash(batch.dashed ? [3, 4] : []); ctx!.lineWidth = batch.lineWidth;
      ctx!.beginPath(); for (const points of batch.curves) appendCurve(points); ctx!.stroke();
    }
    interactionPaint = !cacheLayers;
    ctx!.setLineDash([]);
    ctx!.globalAlpha = 1;
    if (cacheLayers) {
      underlayCtx!.clearRect(0, 0, underlay.width, underlay.height);
      underlayCtx!.drawImage(canvas, 0, 0);
      ctx!.clearRect(0, 0, width, height);
    } else drawTrails();
    if (display === "bundled") for (const bundle of graph.bundles) {
      const points = curve(regionByCode.get(bundle.from)!, regionByCode.get(bundle.to)!, true);
      ctx!.globalAlpha = 0.6; ctx!.strokeStyle = colors.primary; ctx!.lineWidth = Math.min(4, 1 + Math.log2(1 + bundle.count) * 0.3); strokeCurve(points);
      const x = (points[0]!.x + 3 * points[1]!.x + 3 * points[2]!.x + points[3]!.x) / 8, y = (points[0]!.y + 3 * points[1]!.y + 3 * points[2]!.y + points[3]!.y) / 8;
      ctx!.globalAlpha = 1; ctx!.font = "10px monospace"; ctx!.textAlign = "center";
      const w = ctx!.measureText(String(bundle.count)).width + 10;
      ctx!.fillStyle = colors.bgRaised; ctx!.fillRect(x - w / 2, y - 8, w, 16); ctx!.fillStyle = colors.primary; ctx!.fillText(String(bundle.count), x, y + 3);
    }
    projected = graph.nodes.map(n => ({ id: n.id, ...p(n) })).filter(q => q.visible).sort((a, b) => b.depth - a.depth);
    for (const q of projected) {
      if (q.x < -10 || q.x > width + 10 || q.y < -10 || q.y > height + 10) continue;
      const n = graph.byId.get(q.id)!;
      const lit = related.has(n.id);
      const radius = n.id === selected ? 6 : Math.max(0.8, Math.min(4.2, q.scale * (5 + Math.log2(1 + n.knownNeighborCount))));
      ctx!.globalAlpha = selected && !lit ? 0.16 : n.stale ? 0.4 : 0.9;
      ctx!.fillStyle = nodeTypeColor(n.nodeTypeName, colors);
      ctx!.beginPath();
      if (n.nodeTypeName === "companion") { ctx!.moveTo(q.x, q.y - radius); ctx!.lineTo(q.x + radius, q.y + radius); ctx!.lineTo(q.x - radius, q.y + radius); ctx!.closePath(); }
      else if (n.nodeTypeName === "room_server" || n.nodeTypeName === "sensor") ctx!.rect(q.x - radius, q.y - radius, radius * 2, radius * 2);
      else ctx!.arc(q.x, q.y, radius, 0, Math.PI * 2);
      ctx!.fill();
      if (n.isObserver || n.id === selected) { ctx!.strokeStyle = n.id === selected ? colors.textBright : colors.primary; ctx!.lineWidth = 1.2; ctx!.beginPath(); ctx!.arc(q.x, q.y, radius + 3, 0, Math.PI * 2); ctx!.stroke(); }
    }
    ctx!.globalAlpha = 1;
    if (cacheLayers) {
      foregroundCtx!.clearRect(0, 0, foreground.width, foreground.height);
      foregroundCtx!.drawImage(canvas, 0, 0);
      layersValid = true;
    } else {
      // While the camera moves every frame, render directly in the original
      // order. Populate the separated layers once it settles, not every drag.
      backgroundCtx!.clearRect(0, 0, background.width, background.height);
      backgroundCtx!.drawImage(canvas, 0, 0);
      layersValid = false;
      baseDirty = trailsDirty = false;
      paintedScene = true;
    }
    }
    if (baseDirty || trailsDirty) {
      ctx!.globalAlpha = 1;
      ctx!.clearRect(0, 0, width, height);
      composite(underlay);
      ctx!.setLineDash([]);
      drawTrails();
      ctx!.globalAlpha = 1;
      composite(foreground);
      backgroundCtx!.clearRect(0, 0, background.width, background.height);
      backgroundCtx!.drawImage(canvas, 0, 0);
      baseDirty = trailsDirty = false;
    } else if (!paintedScene) composite(background);
    // All live flows remain visible in every link-display mode. Curves change
    // presentation only: their endpoints still come from exact observed segments.
    const activeCurves = new Map<[string, string], ReturnType<typeof curve>>();
    for (const report of flows) {
      const progress = Math.min(1, (time - report.at) / FLOW_MS);
      const segmentIndex = Math.min(report.segments.length - 1, Math.floor(progress * report.segments.length));
      const pair = report.segments[segmentIndex];
      if (!pair) continue;
      const a = graph.byId.get(pair[0]), b = graph.byId.get(pair[1]);
      if (!a || !b) continue;
      const points = flowCurves.get(pair) ?? curve(a, b, a.region !== b.region);
      activeCurves.set(pair, points);
      const fraction = progress * report.segments.length - segmentIndex;
      const inv = 1 - fraction;
      const x = inv ** 3 * points[0]!.x + 3 * inv ** 2 * fraction * points[1]!.x + 3 * inv * fraction ** 2 * points[2]!.x + fraction ** 3 * points[3]!.x;
      const y = inv ** 3 * points[0]!.y + 3 * inv ** 2 * fraction * points[1]!.y + 3 * inv * fraction ** 2 * points[2]!.y + fraction ** 3 * points[3]!.y;
      ctx!.strokeStyle = flowColor(report.kind, colors);
      ctx!.globalAlpha = 0.55;
      ctx!.lineWidth = 1.5;
      strokeCurve(points);
      ctx!.globalAlpha = 0.2; ctx!.fillStyle = flowColor(report.kind, colors);
      ctx!.beginPath(); ctx!.arc(x, y, 8, 0, Math.PI * 2); ctx!.fill();
      ctx!.globalAlpha = 1; ctx!.beginPath(); ctx!.arc(x, y, 2.8, 0, Math.PI * 2); ctx!.fill();
    }
    flowCurves = activeCurves;
    ctx!.globalAlpha = 1;
    ctx!.font = "600 11px Inter, sans-serif";
    ctx!.textAlign = "center";
    regionHits = [];
    const recentByRegion = new Map<string, (typeof traffic.reports)[number]>();
    if (motion) for (let i = traffic.reports.length - 1; i >= 0; i--) {
      const report = traffic.reports[i]!; if (time - report.at >= 1500) break;
      if (!recentByRegion.has(report.iata)) recentByRegion.set(report.iata, report);
    }
    for (const region of [...graph.regions].sort((a, b) => Number(b.code === regionCode) - Number(a.code === regionCode) || b.count - a.count)) {
      const q = p({ ...region, y: 6 });
      if (!q.visible) continue;
      const size = Math.min(11, Math.max(8, region.radius * q.scale / 7));
      ctx!.font = `600 ${size}px Inter, sans-serif`;
      ctx!.globalAlpha = region.code === regionCode ? 1 : Math.min(1, Math.max(0, (region.radius * q.scale - 8) / 30));
      if (ctx!.globalAlpha < 0.15) continue;
      q.y -= Math.min(35, region.radius * q.scale * 0.6);
      if (q.x < -100 || q.x > width + 100 || q.y < -30 || q.y > height + 30) continue;
      const label = `${region.code} · ${region.count}`;
      let metrics = labelWidths.get(region.code);
      if (!metrics || metrics.font !== ctx!.font || metrics.label !== label) {
        metrics = { font: ctx!.font, label, width: ctx!.measureText(label).width + 16 };
        labelWidths.set(region.code, metrics);
      }
      const w = metrics.width;
      if (regionHits.some(r => Math.abs(r.x - q.x) < (r.width + w) / 2 + 5 && Math.abs(r.y - q.y) < 29)) continue;
      ctx!.fillStyle = colors.bgRaised; ctx!.fillRect(q.x - w / 2, q.y - 13, w, 26);
      ctx!.fillStyle = colors.textBright; ctx!.fillText(label, q.x, q.y + 4);
      const report = recentByRegion.get(region.code);
      if (report) { ctx!.fillStyle = flowColor(report.kind, colors); ctx!.beginPath(); ctx!.arc(q.x - w / 2 - 5, q.y, 3, 0, Math.PI * 2); ctx!.fill(); }
      regionHits.push({ code: region.code, x: q.x, y: q.y, width: w });
    }
    ctx!.globalAlpha = 1;
    const selectedPoint = projected.find(n => n.id === selected);
    if (selectedPoint) {
      const label = (graph.byId.get(selected)!.name || selected.slice(0, 8)).slice(0, 40);
      ctx!.font = "600 12px Inter, sans-serif";
      const w = ctx!.measureText(label).width + 16;
      ctx!.fillStyle = colors.bgSurface; ctx!.fillRect(selectedPoint.x - w / 2, selectedPoint.y - 34, w, 22);
      ctx!.fillStyle = colors.textBright; ctx!.fillText(label, selectedPoint.x, selectedPoint.y - 19);
    }
    for (const hash of bubbleLayouts.keys()) if (!bubbles.some(b => b.hash === hash)) bubbleLayouts.delete(hash);
    const placed: {x:number;y:number;w:number;h:number}[] = [];
    for (const bubble of bubbles) {
      if (placed.length >= (width < 600 ? 1 : 2)) break;
      const node = graph.byId.get(bubble.nodeId);
      if (!node || (regionCode && node.region !== regionCode)) continue;
      const q=p(node);
      if (!q.visible || q.x < 8 || q.x > width-8 || q.y < 8 || q.y > height-8) continue;
      const w=Math.min(240,width-24), h=76;
      const positions=[{x:q.x-w/2,y:q.y-h-25},{x:q.x+20,y:q.y-h-15},{x:q.x-w-20,y:q.y-h-15},{x:q.x-w/2,y:q.y+25}];
      const box=positions.map(pos=>({x:Math.max(8,Math.min(width-w-8,pos.x)),y:Math.max(8,Math.min(height-h-8,pos.y)),w,h})).find(pos=>(q.x<pos.x-8 || q.x>pos.x+pos.w+8 || q.y<pos.y-8 || q.y>pos.y+pos.h+8) && !placed.some(old=>pos.x<old.x+old.w+8 && pos.x+pos.w+8>old.x && pos.y<old.y+old.h+8 && pos.y+pos.h+8>old.y));
      if (!box) continue; placed.push(box);
      const alpha=motion ? Math.min(1,Math.max(0,(CHAT_MS-(time-bubble.at))/1600)) : 1;
      ctx!.globalAlpha=alpha;
      ctx!.strokeStyle=colors.secondary;ctx!.lineWidth=1;
      const sx=Math.max(box.x,Math.min(box.x+w,q.x)),sy=Math.max(box.y,Math.min(box.y+h,q.y));
      ctx!.beginPath();ctx!.moveTo(sx,sy);ctx!.lineTo(q.x,q.y);ctx!.stroke();
      const angle=Math.atan2(q.y-sy,q.x-sx);
      ctx!.beginPath();ctx!.moveTo(q.x,q.y);ctx!.lineTo(q.x-7*Math.cos(angle-.45),q.y-7*Math.sin(angle-.45));ctx!.lineTo(q.x-7*Math.cos(angle+.45),q.y-7*Math.sin(angle+.45));ctx!.closePath();ctx!.fillStyle=colors.secondary;ctx!.fill();
      ctx!.fillStyle=colors.bgSurface;ctx!.fillRect(box.x,box.y,w,h);ctx!.strokeRect(box.x,box.y,w,h);
      ctx!.textAlign="left";ctx!.font="600 12px Inter, sans-serif";ctx!.fillStyle=colors.secondary;
      ctx!.fillText(bubble.sender,box.x+9,box.y+18,w-18);
      ctx!.font="12px Inter, sans-serif";ctx!.fillStyle=colors.textBright;
      let layout = bubbleLayouts.get(bubble.hash);
      if (!layout || layout.content !== bubble.content || layout.width !== w) {
        const lines: string[] = []; let line = "";
        for (const char of Array.from(bubble.content)) { if(ctx!.measureText(line+char).width>w-20) { const space=line.lastIndexOf(" "); if(space>0){lines.push(line.slice(0,space));line=line.slice(space+1);} else {lines.push(line);line="";} } line+=char; }
        if (line) lines.push(line);
        layout = { content: bubble.content, width: w, lines };
        bubbleLayouts.set(bubble.hash, layout);
      }
      const { lines } = layout;
      for(let i=0;i<Math.min(2,lines.length);i++)ctx!.fillText(lines[i]!.slice(0,i===1 && lines.length>2 ? -2 : undefined)+(i===1 && lines.length>2 ? "…" : ""),box.x+9,box.y+39+i*17,w-18);
    }
    ctx!.globalAlpha=1;
    if (flows.length || transition || interactionPaint || (bubbles.length && motion)) frame = requestAnimationFrame(draw);
  }

  function resize() {
    const box = canvas.getBoundingClientRect(); width = Math.max(1, box.width); height = Math.max(1, box.height);
    ratio = Math.min(window.devicePixelRatio || 1, width < 600 ? 1.25 : 1.5);
    for (const layer of [canvas, background, underlay, foreground]) {
      layer.width = Math.round(width * ratio); layer.height = Math.round(height * ratio);
    }
    ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!fitted) { fit(false); fitted = true; } else wake(true);
  }
  function zoom(factor: number) { movingUntil = performance.now() + 120; transition = null; camera = { ...camera, zoom: Math.max(0.2, Math.min(80, camera.zoom * factor)) }; wake(true); }
  function pan(dx: number, dy: number) { movingUntil = performance.now() + 120; transition = null; camera = panCamera(camera, dx, dy, width, height, extent); wake(true); }
  function down(e: PointerEvent) {
    if (e.button > 2) return;
    e.preventDefault(); canvas.focus({ preventScroll: true });
    transition = null; start = { x: e.clientX, y: e.clientY }; moved = pointers.size > 0;
    panning = e.button !== 2 && !e.shiftKey;
    pointers.set(e.pointerId, start); canvas.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    const old = pointers.get(e.pointerId); if (!old) return;
    movingUntil = performance.now() + 120;
    const other = [...pointers].find(([id]) => id !== e.pointerId)?.[1];
    const dx = e.clientX - old.x, dy = e.clientY - old.y;
    if (other) { const before = Math.hypot(old.x - other.x, old.y - other.y); const after = Math.hypot(e.clientX - other.x, e.clientY - other.y); if (before > 5) zoom(after / before); pan(dx / 2, dy / 2); moved = true; }
    else if (panning) pan(dx, dy);
    else { camera.yaw += dx * 0.006; camera.pitch = Math.max(0.35, Math.min(Math.PI / 2, camera.pitch + dy * 0.006)); }
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) moved = true;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); wake(true);
  }
  function up(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (moved || e.type !== "pointerup" || e.button !== 0) return;
    const box = canvas.getBoundingClientRect(), x = e.clientX - box.left, y = e.clientY - box.top;
    const region = regionHits.find(r => Math.abs(r.x - x) <= r.width / 2 + 6 && Math.abs(r.y - y) <= 20);
    if (region) { focus(region.code); return; }
    const hit = [...projected].reverse().find(n => Math.hypot(n.x - x, n.y - y) <= 9);
    if (hit) select(hit.id);
  }
  function contextMenu(e: MouseEvent) { e.preventDefault(); }
  function wheel(e: WheelEvent) { e.preventDefault(); zoom(Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.002)); }
  function key(e: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "Home", "Escape"].includes(e.key)) return;
    e.preventDefault(); transition = null; movingUntil = performance.now() + 120;
    if (e.key === "Home") fit();
    else if (e.key === "Escape") focus("");
    else if (e.key === "+" || e.key === "=") zoom(1.2);
    else if (e.key === "-") zoom(1 / 1.2);
    else {
      const dx = e.key === "ArrowLeft" ? 30 : e.key === "ArrowRight" ? -30 : 0, dy = e.key === "ArrowUp" ? 30 : e.key === "ArrowDown" ? -30 : 0;
      if (e.shiftKey) { camera.yaw -= dx * 0.005; camera.pitch = Math.max(0.35, Math.min(Math.PI / 2, camera.pitch - dy * 0.005)); }
      else pan(dx, dy);
    }
    wake(true);
  }
  function visibility() { pointers.clear(); if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else wake(); }
  const fontsLoaded = () => { labelWidths.clear(); bubbleLayouts.clear(); wake(true); };
  document.fonts?.addEventListener("loadingdone", fontsLoaded);
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); canvas.addEventListener("lostpointercapture", up);
  canvas.addEventListener("contextmenu", contextMenu);
  canvas.addEventListener("wheel", wheel, { passive: false }); canvas.addEventListener("keydown", key);
  document.addEventListener("visibilitychange", visibility);
  return {
    update(id: string, region: string, paths: PathDisplay, animate: boolean, active: boolean) {
      const changeRegion = region !== regionCode;
      const modeChanged = motion !== animate || running !== active;
      baseDirty ||= selected !== id || changeRegion || paths !== display;
      trailsDirty ||= lastTrailVersion !== traffic.trailVersion;
      lastTrailVersion = traffic.trailVersion;
      if (selected !== id) {
        related = new Set([id]);
        if (id) for (const [a, b] of graph.links) { if (a === id) related.add(b); if (b === id) related.add(a); }
      }
      selected = id; regionCode = region; display = paths; motion = animate; running = active;
      if (!motion && transition) { camera = transition.to; transition = null; baseDirty = true; }
      if (changeRegion) fit();
      const time = Date.now(), report = traffic.reports.at(-1);
      const pulse = motion && traffic.reports.some(r => time-r.at < 1500);
      const bubbles = JSON.stringify(chatter?.visible(time) ?? []);
      const changed = baseDirty || trailsDirty || modeChanged || report !== lastReport || pulse || hadPulse || bubbles !== lastBubbles;
      lastReport = report; hadPulse = pulse; lastBubbles = bubbles;
      if (!running) { cancelAnimationFrame(frame); frame = 0; } else if (changed) wake();
    },
    zoom, fit, angle(top: boolean) { camera = { ...camera, yaw: 0, pitch: top ? Math.PI / 2 : DEFAULT_CAMERA.pitch }; fit(); },
    view(): CameraView { const current = transition?.to ?? camera; return { camera: { ...current, target: { ...current.target } }, region: regionCode, extent }; },
    dispose() {
      running = false; cancelAnimationFrame(frame); observer.disconnect();
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("lostpointercapture", up);
      canvas.removeEventListener("contextmenu", contextMenu);
      canvas.removeEventListener("wheel", wheel); canvas.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", visibility);
      document.fonts?.removeEventListener("loadingdone", fontsLoaded);
      for (const layer of [background, underlay, foreground]) layer.width = layer.height = 0;
      canvas.width = canvas.height = 0;
    },
  };
}
