import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getNodesPage } from "../../api/client";
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
import { Card } from "../stats/cards";
import { Segmented } from "../stats/Segmented";
import { AtlasCard, type AtlasActions } from "./AtlasCard";
import { ATLAS_LIMIT, parseAtlas, type AtlasRange } from "./atlas";
import { useCardDrag } from "./useCardDrag";
import { useSavedAtlas } from "./useSavedAtlas";

const RANGES: AtlasRange[] = ["24h", "3d"];
const SEARCH_LIMIT = 8;
const SEARCH_MIN = 2;

// Global by design: pins are node identities, so the header region picker does not apply here.
export function MyAtlasPage({ active = true, ...actions }: AtlasActions & { active?: boolean }) {
  const { t } = useTranslation();
  const { saved, update, storageFailed } = useSavedAtlas();
  // Same single-row bar the other tabs use on a phone: the search shrinks, nothing wraps.
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [field, setField] = useState("name");
  const [heardKey, setHeardKey] = useState<string | null>(null);
  // Switching the field changes what the box means, so stale text must not carry over.
  const changeField = (value: string) => {
    setField(value);
    setSearch("");
  };

  // Key on the derived params, as the Nodes table does, so a name is never sent as a hex prefix.
  const params = nodeSearchParams(field, search);
  const typed = search.trim();
  const hint = typed.length === 0 ? null
    : typed.length < SEARCH_MIN ? "atlas.searchTooShort"
    : field === "pubkey" && params.pubkeyPrefix === undefined ? "atlas.searchNotHex"
    : null;
  const ready = typed.length > 0 && hint === null;
  const results = useQuery({
    queryKey: ["atlas-search", params.name, params.pubkeyPrefix],
    queryFn: ({ signal }) => getNodesPage(undefined, { ...params, limit: SEARCH_LIMIT }, signal),
    enabled: active && ready,
    staleTime: 30_000,
  });

  const full = saved.nodes.length >= ATLAS_LIMIT;
  const fields: SearchFieldOption[] = [
    { value: "name", label: t("nodeFilters.fieldName") },
    { value: "pubkey", label: t("nodeFilters.fieldPubkey") },
  ];
  const rangeOptions = RANGES.map((value) => ({ value, label: t(`atlas.ranges.${value}`) }));

  // Re-parse so an add goes through the same validation, dedupe and cap as a restore.
  const add = (node: NodeSummary) =>
    update((value) => {
      const pin = { id: node.id, publicKey: node.publicKey, name: node.name || "" };
      return parseAtlas(JSON.stringify({ ...value, nodes: [...value.nodes, pin] }));
    });
  const remove = (publicKey: string) =>
    update((value) => ({ ...value, nodes: value.nodes.filter((node) => node.publicKey !== publicKey) }));
  const relink = (publicKey: string, id: string) =>
    update((value) => ({ ...value, nodes: value.nodes.map((node) => (node.publicKey === publicKey ? { ...node, id } : node)) }));
  const reorder = (from: number, to: number) =>
    update((value) => {
      const nodes = [...value.nodes];
      const [moved] = nodes.splice(from, 1);
      if (!moved || to < 0 || to >= value.nodes.length) return value;
      nodes.splice(to, 0, moved);
      return { ...value, nodes };
    });
  const drag = useCardDrag(saved.nodes.length, reorder);
  const cardProps = (index: number) => {
    const props = drag.cardProps(index);
    return { ...props, className: `min-w-0 ${props.className ?? ""}` };
  };

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
              {t(isMobile ? "atlas.savedCountShort" : "atlas.savedCount", { count: saved.nodes.length, limit: ATLAS_LIMIT })}
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
      <div className="min-h-0 flex-1 overflow-y-auto">
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
                ) : (
                  <ul>
                    {results.data.items.map((node) => {
                      const pinned = saved.nodes.some((pin) => pin.publicKey === node.publicKey.toLowerCase());
                      const label = node.name ?? formatHex(node.id);
                      return (
                        <li
                          key={node.publicKey}
                          className="flex items-center justify-between gap-2 border-t border-border-subtle py-1.5 first:border-t-0"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={`truncate ${node.name ? "text-text-bright" : "italic text-text-dim"}`}>{label}</span>
                            <Badge variant="default">{node.nodeTypeName}</Badge>
                            <Tooltip label={node.publicKey}>
                              <code className="text-text-dim">{formatHex(node.publicKey)}</code>
                            </Tooltip>
                          </span>
                          <button
                            type="button"
                            className={ACTION_BUTTON_CLASS}
                            disabled={pinned || full}
                            aria-label={t(pinned ? "atlas.savedName" : "atlas.addName", { name: label })}
                            onClick={() => add(node)}
                          >
                            {t(pinned ? "atlas.saved" : "atlas.add")}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {results.data?.hasMore && !hint && (
                  <p className="mt-1 text-text-muted">{t("atlas.refine", { limit: SEARCH_LIMIT })}</p>
                )}
                {full && !hint && <p className="mt-1 text-warn">{t("atlas.limitReached", { limit: ATLAS_LIMIT })}</p>}
              </div>
            </Card>
          )}
          {saved.nodes.length === 0 ? (
            <EmptyState title={t("atlas.emptyTitle")} subtitle={t("atlas.emptyDescription", { limit: ATLAS_LIMIT })} />
          ) : (
            <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
              {saved.nodes.map((pin, index) => (
                <div key={pin.publicKey} data-atlas-card {...cardProps(index)}>
                  <AtlasCard
                    pin={pin}
                    range={saved.range}
                    active={active}
                    heardOpen={heardKey === pin.publicKey}
                    onHeardToggle={() => setHeardKey((key) => (key === pin.publicKey ? null : pin.publicKey))}
                    onRemove={() => remove(pin.publicKey)}
                    onResolved={(id) => relink(pin.publicKey, id)}
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
