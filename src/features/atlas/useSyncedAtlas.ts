import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { me } from "../../api/auth";
import { useSession } from "../../hooks/useSession";
import type { SavedAtlas } from "./atlas";
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

// The saved Atlas, kept on the account while signed in. Signed out it is the local hook, untouched.
export function useSyncedAtlas() {
  const { t } = useTranslation();
  const base = useSavedAtlas();
  const { user } = useSession();
  const userId = user?.id ?? null;
  const [syncedFor, setSyncedFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Everything below is read at send time, so refs: the queue always sends the latest of each.
  const revision = useRef<number | null>(null);
  const keys = useRef<ObserverKeys>({});
  const generation = useRef(0);
  const loading = useRef(false);
  const pending = useRef<Change[]>([]);
  const owner = useRef<string | null>(null);
  const queued = useRef(false);
  const running = useRef(false);
  const baseRef = useRef(base);
  const tRef = useRef(t);
  useEffect(() => {
    baseRef.current = base;
    tRef.current = t;
  });

  const markWhenSent = useRef<string | null>(null);
  const adopt = useCallback((doc: ServerAtlas) => {
    const { atlas, keys: next } = fromServer(doc, baseRef.current.latest(), keys.current);
    keys.current = next;
    revision.current = doc.revision;
    baseRef.current.update(() => atlas);
    if (owner.current) setOwner(owner.current);
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (running.current || loading.current) return;
    running.current = true;
    const mine = generation.current;
    try {
      while (queued.current && generation.current === mine) {
        queued.current = false;
        try {
          if (revision.current === null) revision.current = (await me.atlas()).revision;
          if (generation.current !== mine) return;
          const doc = await me.putAtlas(toPut(baseRef.current.latest(), keys.current, revision.current));
          if (generation.current !== mine) return;
          if (queued.current) revision.current = doc.revision;
          else adopt(doc);
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
            setNotice(tRef.current("atlas.conflict"));
          } else {
            revision.current = isConflict(error) ? null : revision.current;
            setNotice(tRef.current("atlas.syncFailed"));
          }
        }
      }
    } finally {
      running.current = false;
      // A change made under a newer sign-in while this one was finishing still needs sending.
      if (queued.current && !loading.current) void flush();
    }
  }, [adopt]);

  useEffect(() => {
    generation.current += 1;
    const mine = generation.current;
    revision.current = null;
    keys.current = {};
    queued.current = false;
    markWhenSent.current = null;
    pending.current = [];
    owner.current = userId;
    if (!userId) return;
    const baseline = baseRef.current.latest();
    loading.current = true;
    void (async () => {
      try {
        const doc = await me.atlas();
        if (generation.current !== mine) return;
        const server = fromServer(doc, baseline, {});
        keys.current = server.keys;
        revision.current = doc.revision;
        let marked = true;
        try { marked = localStorage.getItem(syncedMarker(userId)) !== null; } catch { /* storage blocked */ }
        let previous: string | null = null;
        try { previous = localStorage.getItem(OWNER_KEY); } catch { /* storage blocked */ }
        // A copy last synced to someone else is theirs: never merge it into this account.
        const foreign = previous !== null && previous !== userId;
        let next = server.atlas;
        let upload = false;
        if (!marked && !foreign) {
          const merged = mergeAtlas(server.atlas, baseline, server.keys);
          if (merged.dropped > 0) setNotice(tRef.current("atlas.mergeDropped", { count: merged.dropped }));
          next = merged.atlas;
          upload = merged.upload;
        }
        // Changes made before the load answered go on top of what it loaded, as one write.
        for (const change of pending.current) next = change(next);
        if (pending.current.length > 0) upload = true;
        pending.current = [];
        baseRef.current.update(() => next);
        setOwner(userId);
        // The marker waits for the upload, so a failed first upload is merged again next time.
        if (upload) {
          queued.current = true;
          markWhenSent.current = userId;
        } else if (!marked || foreign) markSynced(userId);
        setSyncedFor(userId);
      } catch {
        if (generation.current === mine) setNotice(tRef.current("atlas.loadFailed"));
      } finally {
        if (generation.current === mine) {
          loading.current = false;
          if (queued.current) void flush();
        }
      }
    })();
    return () => { generation.current += 1; loading.current = false; };
  }, [userId, flush]);

  const update = (change: Change) => {
    base.update(change);
    if (!userId) return;
    setNotice(null);
    if (loading.current) pending.current.push(change);
    queued.current = true;
    void flush();
  };
  // A card re-found under a new id, or an observer that turned out to be a node: the account already says so.
  const adjust = (change: Change) => base.update(change, !userId);

  return { saved: base.saved, update, adjust, storageFailed: base.storageFailed, synced: userId !== null && syncedFor === userId, notice, clearNotice: () => setNotice(null) };
}
