# Translating Beacon

The header language picker starts in English and saves the selected language in
this browser. Its trigger and panel use the same dropdown styling as the region
control. Open it with Enter/Space, Tab to a language and activate that button;
Escape closes it and returns focus to the trigger. French is the first
additional language. Current coverage includes desktop/mobile navigation,
region/theme controls, connection/retry labels, lazy-page loading, shared
analytics section/range controls and chart states, and Traffic, RF / Signal, Paths & Hashes, Scopes and Clock Drift
(headings, legends, descriptive chart labels, explanations and exact tables).
Shared Timestamp labels and their relative tooltips also follow the selected
language. Other feature pages and general dialogs remain follow-up work. Measurement units
and existing UTC/date/number formatting, including automatic chart time labels,
are unchanged; selecting French does not mean every screen is translated yet.

## Add a language

1. Copy `src/i18n/locales/en.json` to a language-tag filename such as `de.json`.
2. Set `name` to its native name, such as `Deutsch`. Translate string values
   under `translation`; keep their keys and interpolation placeholders intact.
3. Build and test. Vite discovers every JSON catalog in that directory, and its
   native name appears in the language picker automatically. No central language
   list, plugin or translation server is needed.

Missing or empty translations fall back to English. Catalogs are bundled with the
application, so a new language requires a web build/deployment. Keep English as
the complete source catalog. Every selectable language must have a native name
and at least one translated string. Use plain text, not HTML, in translations.

## Add translated UI text

```tsx
import { useTranslation } from "react-i18next";

function LoadingMessage() {
  const { t } = useTranslation();
  return <span>{t("common.loading")}</span>;
}
```

Add the English key/value and translate it in other catalogs where possible.
Use `t("region.count", { count })` with i18next's language-specific plural
suffixes (`_one`, `_other`, and `_many` where applicable). Preserve placeholders
such as `{{seconds}}`; translate the whole phrase rather than joining words.
React escapes interpolated text; do not use `dangerouslySetInnerHTML` for it.

Translate display labels, never the tab IDs (`Packets`, `Analytics`, etc.), URL
parameters, region slugs/IATA codes, query keys or WebSocket subscriptions.
Names and packet contents come from the network and remain unchanged. This slice
does not change date/time/number formatting or measurement units. HTML language
and direction follow the selected catalog; a future right-to-left translation
also needs layout review before being offered to users.

Traffic, signal, path and scope chart helpers receive `t` explicitly, and their memoized options depend on
`t` so labels redraw when the language changes. Keep numerical series, null gaps,
half-open bin bounds and query keys unchanged. Use the real catalogs in tests;
check that a language-only change reuses the same cached request. Traffic keeps
IATA/model identifiers unchanged and translates only display labels for grouped
and unassigned areas; its heatmap tooltip uses the raw count for plural selection
and the existing formatted value for display. Scope names and search values stay
unchanged; only the chart remainder label and interface text are translated.
Clock Drift also supplies translated direction labels to the shared formatter;
its signs, magnitude, units and rounding remain unchanged. Shared Timestamp uses
the whole `timestamp.ago` phrase with `{{duration}}`, so French can put "il y a"
before the duration. Compact `s/m/h/d` units, flooring, future-time clamping,
local absolute timestamps and optional milliseconds are unchanged. Its existing
shared ticker keeps relative text fresh in either language. Per-page relative
phrases that bypass Timestamp and broader date/number formatting remain follow-ups.

For translated sortable tables, give each `Column` a stable `id` and use
`defaultSort={{ id: "drift", direction: "desc" }}` (for example). The visible
`header` can then change language without losing sorting or focus. Existing
header-based callers remain supported.

Run `npm run build`, `npm run lint` and `npm test`. Test saved/unknown language
preferences, English fallback and switching without losing the selected view.
Check the picker and menus at narrow widths, including translated status text.
The language preference tolerates unavailable browser storage; the choice then
lasts only for that visit. Tests use the real i18next resources, reset to English
after each test, and keep route/state assertions on canonical identifiers.
