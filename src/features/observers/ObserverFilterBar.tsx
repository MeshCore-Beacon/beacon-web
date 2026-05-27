import { Dropdown } from "../../components/Dropdown";

const STATUSES = [
  { value: "", label: "All" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
];

interface ObserverFilterBarProps {
  statusFilter: string;
  onStatusChange: (s: string) => void;
  typeFilter: string;
  onTypeChange: (t: string) => void;
  typeOptions: string[];
  brokerFilter: string;
  onBrokerChange: (b: string) => void;
  brokerOptions: string[];
}

export function ObserverFilterBar({
  statusFilter,
  onStatusChange,
  typeFilter,
  onTypeChange,
  typeOptions,
  brokerFilter,
  onBrokerChange,
  brokerOptions,
}: ObserverFilterBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-surface shrink-0">
      <div className="flex items-center gap-1 rounded-md border border-border bg-bg-base overflow-hidden">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={`px-3 py-1 text-[11px] font-mono font-medium tracking-wider uppercase transition-colors cursor-pointer ${
              statusFilter === s.value
                ? "bg-primary/12 text-primary"
                : "text-text-muted hover:text-text-normal hover:bg-white/3"
            }`}
            onClick={() => onStatusChange(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {typeOptions.length > 0 && (
        <Dropdown
          align="left"
          width="w-48"
          renderTrigger={({ toggle }) => (
            <button
              type="button"
              className="flex items-center gap-1.5 bg-bg-raised border border-border rounded px-3 py-1 text-text-muted font-mono text-[11px] hover:text-text-normal hover:border-text-dim/30 transition-colors"
              onClick={toggle}
            >
              <span className="text-text-dim">TYPE</span>
              <span className={typeFilter ? "text-text-bright" : "text-text-muted"}>
                {typeFilter || "All"}
              </span>
              <span className="text-text-dim text-[11px]">▾</span>
            </button>
          )}
        >
          {(close) => (
            <>
              <button
                type="button"
                className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
                  !typeFilter
                    ? "text-text-bright bg-primary/10"
                    : "text-text-muted hover:text-text-normal hover:bg-white/3"
                }`}
                onClick={() => { onTypeChange(""); close(); }}
              >
                All Types
              </button>
              {typeOptions.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
                    typeFilter === t
                      ? "text-text-bright bg-primary/10"
                      : "text-text-muted hover:text-text-normal hover:bg-white/3"
                  }`}
                  onClick={() => { onTypeChange(t); close(); }}
                >
                  {t}
                </button>
              ))}
            </>
          )}
        </Dropdown>
      )}

      {brokerOptions.length > 0 && (
        <Dropdown
          align="left"
          width="w-48"
          renderTrigger={({ toggle }) => (
            <button
              type="button"
              className="flex items-center gap-1.5 bg-bg-raised border border-border rounded px-3 py-1 text-text-muted font-mono text-[11px] hover:text-text-normal hover:border-text-dim/30 transition-colors"
              onClick={toggle}
            >
              <span className="text-text-dim">BROKER</span>
              <span className={brokerFilter ? "text-text-bright" : "text-text-muted"}>
                {brokerFilter || "All"}
              </span>
              <span className="text-text-dim text-[11px]">▾</span>
            </button>
          )}
        >
          {(close) => (
            <>
              <button
                type="button"
                className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
                  !brokerFilter
                    ? "text-text-bright bg-primary/10"
                    : "text-text-muted hover:text-text-normal hover:bg-white/3"
                }`}
                onClick={() => { onBrokerChange(""); close(); }}
              >
                All Brokers
              </button>
              {brokerOptions.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
                    brokerFilter === b
                      ? "text-text-bright bg-primary/10"
                      : "text-text-muted hover:text-text-normal hover:bg-white/3"
                  }`}
                  onClick={() => { onBrokerChange(b); close(); }}
                >
                  {b}
                </button>
              ))}
            </>
          )}
        </Dropdown>
      )}
    </div>
  );
}
