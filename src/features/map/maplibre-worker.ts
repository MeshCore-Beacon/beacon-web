import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// maplibre 6 can't find its worker through Vite's module graph on its own; without this the map
// silently never fetches vector tiles. Import once from anything that constructs a Map.
setWorkerUrl(workerUrl);
