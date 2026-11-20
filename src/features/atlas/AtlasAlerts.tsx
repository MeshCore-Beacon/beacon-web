import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { FormButton } from "../../components/form/FormButton";
import { FormStatus } from "../../components/form/FormStatus";
import { ModalOverlay } from "../../components/ModalOverlay";
import { Tooltip } from "../../components/Tooltip";
import { useAlerts } from "../../hooks/useAlerts";
import { useFeatures } from "../../hooks/useFeatures";
import { useSession } from "../../hooks/useSession";
import { LinkButton } from "../account/AccountLayout";
import { activeRules, channelReaches } from "../account/alertRules";
import { authErrorText } from "../account/errors";
import { AlertRuleList } from "../account/sections/AlertRuleList";
import { useSessionEnded } from "../account/sections/useSessionEnded";
import type { AlertTarget } from "../account/types";
import { useView } from "../account/useView";
import { targetForPin, type AtlasPin } from "./atlas";

type Query = ReturnType<typeof useAlerts>;

function AlertsDialog({ name, target, list, onClose }: { name: string; target: AlertTarget | undefined; list: Query; onClose: () => void }) {
  const { t } = useTranslation();
  const { user, loading, enabled } = useSession();
  const { open } = useView();
  const ended = useSessionEnded();
  useEffect(() => {
    if (list.error) ended(list.error);
  }, [list.error, ended]);
  // A saved row remounts and drops focus to the body, where the overlay's own Escape handler never hears the key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const leave = (view: "signin" | "profile", params?: Record<string, string>) => {
    onClose();
    open(view, params);
  };
  const channels = list.data?.channels;
  const silent = !!channels && !channelReaches(channels);

  return createPortal(
    <div className="fixed inset-0 z-50">
      <ModalOverlay label={t("atlas.alerts.dialog", { name })} onClose={onClose}>
        <div className="flex h-full w-screen max-w-md flex-col gap-4 overflow-y-auto border-l border-border bg-bg-surface p-4">
          <header className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="font-mono text-base font-semibold text-text-bright">{t("account.alerts.title")}</h2>
              <p className="truncate font-mono text-xs text-text-muted">{name}</p>
            </div>
            <button type="button" className={ACTION_BUTTON_CLASS} onClick={onClose}>{t("common.close")}</button>
          </header>
          {!user ? (
            loading ? <FormStatus>{t("account.alerts.loading")}</FormStatus> : (
              <>
                <p className="text-sm text-text-normal">{t("atlas.alerts.signIn")}</p>
                {enabled && <FormButton type="button" variant="solid" size="md" className="self-start" onClick={() => leave("signin")}>{t("account.entry.signIn")}</FormButton>}
              </>
            )
          ) : (
            <>
              {list.isPending && <FormStatus>{t("account.alerts.loading")}</FormStatus>}
              {list.isError && <FormStatus kind="error">{authErrorText(t, list.error)}</FormStatus>}
              {list.data && (target ? <AlertRuleList target={target} /> : <p className="text-sm text-text-normal">{t("atlas.alerts.notYet")}</p>)}
              {list.data && (
                <p className={`text-xs ${silent ? "text-warn" : "text-text-muted"}`}>
                  {t(silent ? "atlas.alerts.noneReach" : "atlas.alerts.channels")}{" "}
                  <LinkButton inline onClick={() => leave("profile", { section: "alerts" })}>{t("atlas.alerts.openProfile")}</LinkButton>
                </p>
              )}
            </>
          )}
        </div>
      </ModalOverlay>
    </div>,
    document.body,
  );
}

// Nothing on a server with alerts off. Every card reads the one /me/alerts query.
export function AtlasAlertBell({ pin, name, observerKey, box }: { pin: AtlasPin; name: string; observerKey?: string | null; box: string }) {
  const { t } = useTranslation();
  const { alerts: on } = useFeatures();
  const list = useAlerts();
  const [open, setOpen] = useState(false);
  if (!on) return null;

  const target = targetForPin(list.data?.targets, pin, observerKey);
  const rules = activeRules(target);
  const state = rules.firing.length > 0 ? "firing" : rules.on.length > 0 ? "on" : "off";
  const label = state === "firing" ? t("atlas.alerts.firing", { count: rules.firing.length })
    : state === "on" ? t("atlas.alerts.on", { count: rules.on.length })
    : t("account.alerts.title");
  const look = state === "firing" ? `${box} rounded border border-danger/40 bg-danger/10 text-danger hover:bg-danger/15`
    : `${ACTION_BUTTON_CLASS} ${box} ${state === "on" ? "bg-primary/10" : ""}`;

  return (
    <>
      <Tooltip label={label}>
        <button type="button" className={look} aria-label={label} aria-haspopup="dialog" data-alert-state={state} onClick={() => setOpen(true)}>
          <svg width="12" height="14" viewBox="0 0 12 14" fill={state === "off" ? "none" : "currentColor"} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
            <path d="M6 1.5A3.5 3.5 0 0 0 2.5 5v2.5l-1 2.5h9l-1-2.5V5A3.5 3.5 0 0 0 6 1.5z" />
            <path d="M4.8 12a1.3 1.3 0 0 0 2.4 0" fill="none" />
          </svg>
        </button>
      </Tooltip>
      {open && <AlertsDialog name={name} target={target} list={list} onClose={() => setOpen(false)} />}
    </>
  );
}
