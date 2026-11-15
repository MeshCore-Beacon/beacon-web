import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "../../hooks/useSession";
import { useQueryClient } from "@tanstack/react-query";
import { useSecretSubmit } from "../../hooks/useSessionMutation";
import { requests } from "../../api/auth";
import { FormButton } from "../../components/form/FormButton";
import { FormStatus } from "../../components/form/FormStatus";
import { PasswordField } from "../../components/form/PasswordField";
import { useSessionEnded } from "../account/sections/useSessionEnded";
import { requestErrorText } from "../account/errors";
import { useView } from "../account/useView";
import { GUEST_PASSWORD_MAX, TELEMETRY_REQUESTS_KEY, useTelemetryRequests } from "../../hooks/useTelemetryRequests";

function ManageLink() {
  const { t } = useTranslation();
  const { open } = useView();
  return (
    <button type="button" onClick={() => open("profile")} className="block font-mono text-[11px] text-primary hover:underline">
      {t("nodeDetail.telemetry.manage")}
    </button>
  );
}

// Eager: no chart imports. The panel renders it only for a repeater or room server when signed in and the feature is on.
export function RequestTelemetry({ node }: { node: { id: string; publicKey: string } }) {
  const { user } = useSession();
  // Keyed by account so a typed guest password cannot carry over to another one.
  return <RequestForm key={user?.id ?? ""} node={node} />;
}

function RequestForm({ node }: { node: { id: string; publicKey: string } }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ended = useSessionEnded();
  const list = useTelemetryRequests();
  const [password, setPassword] = useState("");
  const create = useSecretSubmit((pw: string) => requests.create(node.id, pw || undefined), {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TELEMETRY_REQUESTS_KEY }),
    onError: ended,
  });

  if (list.isError && !list.data) return <FormStatus kind="error">{requestErrorText(t, list.error)}</FormStatus>;
  if (!list.data) return null;

  const { limit } = list.data;
  const key = node.publicKey.toLowerCase();
  const existing = list.data.requests.find((r) => r.node.id === node.id || r.node.publicKey.toLowerCase() === key);
  const used = list.data.requests.length;
  const full = used >= limit;

  if (existing) {
    return (
      <div className="flex flex-col gap-1 font-mono text-[13px]">
        <div className="text-[11px] uppercase tracking-wider text-text-muted">{t("nodeDetail.telemetry.requested")}</div>
        <div className="text-text-normal">{t(`account.requests.status.${existing.status}`)}</div>
        <ManageLink />
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const pw = password;
        setPassword("");
        create.mutate(pw);
      }}
    >
      <p className="font-mono text-[12px] text-text-muted">{t("nodeDetail.telemetry.requestIntro")}</p>
      <PasswordField
        label={t("nodeDetail.telemetry.guestPassword")}
        name="guestPassword"
        autoComplete="off"
        maxLength={GUEST_PASSWORD_MAX}
        value={password}
        onChange={setPassword}
        disabled={create.isPending || full}
      />
      <p className="font-mono text-[11px] text-text-muted">{t("nodeDetail.telemetry.passwordNotice")}</p>
      <p className="font-mono text-[11px] text-text-muted">{t("nodeDetail.telemetry.used", { used, limit })}</p>
      {full && <FormStatus>{t("nodeDetail.telemetry.limitReached")}</FormStatus>}
      <FormButton busy={create.isPending} busyLabel={t("nodeDetail.telemetry.requesting")} disabled={full} className="self-start">
        {t("nodeDetail.telemetry.request")}
      </FormButton>
      {create.isError && <FormStatus kind="error">{requestErrorText(t, create.error)}</FormStatus>}
    </form>
  );
}
