import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { me } from "../../api/auth";
import { ALERTS_KEY } from "../../hooks/useAlerts";
import { useFeatures, useFeaturesLoading } from "../../hooks/useFeatures";
import { useSession } from "../../hooks/useSession";
import type { SavedAtlas } from "./atlas";
import { ATLAS_LIMIT_FALLBACK } from "./atlas";
import { fromServer, mergeAtlas, OWNER_KEY, syncedMarker, toPut, type ObserverKeys, type ServerAtlas } from "./atlasSync";
import { useSavedAtlas } from "./useSavedAtlas";

type Change = (value: SavedAtlas) => SavedAtlas;

// The 409 body is {"error":{…},"current":{document}}.
const asDocument = (error: unknown): ServerAtlas | null =>
  (error as { body?: { current?: ServerAtlas } } | null)?.body?.current ?? null;
const setOwner = (userId: string) => {
  try { localStorage.setItem(OWNER_KEY, userId); } catch { /* storage blocked */ }
};
const markSynced = (userId: string) => {
  try { localStorage.setItem(syncedMarker(userId), String(Date.now())); } catch { /* storage blocked */ }
};
const isConflict = (error: unknown) => (error as { status?: unknown } | null)?.status === 409;
// The cap a refused save named, from the server's "at most N pins".
const refusedCap = (error: unknown): number | null => {
  const e = error as { status?: unknown; message?: unknown } | null;
  const m = e?.status === 422 && typeof e.message === "string" ? /^at most (\d+) pins$/.exec(e.message) : null;
  return m ? Number(m[1]) : null;
};

