import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getNodesPage, getObserver, getObserverDirectoryPage } from "../../api/client";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { InfoTip } from "../../components/InfoTip";
import { SearchBar, type SearchFieldOption } from "../../components/SearchBar";
import { Tooltip } from "../../components/Tooltip";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { formatHex } from "../../lib/formatters";
import { nodeSearchParams } from "../nodes/node-search";
import type { NodeSummary } from "../nodes/types";
import { observerName } from "../observers/observer-filter";
import { deriveObserverStatus } from "../observers/observer-status";
import type { ObserverDirectoryItem } from "../observers/types";
import { Card } from "../stats/cards";
import { Segmented } from "../stats/Segmented";
import { AtlasCard, type AtlasActions, type AtlasView } from "./AtlasCard";
import { ATLAS_LIMIT, parseAtlas, pinKey, resolveObserverNode, type AtlasPin, type AtlasRange } from "./atlas";
import { useCardDrag } from "./useCardDrag";
import { useSavedAtlas } from "./useSavedAtlas";

const RANGES: AtlasRange[] = ["24h", "3d"];
const SEARCH_LIMIT = 8;
const SEARCH_MIN = 2;

type Matches =
  | { kind: "node"; items: NodeSummary[]; hasMore: boolean }
  | { kind: "observer"; items: ObserverDirectoryItem[]; hasMore: boolean };

