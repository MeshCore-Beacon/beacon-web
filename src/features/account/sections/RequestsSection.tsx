import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useSecretSubmit, useSessionMutation } from "../../../hooks/useSessionMutation";
import { requests } from "../../../api/auth";
import { Timestamp } from "../../../components/Timestamp";
import { FormButton } from "../../../components/form/FormButton";
import { FormStatus } from "../../../components/form/FormStatus";
import { PasswordField } from "../../../components/form/PasswordField";
import { GUEST_PASSWORD_MAX, TELEMETRY_REQUESTS_KEY, useTelemetryRequests } from "../../../hooks/useTelemetryRequests";
import { errorCode, requestErrorText } from "../errors";
import { requestReasonText } from "../requestReason";
import { requestLine } from "../requestStatus";
import { StatusDot } from "../StatusDot";
import type { TelemetryRequest } from "../types";
import { ProfileSection } from "./ProfileSection";
import { useSessionEnded } from "./useSessionEnded";

type Mode = "password" | "remove" | null;

function RequestRow({ request }: { request: TelemetryRequest }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ended = useSessionEnded();
  const [mode, setMode] = useState<Mode>(null);
  const [password, setPassword] = useState("");
  const refetch = () => queryClient.invalidateQueries({ queryKey: TELEMETRY_REQUESTS_KEY });
  const name = request.node.name || request.node.publicKey.slice(0, 8);

  const savePassword = useSecretSubmit((pw: string) => requests.update(request.id, { password: pw === "" ? null : pw }), {
    onSuccess: () => {
      setMode(null);
      return refetch();
    },
    onError: ended,
  });
  const enable = useSessionMutation({ mutationFn: () => requests.update(request.id, { enabled: true }), onSuccess: refetch, onError: ended });
  const remove = useSessionMutation({ mutationFn: () => requests.remove(request.id), onSuccess: refetch, onError: ended });
  const error = savePassword.error ?? enable.error ?? remove.error;
  // Only a new password restarts these; the server ignores enable and refuses a blank login on a stopped one.
  const stopped = request.status === "admin_stopped";
  const failed = request.status === "login_failed";
  const needsNew = stopped || failed;
  const busy = savePassword.isPending || enable.isPending || remove.isPending;

  const line = requestLine(t, request);

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-bg-base p-3 sm:p-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="font-mono text-sm font-semibold text-text-bright">
          {request.node.id ? (
            <Link to={{ search: `?tab=Nodes&node=${encodeURIComponent(request.node.id)}` }} className="break-words text-primary hover:underline">{name}</Link>
          ) : (
            <span className="break-words">{name}</span>
          )}
        </div>
        <div className="flex items-start gap-2 text-sm text-text-normal">
          <StatusDot tone={line.tone} />
          <span>{line.text}</span>
        </div>
        {request.statusReason && <div className="text-xs text-text-muted">{requestReasonText(t, request)}</div>}
        {stopped && <div className="text-xs text-text-normal">{t("account.requests.adminStoppedHelp")}</div>}
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-xs text-text-muted">
          {!line.names && <span>{t("account.requests.polledBy")} {request.poller ? request.poller.name : t("account.requests.noObserver")}</span>}
          <span>
            {t("account.requests.lastReading")} {request.latestReadingAt != null ? <Timestamp value={request.latestReadingAt} /> : t("account.requests.never")}
          </span>
          <span>{request.hasPassword ? t("account.requests.passwordSet") : t("account.requests.noPassword")}</span>
        </div>
      </div>

      {mode === "password" && (
        <form
          className="flex flex-col gap-3 border-t border-border-subtle pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const pw = password;
            setPassword("");
            savePassword.mutate(pw);
          }}
        >
          <PasswordField
            roomy
            label={t("account.requests.newPassword")}
            name="guestPassword"
            autoComplete="off"
            maxLength={GUEST_PASSWORD_MAX}
            hint={stopped ? undefined : t("account.requests.passwordHint")}
            value={password}
            onChange={setPassword}
            disabled={busy}
          />
          <p className="text-xs text-text-muted">{t("account.requests.notice")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <FormButton variant="solid" size="md" busy={savePassword.isPending} busyLabel={t("account.requests.saving")} disabled={stopped && password === ""}>{t("account.requests.savePassword")}</FormButton>
            <FormButton type="button" variant="outline" size="md" disabled={busy} onClick={() => { setMode(null); setPassword(""); }}>{t("account.requests.cancel")}</FormButton>
          </div>
        </form>
      )}

      {mode === "remove" && (
        <div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
          <span className="text-sm text-text-normal">{t("account.requests.removeAsk", { name })}</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <FormButton type="button" variant="dangerSolid" size="md" busy={remove.isPending} busyLabel={t("account.requests.removing")} onClick={() => remove.mutate()}>{t("account.requests.removeYes")}</FormButton>
            <FormButton type="button" variant="outline" size="md" disabled={busy} onClick={() => setMode(null)}>{t("account.requests.cancel")}</FormButton>
          </div>
        </div>
      )}

      {mode === null && (
        <div className="flex flex-wrap gap-2">
          <FormButton type="button" variant="outline" size="md" disabled={busy} aria-label={t(needsNew ? "account.requests.enterNewPasswordNamed" : "account.requests.changePasswordNamed", { name })} onClick={() => setMode("password")}>
            {t(needsNew ? "account.requests.enterNewPassword" : "account.requests.changePassword")}
          </FormButton>
          {request.status === "disabled" && (
            <FormButton type="button" variant="outline" size="md" busy={enable.isPending} busyLabel={t("account.requests.enabling")} aria-label={t("account.requests.reenableNamed", { name })} onClick={() => enable.mutate()}>
              {t("account.requests.reenable")}
            </FormButton>
          )}
          <FormButton type="button" variant="danger" size="md" disabled={busy} aria-label={t("account.requests.removeNamed", { name })} onClick={() => setMode("remove")}>
            {t("account.requests.remove")}
          </FormButton>
        </div>
      )}
      {error != null && <FormStatus kind="error">{stopped && errorCode(error) === "password_invalid" ? t("account.requests.errors.password_invalid_stopped") : requestErrorText(t, error)}</FormStatus>}
    </li>
  );
}

export function RequestsSection() {
  const { t } = useTranslation();
  const ended = useSessionEnded();
  const list = useTelemetryRequests();
  useEffect(() => {
    if (list.error) ended(list.error);
  }, [list.error, ended]);

  const items = list.data?.requests ?? [];
  const count = list.data ? <span className="font-mono text-xs text-text-muted">{t("account.requests.count", { used: items.length, limit: list.data.limit })}</span> : null;

  return (
    <ProfileSection id="profile-requests" title={t("account.requests.title")} description={t("account.requests.about")} aside={count}>
      {list.isPending && <FormStatus>{t("account.requests.loading")}</FormStatus>}
      {list.isError && <FormStatus kind="error">{requestErrorText(t, list.error)}</FormStatus>}
      {list.data && items.length === 0 && (
        <p className="text-sm text-text-normal">
          {t("account.requests.empty")} <Link to={{ search: "?tab=Nodes" }} className="text-primary hover:underline">{t("account.requests.openNodes")}</Link>
        </p>
      )}
      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((r) => <RequestRow key={r.id} request={r} />)}
        </ul>
      )}
    </ProfileSection>
  );
}
