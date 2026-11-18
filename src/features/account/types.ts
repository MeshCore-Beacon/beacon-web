export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  pendingEmail: string | null;
  provider: string;
  createdAt: number;
}

export interface Session {
  id: string;
  kind: "web" | "app";
  label: string;
  current: boolean;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
}

export type CheckEmailStatus = { status: "check_email" };
export type VerifyStatus = { status: "verified" };
export type PasswordSetStatus = { status: "password_set" };
export type UserResponse = { user: User };
export type AppCodeRequest = { codeChallenge: string; state: string; deviceLabel: string };
export type AppCodeResponse = { code: string; redirectUri: string };
export type RegisterRequest = { username: string; email: string; password: string };

export type RequestStatus = "waiting" | "active" | "login_failed" | "admin_stopped" | "disabled";

export interface TelemetryRequest {
  id: string;
  node: { id: string | null; publicKey: string; name: string };
  status: RequestStatus;
  statusReason: string;
  // Stable snake_case reason, "" for none; absent on an older server. Days only for "offline".
  statusReasonCode?: string;
  statusReasonDays?: number;
  hasPassword: boolean;
  createdAt: number;
  updatedAt: number;
  // state and stateAt are what the observer reports; absent on an older server.
  poller: { observerId: string; name: string; state?: string; stateAt?: number | null } | null;
  latestReadingAt: number | null;
}

export interface TelemetryRequestList {
  limit: number;
  requests: TelemetryRequest[];
}

// password: omitted or null clears it on PATCH; enabled:true re-enables a paused request.
export type TelemetryRequestPatch = { password?: string | null; enabled?: true };

export type AlertKind =
  | "gone_quiet" | "back_online" | "battery_low" | "battery_falling" | "rebooted"
  | "temperature" | "noise_high" | "clock" | "observer_offline";
export type AlertState = "ok" | "firing" | "inactive" | "unknown";

export interface AlertRule {
  id: string;
  kind: AlertKind;
  threshold: number | null;
  thresholdHigh: number | null;
  enabled: boolean;
  state: AlertState;
  stateChangedAt: number;
  lastSentAt: number | null;
}

export interface AlertTarget {
  id: string | null; // the node's or observer's id, null when the radio no longer exists
  kind: "node" | "observer";
  publicKey: string;
  name: string;
  polled: boolean; // Beacon has trusted telemetry for this radio now
  available: string[];
  unavailable: Record<string, string>; // English sentences, the fallback
  unavailableCodes: Record<string, string>; // stable code per kind in unavailable
  rules: AlertRule[];
}

// reason is "", server_off, portal_account or unverified_email; a channel reaches the user only when available and enabled.
export interface AlertChannels {
  email: { available: boolean; enabled: boolean; reason: string };
  push: { available: boolean; enabled: boolean; hasDevice: boolean };
}

export interface AlertsResponse {
  channels: AlertChannels;
  targets: AlertTarget[];
}

export interface AlertChannelsPut {
  email?: boolean;
  push?: boolean;
}

export interface AlertRulePut {
  target: { kind: "node" | "observer"; publicKey: string };
  kind: AlertKind;
  threshold: number | null;
  thresholdHigh: number | null;
  enabled: boolean;
}
