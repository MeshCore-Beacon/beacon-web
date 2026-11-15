import { afterEach, describe, expect, it } from "vitest";
import i18n from "../../../src/i18n";
import { alertErrorText, authErrorText, requestErrorText } from "../../../src/features/account/errors";
import { fromServer, toPut, type ServerAtlas } from "../../../src/features/atlas/atlasSync";
import { requestReasonText } from "../../../src/features/account/requestReason";

// Every statusReasonCode beacon-server puts on a telemetry request (reason-codes.md), with its English sentence.
const REASON_CODES: Array<[string, string, number?]> = [
  ["no_observer", "No observer can reach this repeater yet."],
  ["no_seat", "Every observer that can reach this repeater is already polling its maximum."],
  ["login_failed", "The repeater did not accept this guest password. Enter a new one."],
  ["blank_login_failed", "The repeater did not accept a blank or hello login. Enter a guest password."],
  ["admin_stopped", "The repeater gave admin access to this password, so Beacon deleted it. Enter a guest password, never an admin one."],
  ["blank_blocked", "This repeater gives admin access to a blank login, so Beacon will not poll it without a guest password."],
  ["offline", "Not heard by any observer for 7 days.", 7],
];
const reasonOf = (code: string, statusReason: string, days?: number) => ({
  statusReasonCode: code, statusReason, ...(days === undefined ? {} : { statusReasonDays: days }),
});

afterEach(() => i18n.changeLanguage("en"));

describe("telemetry request reasons", () => {
  it.each(["en", "fr", "sv"])("translates every reason code in %s without reading the sentence", async (lang) => {
    await i18n.changeLanguage(lang);
    const english = i18n.getFixedT("en");
    for (const [code, sentence, days] of REASON_CODES) {
      // The sentence is deliberately wrong: only the code may decide the text.
      const text = requestReasonText(i18n.t, reasonOf(code, "x", days));
      expect(text, code).not.toMatch(/^account\./);
      expect(text, code).not.toBe("x");
      if (lang === "en") expect(text).toBe(sentence);
      else expect(text, code).not.toBe(requestReasonText(english, reasonOf(code, "x", days)));
    }
  });

  it("fills in the offline days, one day included", () => {
    expect(requestReasonText(i18n.t, reasonOf("offline", "", 7))).toBe("Not heard by any observer for 7 days.");
    expect(requestReasonText(i18n.t, reasonOf("offline", "", 1))).toBe("Not heard by any observer for 1 day.");
  });

  it("shows the server's text for no code, an unknown code, other, or offline without days", () => {
    expect(requestReasonText(i18n.t, { statusReason: "No observer can reach this repeater yet." })).toBe("No observer can reach this repeater yet.");
    expect(requestReasonText(i18n.t, reasonOf("future_code", "Something new."))).toBe("Something new.");
    expect(requestReasonText(i18n.t, reasonOf("other", "Odd text."))).toBe("Odd text.");
    expect(requestReasonText(i18n.t, reasonOf("offline", "Not heard for ages."))).toBe("Not heard for ages.");
    expect(requestReasonText(i18n.t, reasonOf("", ""))).toBe("");
  });
});

describe("error codes the server can send", () => {
  it.each(["en", "fr", "sv"])("maps service_unavailable, read_only and not_found in %s", async (lang) => {
    await i18n.changeLanguage(lang);
    for (const code of ["service_unavailable", "read_only", "not_found"]) {
      const text = requestErrorText(i18n.t, { code });
      expect(text, code).not.toBe(authErrorText(i18n.t, {}));
      expect(text).not.toMatch(/^account\./);
    }
  });
});

// What GET /me/atlas marshals: a node pin without tiles or view, a node the server lost, an observer pin whose
// observer row is gone (observerId null), and an observer pin with a chosen tile layout.
const KEY_A = "0f".repeat(32);
const KEY_B = "1e".repeat(32);
const KEY_C = "2d".repeat(32);
const SERVER_ATLAS = JSON.parse(`{
  "revision": 7, "range": "3d", "limit": 12,
  "pins": [
    {"kind":"node","name":"Hilltop","publicKey":"${KEY_A}","id":"3f2b8c1e-6a52-4d0e-9b57-0d3d2b6a1c11","observerId":null,"view":"heard"},
    {"kind":"node","name":"Gone","publicKey":"${KEY_B}","id":null,"observerId":null},
    {"kind":"observer","name":"North Ridge","observerPublicKey":"${KEY_C}","observerId":null,"tiles":["snr","rssi","noise","queue"]}
  ]
}`) as ServerAtlas;

describe("Atlas document as the server marshals it", () => {
  it("reads null ids and omitted fields", () => {
    const { atlas } = fromServer(SERVER_ATLAS, null, {});
    expect(atlas.range).toBe("3d");
    expect(atlas.pins).toHaveLength(3);
    expect(atlas.pins[0]).toMatchObject({ kind: "node", publicKey: KEY_A, view: "heard" });
    expect(atlas.pins[1]).toMatchObject({ kind: "node", publicKey: KEY_B });
    expect(atlas.pins[2]).toMatchObject({ kind: "observer", tiles: ["snr", "rssi", "noise", "queue"] });
  });

  it("sends a body the server's validator accepts", () => {
    const { atlas, keys } = fromServer(SERVER_ATLAS, null, {});
    const body = toPut(atlas, keys, SERVER_ATLAS.revision);
    expect(Object.keys(body).sort()).toEqual(["baseRevision", "pins", "range"]);
    expect(body.pins.length).toBeLessThanOrEqual(12);
    for (const pin of body.pins) {
      expect(["node", "observer"]).toContain(pin.kind);
      if (pin.kind === "node") expect(pin.publicKey).toMatch(/^[0-9a-f]{64}$/);
      else expect("observerId" in pin || "observerPublicKey" in pin).toBe(true);
      if ("view" in pin) expect(["heard", "observer"]).toContain(pin.view);
      if (pin.tiles) expect(new Set(pin.tiles).size).toBe(4);
      expect([...pin.name].length).toBeLessThanOrEqual(160);
    }
  });
});

describe("error codes on the portal and alert routes", () => {
  it.each(["en", "fr", "sv"])("has %s text for portal_managed and the alert codes", async (lang) => {
    await i18n.changeLanguage(lang);
    const generic = authErrorText(i18n.t, {});
    for (const code of ["portal_managed", "not_found", "app_session_required"]) {
      const text = alertErrorText(i18n.t, { code });
      expect(text, code).not.toBe(generic);
      expect(text).not.toMatch(/^account\./);
    }
    expect(authErrorText(i18n.t, { code: "portal_managed" })).not.toBe(generic);
    for (const code of ["not_on_atlas", "invalid_threshold", "alerts_disabled", "invalid_input", "not_signed_in", "csrf_rejected", "service_unavailable", "read_only"]) {
      expect(alertErrorText(i18n.t, { code }), code).not.toBe(generic);
    }
  });

  it("keeps the server's own reason for kind_unavailable", () => {
    expect(alertErrorText(i18n.t, { code: "kind_unavailable", message: "Turn on the gone-quiet alert for this radio first." })).toBe("Turn on the gone-quiet alert for this radio first.");
  });
});
