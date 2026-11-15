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
    <AccountLayout title={t("account.bridge.title")}>
      <p className="text-sm text-text-normal">{t("account.bridge.confirm", { name: user.displayName, username: user.username })}</p>
      {go.isSuccess ? (
        <FormStatus>{t("account.bridge.done")}</FormStatus>
      ) : (
        <div className="flex gap-3">
          <FormButton type="button" busy={go.isPending} busyLabel={t("account.bridge.continuing")} onClick={() => go.mutate()}>{t("account.bridge.continue")}</FormButton>
          <FormButton type="button" disabled={go.isPending} onClick={close}>{t("account.bridge.cancel")}</FormButton>
        </div>
      )}
      {go.isError && (
        <FormStatus kind="error">
          {go.error instanceof BadRedirectError ? t("account.bridge.badRedirect") : authErrorText(t, go.error)}
        </FormStatus>
      )}
    </AccountLayout>
  );
}
