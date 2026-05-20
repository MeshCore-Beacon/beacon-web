export interface Node {
  id: string;
  shortId: string;
  name: string;
  publicKey: string;
  iata: string | null;
  firmware: string | null;
  lastSeenAt: number;
  latitude: number | null;
  longitude: number | null;
}
