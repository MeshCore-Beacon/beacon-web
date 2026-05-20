export interface Channel {
  channelHash: string;
  memberCount: number;
  lastActivityAt: number;
}

export interface ChannelMessage {
  id: string;
  channelHash: string;
  senderName: string | null;
  content: string;
  decrypted: boolean;
  timestamp: number;
}