// The saved Atlas, kept on the account while signed in. Signed out it is the local hook, untouched.
export function useSyncedAtlas() {
  const { t } = useTranslation();
  const base = useSavedAtlas();
  // Read at send time like the rest: until /info answers, and on an older server, the Telemetry fields and a Poller view stay local.
  const { atlasTelemetry, atlas7d, atlasPoller } = useFeatures();
  const telemetry = useRef(atlasTelemetry);
  const sevenDay = useRef(atlas7d);
  const pollerView = useRef(atlasPoller);
  // Until /info answers nobody knows what the server stores, so the load holds its adoption and writes wait.
  const infoPending = useFeaturesLoading();
  const infoLoading = useRef(infoPending);
  const infoWaiters = useRef<(() => void)[]>([]);
  const infoKnown = useCallback(() => (infoLoading.current ? new Promise<void>((resolve) => { infoWaiters.current.push(resolve); }) : Promise.resolve()), []);
  const { user } = useSession();
  const userId = user?.id ?? null;
  const [syncedFor, setSyncedFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The keys ref as the page reads it: a card needs its observer's key to find its alert target.
  const [observerKeys, setObserverKeys] = useState<ObserverKeys>({});
  const queryClient = useQueryClient();
  // Alert targets follow the account's pins, so every write or adoption of them makes the alerts answer old.
  const pinsChanged = useCallback(() => void queryClient.invalidateQueries({ queryKey: ALERTS_KEY }), [queryClient]);

  // Everything below is read at send time, so refs: the queue always sends the latest of each.
  const revision = useRef<number | null>(null);
  const keys = useRef<ObserverKeys>({});
  const generation = useRef(0);
  const loading = useRef(false);
  const pending = useRef<Change[]>([]);
  const owner = useRef<string | null>(null);
  const baseline = useRef<SavedAtlas | null>(null);
  // One per sign-in state. Callbacks keep the one they were made under, so a late one from an
  // earlier account finds it dead instead of writing into the current account.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh object per sign-in is the point
  const token = useMemo(() => ({}), [userId]);
  const liveToken = useRef<object | null>(null);
  const queued = useRef(false);
  const running = useRef(false);
  const baseRef = useRef(base);
  const tRef = useRef(t);
  const loadRef = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    baseRef.current = base;
    tRef.current = t;
    telemetry.current = atlasTelemetry;
    sevenDay.current = atlas7d;
    pollerView.current = atlasPoller;
    infoLoading.current = infoPending;
  });

  const markWhenSent = useRef<string | null>(null);
  const adopt = useCallback((doc: ServerAtlas) => {
    const { atlas, keys: next } = fromServer(doc, baseRef.current.latest(), keys.current, !telemetry.current, !sevenDay.current, !pollerView.current);
    keys.current = next;
    setObserverKeys(next);
    revision.current = doc.revision;
    baseRef.current.update(() => atlas);
    if (owner.current) setOwner(owner.current);
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (running.current || loading.current || infoLoading.current) return;
    // No revision means the first load failed: redo it in full (it adopts, or drops a foreign cache)
    // before anything is written.
    if (revision.current === null && owner.current) {
      loadRef.current(owner.current);
      return;
    }
    running.current = true;
    const mine = generation.current;
    try {
      while (queued.current && generation.current === mine) {
        queued.current = false;
        try {
          const rev = revision.current;
          // A conflict without a document cleared it: go back through the load before writing.
          if (rev === null) { queued.current = true; return; }
          const doc = await me.putAtlas(toPut(baseRef.current.latest(), keys.current, rev, telemetry.current, sevenDay.current, pollerView.current));
          if (generation.current !== mine) return;
          // A save commits exactly rev + 1. Whatever the answer says, the next save builds on that, so a
          // newer copy from another device meets a conflict instead of being overwritten.
          if (queued.current) revision.current = rev + 1;
          else adopt(doc);
          pinsChanged();
          if (markWhenSent.current) {
            markSynced(markWhenSent.current);
            markWhenSent.current = null;
          }
        } catch (error) {
          if (generation.current !== mine) return;
          queued.current = false;
          const current = isConflict(error) ? (asDocument(error) ?? await me.atlas().catch(() => null)) : null;
          if (current && generation.current === mine) {
            adopt(current);
            pinsChanged();
            setNotice(tRef.current("atlas.conflict"));
          } else {
            revision.current = isConflict(error) ? null : revision.current;
            const cap = refusedCap(error);
            const over = cap === null ? 0 : baseRef.current.latest().pins.length - cap;
            setNotice(over > 0 ? tRef.current("atlas.overLimit", { count: cap!, remove: over }) : tRef.current("atlas.syncFailed"));
          }
        }
      }
    } finally {
      running.current = false;
      // A change made under a newer sign-in while this one was finishing still needs sending.
      if (queued.current && !loading.current) void flush();
    }
  }, [adopt, pinsChanged]);

  // The full ownership-aware load and adoption. Also the only way to get a revision: a flush
  // without one comes back here, so a failed first load never ends in a blind write.
  const load = useCallback((id: string) => {
    const mine = generation.current;
    loading.current = true;
    void (async () => {
      try {
        const doc = await me.atlas();
        // What an older server does not store is kept from the local copy, so the flags must be in first.
        await infoKnown();
        if (generation.current !== mine) return;
        const local = baseline.current ?? baseRef.current.latest();
        let marked = true;
        try { marked = localStorage.getItem(syncedMarker(id)) !== null; } catch { /* storage blocked */ }
        let previous: string | null = null;
        try { previous = localStorage.getItem(OWNER_KEY); } catch { /* storage blocked */ }
        // A copy last synced to someone else is theirs: never merge it into this account, nor lend it anything.
        const foreign = previous !== null && previous !== id;
        const server = fromServer(doc, foreign ? null : local, {}, !telemetry.current, !sevenDay.current, !pollerView.current);
        keys.current = server.keys;
        setObserverKeys(server.keys);
        revision.current = doc.revision;
        let next = server.atlas;
        let upload = false;
        if (!marked && !foreign) {
          const merged = mergeAtlas(server.atlas, local, server.keys, doc.limit > 0 ? doc.limit : ATLAS_LIMIT_FALLBACK);
          if (merged.dropped > 0) setNotice(tRef.current("atlas.mergeDropped", { count: merged.dropped }));
          next = merged.atlas;
          upload = merged.upload;
        }
        // Changes made before the load answered go on top of what it loaded, as one write.
        for (const change of pending.current) next = change(next);
        if (pending.current.length > 0) upload = true;
        pending.current = [];
        baseRef.current.update(() => next);
        setOwner(id);
        // The marker waits for the upload, so a failed first upload is merged again next time.
        if (upload) {
          queued.current = true;
          markWhenSent.current = id;
        } else if (!marked || foreign) markSynced(id);
        setSyncedFor(id);
      } catch {
        if (generation.current === mine) {
          // The held changes wait for the next change to retry; no loop against a failing server.
          queued.current = false;
          setNotice(tRef.current("atlas.loadFailed"));
        }
      } finally {
        if (generation.current === mine) {
          loading.current = false;
          if (queued.current) void flush();
        }
      }
    })();
  }, [flush, infoKnown]);

  useEffect(() => {
    loadRef.current = load;
    liveToken.current = token;
    generation.current += 1;
    revision.current = null;
    keys.current = {};
    queued.current = false;
    markWhenSent.current = null;
    pending.current = [];
    owner.current = userId;
    baseline.current = null;
    if (!userId) return;
    baseline.current = baseRef.current.latest();
    load(userId);
    // Leaving a sign-in ends its synced state, so the same account signing back in is not "synced" before its load.
    return () => { liveToken.current = null; generation.current += 1; loading.current = false; setSyncedFor(null); setObserverKeys({}); };
  }, [userId, load, token]);

  // A load and the writes held for /info go on once it has answered.
  useEffect(() => {
    if (infoPending) return;
    for (const resume of infoWaiters.current.splice(0)) resume();
    if (queued.current) void flush();
  }, [infoPending, flush]);

  const update = (change: Change) => {
    if (liveToken.current !== token) return;
    base.update(change);
    if (!userId) return;
    setNotice(null);
    // Until a load has succeeded the change waits for it, so it lands on the account's own document.
    if (loading.current || revision.current === null) pending.current.push(change);
    queued.current = true;
    void flush();
  };
  // A card re-found under a new id, or an observer that turned out to be a node: the account already says so.
  const adjust = (change: Change) => { if (liveToken.current === token) base.update(change, !userId); };

  return { saved: base.saved, update, adjust, storageFailed: base.storageFailed, observerKeys, synced: userId !== null && syncedFor === userId, notice, clearNotice: () => setNotice(null) };
}
