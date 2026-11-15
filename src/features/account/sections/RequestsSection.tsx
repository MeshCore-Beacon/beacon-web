import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requests } from "../../../api/auth";
import { Timestamp } from "../../../components/Timestamp";
import { FormButton } from "../../../components/form/FormButton";
import { FormStatus } from "../../../components/form/FormStatus";
import { PasswordField } from "../../../components/form/PasswordField";
import { GUEST_PASSWORD_MAX, TELEMETRY_REQUESTS_KEY, useTelemetryRequests } from "../../../hooks/useTelemetryRequests";
import { requestErrorText } from "../errors";
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

  const savePassword = useMutation({
    mutationFn: (pw: string) => requests.update(request.id, { password: pw === "" ? null : pw }),
    onSuccess: () => {
      setMode(null);
      return refetch();
    },
    onError: ended,
  });
  const enable = useMutation({ mutationFn: () => requests.update(request.id, { enabled: true }), onSuccess: refetch, onError: ended });
  const remove = useMutation({ mutationFn: () => requests.remove(request.id), onSuccess: refetch, onError: ended });
  const error = savePassword.error ?? enable.error ?? remove.error;
  const busy = savePassword.isPending || enable.isPending || remove.isPending;

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm text-text-bright">
          {request.node.id ? (
            <Link to={{ search: `?tab=Nodes&node=${encodeURIComponent(request.node.id)}` }} className="break-words text-primary hover:underline">{name}</Link>
          ) : (
            <span className="break-words">{name}</span>
          )}
          <span className="text-xs text-text-normal">{t(`account.requests.status.${request.status}`)}</span>
        </div>
        {request.statusReason && <div className="font-mono text-xs text-text-muted">{request.statusReason}</div>}
        <div className="flex flex-wrap gap-x-4 font-mono text-xs text-text-muted">
          <span>{t("account.requests.polledBy")} {request.poller ? request.poller.name : t("account.requests.noObserver")}</span>
          <span>
            {t("account.requests.lastReading")} {request.latestReadingAt != null ? <Timestamp value={request.latestReadingAt} /> : t("account.requests.never")}
          </span>
          <span>{request.hasPassword ? t("account.requests.passwordSet") : t("account.requests.noPassword")}</span>
        </div>
      </div>

      {mode === "password" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const pw = password;
            setPassword("");
            savePassword.mutate(pw);
          }}
        >
          <PasswordField
            label={t("account.requests.newPassword")}
            name="guestPassword"
            autoComplete="off"
            maxLength={GUEST_PASSWORD_MAX}
            hint={t("account.requests.passwordHint")}
            value={password}
            onChange={setPassword}
            disabled={busy}
          />
          <p className="text-xs text-text-muted">{t("account.requests.notice")}</p>
          <div className="flex gap-2">
            <FormButton busy={savePassword.isPending} busyLabel={t("account.requests.saving")}>{t("account.requests.savePassword")}</FormButton>
            <FormButton type="button" variant="quiet" disabled={busy} onClick={() => { setMode(null); setPassword(""); }}>{t("account.requests.cancel")}</FormButton>
          </div>
        </form>
      )}

      {mode === "remove" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-normal">{t("account.requests.removeAsk", { name })}</span>
          <FormButton type="button" variant="danger" busy={remove.isPending} busyLabel={t("account.requests.removing")} onClick={() => remove.mutate()}>{t("account.requests.removeYes")}</FormButton>
          <FormButton type="button" variant="quiet" disabled={busy} onClick={() => setMode(null)}>{t("account.requests.cancel")}</FormButton>
        </div>
      )}

      {mode === null && (
        <div className="flex flex-wrap gap-2">
          <FormButton type="button" variant="quiet" disabled={busy} aria-label={t("account.requests.changePasswordNamed", { name })} onClick={() => setMode("password")}>
            {t("account.requests.changePassword")}
          </FormButton>
          {request.status === "disabled" && (
            <FormButton type="button" variant="quiet" busy={enable.isPending} busyLabel={t("account.requests.enabling")} aria-label={t("account.requests.reenableNamed", { name })} onClick={() => enable.mutate()}>
              {t("account.requests.reenable")}
            </FormButton>
          )}
          <FormButton type="button" variant="quiet" disabled={busy} aria-label={t("account.requests.removeNamed", { name })} onClick={() => setMode("remove")}>
            {t("account.requests.remove")}
          </FormButton>
        </div>
      )}
      {error != null && <FormStatus kind="error">{requestErrorText(t, error)}</FormStatus>}
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
    <ProfileSection id="profile-requests" title={t("account.requests.title")} aside={count}>
      {list.isPending && <FormStatus>{t("account.requests.loading")}</FormStatus>}
      {list.isError && <FormStatus kind="error">{requestErrorText(t, list.error)}</FormStatus>}
      {list.data && items.length === 0 && <FormStatus>{t("account.requests.empty")}</FormStatus>}
      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {items.map((r) => <RequestRow key={r.id} request={r} />)}
        </ul>
      )}
    </ProfileSection>
  );
}
