import { useTranslation } from "react-i18next";
import { ProfileSection } from "./ProfileSection";

// Stands in for the password and email forms: those belong to the portal here.
export function PortalManagedSection({ portalUrl }: { portalUrl?: string }) {
  const { t } = useTranslation();
  const href = portalUrl && /^https?:\/\//i.test(portalUrl) ? portalUrl : null;
  return (
    <ProfileSection id="profile-portal" title={t("account.profile.portal.title")}>
      <p className="text-sm text-text-normal">
        {t("account.profile.portal.managed")}
        {href && (
          <>
            {" "}
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-text-bright">{t("account.profile.portal.open")}</a>
          </>
        )}
      </p>
    </ProfileSection>
  );
}
