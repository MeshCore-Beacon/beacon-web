import { useTranslation } from "react-i18next";
import { useFeatures, useFeaturesLoading } from "../../hooks/useFeatures";
import { FormStatus } from "../../components/form/FormStatus";
import { PortalSignIn } from "./PortalSignIn";
import { ProfileView } from "./ProfileView";
import { RegisterView } from "./RegisterView";
import { ResetView } from "./ResetView";
import { SignInView } from "./SignInView";
import { VerifyView } from "./VerifyView";
import { useView } from "./useView";

// The lazy entry: App imports only this file, so no view ships in the first bundle.
export function AccountViews() {
  const { t } = useTranslation();
  const { view } = useView();
  const loading = useFeaturesLoading();
  const { accounts } = useFeatures();

  if (loading) return <div className="mx-auto w-full max-w-[420px] px-4 py-8"><FormStatus>{t("common.loading")}</FormStatus></div>;
  if (accounts === "off") return null;

  if (accounts === "portal" && (view === "register" || view === "reset")) return <PortalSignIn />;

  switch (view) {
    case "signin": return <SignInView />;
    case "register": return <RegisterView />;
    case "verify": return <VerifyView />;
    case "reset": return <ResetView />;
    case "profile": return <ProfileView />;
    default: return null;
  }
}
