export interface MapObserver {
  id: string;
  name: string;
  iata: string;
  lat: number;
  lng: number;
  online: boolean;
}

export interface PacketArc {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  packetHash: string;
}
