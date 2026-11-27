// The server's rule for a new password: at least 12 characters (counted after NFC), at most 128 bytes.
export function newPasswordOk(password: string): boolean {
  const nfc = password.normalize("NFC");
  return [...nfc].length >= 12 && new TextEncoder().encode(nfc).length <= 128;
}

// Over the byte limit; shown as its own error instead of the length hint.
export function passwordTooLong(password: string): boolean {
  return new TextEncoder().encode(password.normalize("NFC")).length > 128;
}
