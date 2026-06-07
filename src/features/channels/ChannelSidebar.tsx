import { Badge } from "../../components/Badge";
import { Timestamp } from "../../components/Timestamp";
import { channelDisplayName } from "./types";
import type { ChannelSummary } from "./types";

interface ChannelSidebarProps {
  channels: ChannelSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function ChannelSidebar({ channels, selectedId, onSelect }: ChannelSidebarProps) {
  return (
    <div className="w-60 min-w-60 border-r border-border bg-bg-surface overflow-y-auto">
      <div className="text-text-muted text-[11px] uppercase tracking-wider px-3 pt-3 pb-2 font-mono">
        Channels
      </div>
      <div className="flex flex-col divide-y divide-border/40 px-1">
        {channels.map((ch) => {
          const isSelected = ch.id === selectedId;
          return (
            <button
              key={ch.id}
              onClick={() => onSelect(ch.id)}
              className={`w-full text-left px-2 py-1.5 rounded transition-colors cursor-pointer ${
                isSelected
                  ? "bg-primary/10 border border-primary"
                  : "border border-transparent hover:bg-bg-raised"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-mono text-xs truncate ${isSelected ? "text-text-bright" : "text-text-normal"}`}>
                  {channelDisplayName(ch)}
                </span>
                <Timestamp value={ch.lastSeen} className="text-[11px] text-text-dim ml-2 shrink-0" />
              </div>
              <div className="flex gap-1 mt-1">
                {ch.keyKnown ? (
                  <Badge variant="advert">key</Badge>
                ) : (
                  <Badge variant="offline">no key</Badge>
                )}
                {ch.isHashtag && <Badge variant="group">hashtag</Badge>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
