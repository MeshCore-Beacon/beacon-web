import { useTranslation } from "react-i18next";
import { useSession } from "../../hooks/useSession";
import { useFeatures } from "../../hooks/useFeatures";
import { FormStatus } from "../../components/form/FormStatus";
import { CloseButton } from "./AccountLayout";
import { SignInView } from "./SignInView";
import { AlertsSection } from "./sections/AlertsSection";
import { AccountSection } from "./sections/AccountSection";
import { DeleteSection } from "./sections/DeleteSection";
import { DevicesSection } from "./sections/DevicesSection";
import { PortalManagedSection } from "./sections/PortalManagedSection";
import { PasswordSection } from "./sections/PasswordSection";
import { RequestsSection } from "./sections/RequestsSection";
import type { User } from "./types";

function ProfileHeader({ user, portal }: { user: User; portal: boolean }) {
  const { t } = useTranslation();
  return (
    <header data-testid="profile-header" className="relative flex flex-col gap-1 pr-12">
      <CloseButton className="absolute -right-2 -top-1.5 sm:right-0" />
      <h1 className="sr-only">{t("account.profile.title")}</h1>
      <p className="break-words font-mono text-xl font-semibold text-text-bright">{user.displayName}</p>
      <p className="font-mono text-sm text-text-normal">@{user.username}</p>
      {!portal && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
          <span className="break-all">{user.email}</span>
          <span className={`inline-flex items-center gap-1.5 text-xs ${user.emailVerified ? "text-green" : "text-warn"}`}>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
            {user.emailVerified ? t("account.profile.account.verified") : t("account.profile.account.unverified")}
          </span>
        </p>
      )}
    </header>
  );
}

// Signed out (or ended elsewhere) it is the sign-in view; signing in there lands back here.
export function ProfileView() {
  const { t } = useTranslation();
  const { user, loading } = useSession();
  const features = useFeatures();
  const portal = features.accounts === "portal";

  if (loading) return <div className="mx-auto w-full max-w-[640px] px-4 py-8"><FormStatus>{t("common.loading")}</FormStatus></div>;
  if (!user) return <SignInView />;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div key={user.id} className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-3 pb-12 pt-4 sm:gap-5 sm:px-4 sm:pt-8">
        <ProfileHeader user={user} portal={portal} />
        <AccountSection user={user} portal={portal} />
        {portal ? <PortalManagedSection portalUrl={features.portalUrl} /> : <PasswordSection />}
        {features.telemetryRequests && <RequestsSection />}
        {features.alerts && <AlertsSection user={user} />}
        <DevicesSection />
        <DeleteSection user={user} />
      </div>
    </div>
  );
}
