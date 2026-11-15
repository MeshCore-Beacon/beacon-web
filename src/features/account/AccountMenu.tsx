import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { auth } from "../../api/auth";
import { Dropdown } from "../../components/Dropdown";
import { clearSession, useSession } from "../../hooks/useSession";
import { useView } from "./useView";

// Server ends the session; even if that call fails the client drops it so the UI does not claim to be signed in.
function useSignOut() {
  const queryClient = useQueryClient();
  const { view, close } = useView();
  const { mutate } = useMutation({
    mutationFn: () => auth.logout(),
    onSettled: () => {
      clearSession(queryClient);
      if (view === "profile") close();
    },
  });
  return mutate;
}

const ITEM = "w-full px-3 py-1.5 text-left font-mono text-xs text-text-muted hover:bg-text-normal/3 hover:text-text-normal";

// Desktop header entry, far right. Nothing while accounts are off or still loading.
export function AccountEntry() {
  const { t } = useTranslation();
  const { user, loading, enabled } = useSession();
  const { open } = useView();
  const signOut = useSignOut();
  if (!enabled || loading) return null;

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => open("signin")}
        className="shrink-0 rounded border border-border bg-bg-raised px-3 py-1 font-mono text-xs font-semibold text-text-bright hover:border-text-dim"
      >
        {t("account.entry.signIn")}
      </button>
    );
  }
  return (
    <Dropdown
      width="w-44"
      renderTrigger={({ open: expanded, toggle }) => (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={toggle}
          className="flex max-w-[12rem] shrink-0 items-center gap-1.5 rounded border border-border bg-bg-raised px-3 py-1 font-mono text-xs font-semibold text-text-bright hover:border-text-dim"
        >
          <span className="truncate">{user.displayName}</span>
          <span className="text-[11px] text-text-dim">▾</span>
        </button>
      )}
    >
      {(close) => (
        <>
          <button type="button" className={ITEM} onClick={() => { close(); open("profile"); }}>{t("account.entry.profile")}</button>
          <button type="button" className={ITEM} onClick={() => { close(); signOut(); }}>{t("account.entry.signOut")}</button>
        </>
      )}
    </Dropdown>
  );
}

// First items of the phone settings menu.
export function AccountMenuItems({ onPick }: { onPick: () => void }) {
  const { t } = useTranslation();
  const { user, loading, enabled } = useSession();
  const { open } = useView();
  const signOut = useSignOut();
  if (!enabled || loading) return null;

  return (
    <div className="mb-1 border-b border-border-subtle pb-1">
      {user ? (
        <>
          <div className="truncate px-3 pt-2 pb-1 font-mono text-[10px] uppercase tracking-wide text-text-dim">{user.displayName}</div>
          <button type="button" className={ITEM} onClick={() => { onPick(); open("profile"); }}>{t("account.entry.profile")}</button>
          <button type="button" className={ITEM} onClick={() => { onPick(); signOut(); }}>{t("account.entry.signOut")}</button>
        </>
      ) : (
        <button type="button" className={ITEM} onClick={() => { onPick(); open("signin"); }}>{t("account.entry.signIn")}</button>
      )}
    </div>
  );
}
