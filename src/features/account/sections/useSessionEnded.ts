import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearSession } from "../../../hooks/useSession";
import { authErrorText, errorCode } from "../errors";
import type { TFunction } from "i18next";

// Devices list key, shared so a password change can refetch it.
export const SESSIONS_KEY = ["me", "sessions"] as const;

// A 401 not_signed_in means the session ended elsewhere: drop it so the profile gives way to sign in.
export function useSessionEnded(): (err: unknown) => void {
  const queryClient = useQueryClient();
  return useCallback((err: unknown) => {
    if (errorCode(err) === "not_signed_in") clearSession(queryClient);
  }, [queryClient]);
}

// Password-confirming forms: a wrong current password reads as that, everything else uses the shared mapping.
export function profileErrorText(t: TFunction, err: unknown): string {
  return errorCode(err) === "invalid_credentials" ? t("account.profile.wrongPassword") : authErrorText(t, err);
}
