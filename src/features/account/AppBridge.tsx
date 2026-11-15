import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { auth } from "../../api/auth";
import { FormButton } from "../../components/form/FormButton";
import { FormStatus } from "../../components/form/FormStatus";
import { AccountLayout } from "./AccountLayout";
import { deviceLabel } from "./deviceLabel";
import { authErrorText } from "./errors";
import { navigateTo } from "./navigate";
import type { User } from "./types";
import { useView } from "./useView";

const APP_SCHEME = "meshcorebeacon://";

class BadRedirectError extends Error {}

// Mints a one-time code for the app and hands the browser over; the code goes nowhere but that URL.
export function AppBridge({ user, codeChallenge, state }: { user: User; codeChallenge: string; state: string }) {
  const { t } = useTranslation();
  const { close } = useView();
  const go = useMutation({
    mutationFn: async () => {
      const { code, redirectUri } = await auth.appCode({ codeChallenge, state, deviceLabel: deviceLabel(navigator.userAgent) });
      if (!redirectUri.startsWith(APP_SCHEME)) throw new BadRedirectError();
      const url = new URL(redirectUri);
      url.searchParams.set("code", code);
      url.searchParams.set("state", state);
      navigateTo(url.toString());
    },
  });

  return (
    <AccountLayout title={t("account.bridge.title")} description={t("account.bridge.confirm")}>
      <div className="flex flex-col gap-0.5 rounded border border-border bg-bg-base px-3 py-2 font-mono">
        <span className="text-sm font-semibold text-text-bright">{user.displayName}</span>
        <span className="text-xs text-text-muted">@{user.username}</span>
      </div>
      {go.isSuccess ? (
        <FormStatus>{t("account.bridge.done")}</FormStatus>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold text-text-bright">{t("account.bridge.warning")}</p>
          {go.isError && (
            <FormStatus kind="error">
              {go.error instanceof BadRedirectError ? t("account.bridge.badRedirect") : authErrorText(t, go.error)}
            </FormStatus>
          )}
          {/* Cancel is the default focus and the primary action; Continue is never focused on load. */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <FormButton type="button" variant="solid" size="lg" autoFocus disabled={go.isPending} onClick={close}>{t("account.bridge.cancel")}</FormButton>
            <FormButton type="button" variant="outline" size="lg" busy={go.isPending} busyLabel={t("account.bridge.continuing")} onClick={() => go.mutate()}>{t("account.bridge.continue")}</FormButton>
          </div>
        </div>
      )}
    </AccountLayout>
  );
}
