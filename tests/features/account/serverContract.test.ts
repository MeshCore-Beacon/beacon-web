import { afterEach, describe, expect, it } from "vitest";
import i18n from "../../../src/i18n";
import { authErrorText, requestErrorText } from "../../../src/features/account/errors";
import { fromServer, toPut, type ServerAtlas } from "../../../src/features/atlas/atlasSync";
import { requestReasonText } from "../../../src/features/account/requestReason";

// Every reason string beacon-server's polling package can put in statusReason.
const SERVER_REASONS = [
  "No observer can reach this repeater yet.",
  "Every observer that can reach this repeater is already polling its maximum.",
  "The repeater did not accept this guest password. Enter a new one.",
  "The repeater did not accept a blank or hello login. Enter a guest password.",
  "The repeater gave admin access to this password, so Beacon deleted it. Enter a guest password, never an admin one.",
  "This repeater gives admin access to a blank login, so Beacon will not poll it without a guest password.",
  "Not heard by any observer for 7 days.",
];

afterEach(() => i18n.changeLanguage("en"));

describe("telemetry request reasons", () => {
  it.each(["en", "fr", "sv"])("has %s text for every server reason", async (lang) => {
    await i18n.changeLanguage(lang);
    const english = i18n.getFixedT("en");
    for (const reason of SERVER_REASONS) {
      const text = requestReasonText(i18n.t, reason);
      expect(text).not.toMatch(/^account\./);
      if (lang === "en") expect(text).toBe(reason);
      else expect(text, reason).not.toBe(requestReasonText(english, reason));
    }
  });

  it("fills in the offline days", async () => {
    expect(requestReasonText(i18n.t, "Not heard by any observer for 7 days.")).toContain("7");
    expect(requestReasonText(i18n.t, "Not heard by any observer for 1 days.")).toContain("1");
  });

  it("shows a reason it does not know as sent, and nothing for none", () => {
    expect(requestReasonText(i18n.t, "Something new.")).toBe("Something new.");
    expect(requestReasonText(i18n.t, "")).toBe("");
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
