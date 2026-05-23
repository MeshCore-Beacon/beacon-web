import { API_BASE } from "../../lib/constants";
import type { TowerMapState } from "./types";

export async function getMapState(region: string): Promise<TowerMapState> {
  const url = new URL(`${API_BASE}/map/state`);
  if (region !== "*") {
    url.searchParams.set("iata", region);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`map state unavailable (${res.status})`);
  }
  return res.json();
}
