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
