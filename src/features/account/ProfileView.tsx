import { useTranslation } from "react-i18next";
import { useSession } from "../../hooks/useSession";
import { FormStatus } from "../../components/form/FormStatus";
import { AccountLayout } from "./AccountLayout";
import { SignInView } from "./SignInView";
import { AccountSection } from "./sections/AccountSection";
import { DeleteSection } from "./sections/DeleteSection";
import { DevicesSection } from "./sections/DevicesSection";
import { PasswordSection } from "./sections/PasswordSection";

// Signed out (or ended elsewhere) it is the sign-in view; signing in there lands back here.
export function ProfileView() {
  const { t } = useTranslation();
  const { user, loading } = useSession();

  if (loading) return <div className="mx-auto w-full max-w-[560px] px-4 py-8"><FormStatus>{t("common.loading")}</FormStatus></div>;
  if (!user) return <SignInView />;

  return (
    <AccountLayout title={t("account.profile.title")} wide>
      <AccountSection user={user} />
      <PasswordSection />
      <DevicesSection />
      <DeleteSection user={user} />
    </AccountLayout>
  );
}