// Global by design: pins are radio identities, so the header region picker does not apply here.
export function MyAtlasPage({ active = true, ...actions }: AtlasActions & { active?: boolean }) {
  const { t } = useTranslation();
  const { saved, update, storageFailed } = useSavedAtlas();
  // Same single-row bar the other tabs use on a phone: the search shrinks, nothing wraps.
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [field, setField] = useState("name");
  // One card at a time is away from its default view.
  const [open, setOpen] = useState<{ key: string; view: AtlasView } | null>(null);
  const defaultView = (pin: AtlasPin): AtlasView => (pin.kind === "observer" ? "observer" : "analytics");
  const viewOf = (pin: AtlasPin) => (open?.key === pinKey(pin) ? open.view : defaultView(pin));
  const setView = (pin: AtlasPin, view: AtlasView) => setOpen(view === defaultView(pin) ? null : { key: pinKey(pin), view });
  // Switching the field changes what the box means, so stale text must not carry over.
  const changeField = (value: string) => {
    setField(value);
    setSearch("");
  };

  // Key on the derived params, as the Nodes table does, so a name is never sent as a hex prefix.
  const observerSearch = field === "observer";
  const params = nodeSearchParams(field, search);
  const typed = search.trim();
  const hint = typed.length === 0 ? null
    : typed.length < SEARCH_MIN ? "atlas.searchTooShort"
    : field === "pubkey" && params.pubkeyPrefix === undefined ? "atlas.searchNotHex"
    : null;
  const ready = typed.length > 0 && hint === null;
  const results = useQuery<Matches>({
    queryKey: observerSearch ? ["atlas-search-observers", typed] : ["atlas-search", params.name, params.pubkeyPrefix],
    queryFn: ({ signal }) => observerSearch
      ? getObserverDirectoryPage({ name: typed, limit: SEARCH_LIMIT }, signal).then((page) => ({ kind: "observer", items: page.items, hasMore: page.hasMore }))
      : getNodesPage(undefined, { ...params, limit: SEARCH_LIMIT }, signal).then((page) => ({ kind: "node", items: page.items, hasMore: page.hasMore })),
    enabled: active && ready,
    staleTime: 30_000,
  });

  const full = saved.pins.length >= ATLAS_LIMIT;
  const fields: SearchFieldOption[] = [
    { value: "name", label: t("nodeFilters.fieldName") },
    { value: "pubkey", label: t("nodeFilters.fieldPubkey") },
    { value: "observer", label: t("atlas.fieldObserver") },
  ];
  const rangeOptions = RANGES.map((value) => ({ value, label: t(`atlas.ranges.${value}`) }));

  // Re-parse so an add goes through the same validation, dedupe and cap as a restore.
  const append = (pin: AtlasPin) =>
    update((value) => parseAtlas(JSON.stringify({ ...value, pins: [...value.pins, pin] })));
  const add = (node: NodeSummary) =>
    append({ kind: "node", id: node.id, publicKey: node.publicKey, name: node.name || "", observerId: node.observerId });
  // An observer whose radio advertises is saved as that node; if the node is pinned already, it
  // just gains the link, so the result reads Saved instead of silently doing nothing.
  const addObserver = useMutation({
    mutationFn: async (row: ObserverDirectoryItem) => {
      const observer = await getObserver(row.id);
      const match = await resolveObserverNode(observer);
      const name = row.displayName || "";
      if (!match) return append({ kind: "observer", observerId: row.id, name });
      const publicKey = match.publicKey.toLowerCase();
      update((value) => value.pins.some((pin) => pin.kind === "node" && pin.publicKey === publicKey)
        ? { ...value, pins: value.pins.map((pin) => (pin.kind === "node" && pin.publicKey === publicKey ? { ...pin, observerId: row.id } : pin)) }
        : parseAtlas(JSON.stringify({ ...value, pins: [...value.pins, { kind: "node", id: match.id, publicKey, name: match.name || name, observerId: row.id }] })));
    },
  });
  const remove = (pin: AtlasPin) =>
    update((value) => ({ ...value, pins: value.pins.filter((other) => pinKey(other) !== pinKey(pin)) }));
  const relink = (pin: AtlasPin, id: string, observerId?: string) =>
    update((value) => ({ ...value, pins: value.pins.map((other) => (pinKey(other) === pinKey(pin) && other.kind === "node" ? { ...other, id, observerId } : other)) }));
  // An observer pin whose key now resolves to a node takes that node's place in its own slot.
  const upgrade = (pin: AtlasPin, match: NodeSummary, observerId: string) =>
    update((value) => {
      const publicKey = match.publicKey.toLowerCase();
      if (value.pins.some((other) => other.kind === "node" && other.publicKey === publicKey)) {
        return { ...value, pins: value.pins.filter((other) => pinKey(other) !== pinKey(pin)) };
      }
      return { ...value, pins: value.pins.map((other) => (pinKey(other) === pinKey(pin)
        ? { kind: "node", id: match.id, publicKey, name: match.name || pin.name, observerId }
        : other)) };
    });
  const reorder = (from: number, to: number) =>
    update((value) => {
      const pins = [...value.pins];
      const [moved] = pins.splice(from, 1);
      if (!moved || to < 0 || to >= value.pins.length) return value;
      pins.splice(to, 0, moved);
      return { ...value, pins };
    });
  const drag = useCardDrag(saved.pins.length, reorder);
  const cardProps = (index: number) => {
    const props = drag.cardProps(index);
    return { ...props, className: `min-w-0 ${props.className ?? ""}` };
  };
  const pinnedObserver = (id: string) => saved.pins.some((pin) => pin.observerId === id);
  const addButton = (pinned: boolean, label: string, onClick: () => void, busy = false) => (
    <button
      type="button"
      className={ACTION_BUTTON_CLASS}
      disabled={pinned || full || busy}
      aria-label={t(pinned ? "atlas.savedName" : "atlas.addName", { name: label })}
      onClick={onClick}
    >
      {t(pinned ? "atlas.saved" : "atlas.add")}
    </button>
  );
  const rowClass = "flex items-center justify-between gap-2 border-t border-border-subtle py-1.5 first:border-t-0";

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={t("tabs.MyAtlas")}>
      <div
        className={`flex shrink-0 items-center gap-1.5 gap-y-1.5 border-b border-border-subtle bg-bg-base px-4 py-2 ${isMobile ? "" : "flex-wrap"}`}
        role="toolbar"
        aria-label={t("atlas.addNodes")}
      >
        <SearchBar
          value={search}
          onChange={setSearch}
          fields={fields}
          field={field}
          onFieldChange={changeField}
          inputLabel={t("atlas.search")}
        />
        {!isMobile && <InfoTip text={t("atlas.searchHelp", { min: SEARCH_MIN, limit: ATLAS_LIMIT })} />}
        <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-[11px] text-text-muted">
          <Tooltip label={t("atlas.localOnly")}>
            <span className={`rounded-sm border px-2.5 py-1 ${full ? "border-warn/15 bg-warn/7 text-warn" : "border-border bg-bg-surface"}`}>
              {t(isMobile ? "atlas.savedCountShort" : "atlas.savedCount", { count: saved.pins.length, limit: ATLAS_LIMIT })}
            </span>
          </Tooltip>
          {storageFailed && <span role="status" className="text-warn">{t("atlas.storageFailed")}</span>}
          {!isMobile && <span>{t("atlas.range")}</span>}
          <Segmented
            size="xs"
            options={rangeOptions}
            value={saved.range}
            onChange={(range) => update((value) => ({ ...value, range: range as AtlasRange }))}
            ariaLabel={t("atlas.range")}
          />
        </span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-3.5 p-4">
          {typed.length > 0 && (
            <Card title={t("atlas.matches")}>
              <div className="font-mono text-xs">
                {hint ? (
                  <p className="text-text-muted">{t(hint, { min: SEARCH_MIN })}</p>
                ) : results.isPending ? (
                  <p role="status" className="text-text-muted">{t("common.loading")}</p>
                ) : results.isError ? (
                  <p role="alert" className="text-danger">
                    {t("common.loadFailed")}{" "}
                    <button type="button" className={ACTION_BUTTON_CLASS} onClick={() => void results.refetch()}>
                      {t("observerPage.retry")}
                    </button>
                  </p>
                ) : results.data.items.length === 0 ? (
                  <p className="text-text-muted">{t("common.noMatches")}</p>
                ) : results.data.kind === "node" ? (
                  <ul>
                    {results.data.items.map((node) => {
                      const pinned = saved.pins.some((pin) => pin.kind === "node" && pin.publicKey === node.publicKey.toLowerCase());
                      const label = node.name ?? formatHex(node.id);
                      return (
                        <li key={node.publicKey} className={rowClass}>
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={`truncate ${node.name ? "text-text-bright" : "italic text-text-dim"}`}>{label}</span>
                            <Badge variant="default">{node.nodeTypeName}</Badge>
                            {node.isObserver && <Badge variant="default">{t("atlas.observerBadge")}</Badge>}
                            <Tooltip label={node.publicKey}>
                              <code className="text-text-dim">{formatHex(node.publicKey)}</code>
                            </Tooltip>
                          </span>
                          {addButton(pinned, label, () => add(node))}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <ul>
                    {results.data.items.map((row) => {
                      const label = observerName(row);
                      const online = deriveObserverStatus(row) === "online";
                      return (
                        <li key={row.id} className={rowClass}>
                          <span className="flex min-w-0 items-center gap-2">
                            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? "bg-green" : "bg-text-dim/30"}`} />
                            <span className={`truncate ${row.displayName ? "text-text-bright" : "italic text-text-dim"}`}>{label}</span>
                            {row.observerType && <Badge variant="default">{row.observerType}</Badge>}
                          </span>
                          {addButton(pinnedObserver(row.id), label, () => addObserver.mutate(row), addObserver.isPending)}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {addObserver.isError && <p role="alert" className="mt-1 text-danger">{t("common.loadFailed")}</p>}
                {results.data?.hasMore && !hint && (
                  <p className="mt-1 text-text-muted">{t("atlas.refine", { limit: SEARCH_LIMIT })}</p>
                )}
                {full && !hint && <p className="mt-1 text-warn">{t("atlas.limitReached", { limit: ATLAS_LIMIT })}</p>}
              </div>
            </Card>
          )}
          {saved.pins.length === 0 ? (
            <EmptyState title={t("atlas.emptyTitle")} subtitle={t("atlas.emptyDescription", { limit: ATLAS_LIMIT })} />
          ) : (
            <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
              {saved.pins.map((pin, index) => (
                <div key={pinKey(pin)} data-atlas-card {...cardProps(index)}>
                  <AtlasCard
                    pin={pin}
                    range={saved.range}
                    active={active}
                    view={viewOf(pin)}
                    onViewChange={(view) => setView(pin, view)}
                    onRemove={() => remove(pin)}
                    onResolved={(id, observerId) => relink(pin, id, observerId)}
                    onUpgrade={(match, observerId) => upgrade(pin, match, observerId)}
                    handle={drag.handleProps(index)}
                    {...actions}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
