import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionMutation } from "../../hooks/useSessionMutation";
import { auth } from "../../api/auth";
import { clearSession, useSession } from "../../hooks/useSession";
import { errorCode } from "./errors";
import { useView } from "./useView";

// Local state is dropped only once the server ended the session (or says there is none); any other failure keeps the account and says so.
function useSignOut() {
  const queryClient = useQueryClient();
  const { view, close } = useView();
  const done = () => {
    clearSession(queryClient);
    if (view === "profile") close();
  };
  const { mutate, isError, reset } = useSessionMutation({
    mutationFn: () => auth.logout(),
    onSuccess: done,
    onError: (err) => {
      if (errorCode(err) === "not_signed_in") done();
    },
  });
  // afterEnd runs once signed out; the menu stays open until then so its error can show.
  return {
    signOut: (afterEnd?: () => void) => {
      reset();
      mutate(undefined, { onSuccess: afterEnd, onError: (err) => { if (errorCode(err) === "not_signed_in") afterEnd?.(); } });
    },
    failed: isError,
  };
}

function SignOutError({ failed, className }: { failed: boolean; className: string }) {
  const { t } = useTranslation();
  return failed ? <span role="alert" className={className}>{t("account.entry.signOutFailed")}</span> : null;
}

const ITEM = "w-full px-3 py-1.5 text-left font-mono text-xs text-text-muted hover:bg-text-normal/3 hover:text-text-normal";

// First items of the header settings menu.
export function AccountMenuItems({ onPick }: { onPick: () => void }) {
  const { t } = useTranslation();
  const { user, loading, enabled } = useSession();
  const { open } = useView();
  const { signOut, failed } = useSignOut();
  if (!enabled || loading) return null;

  return (
    <div className="mb-1 border-b border-border-subtle pb-1">
      {user ? (
        <>
          <div className="truncate px-3 pt-2 pb-1 font-mono text-[10px] uppercase tracking-wide text-text-dim">{user.displayName}</div>
          <button type="button" className={ITEM} onClick={() => { onPick(); open("profile"); }}>{t("account.entry.profile")}</button>
          <button type="button" className={ITEM} onClick={() => signOut(onPick)}>{t("account.entry.signOut")}</button>
        </>
      ) : (
        <button type="button" className={ITEM} onClick={() => { onPick(); open("signin"); }}>{t("account.entry.signIn")}</button>
      )}
      <SignOutError failed={failed} className="block px-3 py-1 font-mono text-[11px] text-danger" />
    </div>
  );
}
