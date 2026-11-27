import { useTranslation } from "react-i18next";
import { useLocation, useSearchParams } from "react-router-dom";
import { API_BASE } from "../../lib/constants";
import { FormButton } from "../../components/form/FormButton";
import { FormStatus } from "../../components/form/FormStatus";
import { AccountLayout } from "./AccountLayout";
import { navigateTo } from "./navigate";

// Where the portal sends the browser back to: this page, minus the sign-in view and error, unless an app bridge is waiting.
function returnPath(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  const bridge = params.get("app") === "1" && params.get("code_challenge") && params.get("state");
  params.delete("error");
  if (bridge) params.set("view", "signin");
  else for (const key of ["view", "token"]) params.delete(key);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

// The only sign-in in portal mode; also stands in for the register and reset views.
export function PortalSignIn() {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const [params] = useSearchParams();
  const start = () => navigateTo(`${API_BASE}/auth/portal/start?return=${encodeURIComponent(returnPath(pathname, search))}`);
  return (
    <AccountLayout title={t("account.signin.title")} description={t("account.portal.intro")}>
      <div className="flex flex-col gap-4">
        {params.get("error") === "portal" && <FormStatus kind="error">{t("account.portal.failed")}</FormStatus>}
        <FormButton type="button" variant="solid" size="lg" onClick={start}>{t("account.portal.button")}</FormButton>
      </div>
    </AccountLayout>
  );
}
