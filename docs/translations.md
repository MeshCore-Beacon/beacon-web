# Translating Beacon

The header language picker starts in English and saves the selected language in
this browser. Its trigger and panel use the same dropdown styling as the region
control. Open it with Enter/Space, Tab to a language and activate that button;
Escape closes it and returns focus to the trigger. French is the first
additional language. This first slice covers
desktop/mobile navigation, the region and theme controls, connection/retry
labels and lazy-page loading text. Detailed feature pages, chart labels, general
dialogs and data formatting remain follow-up work; selecting French does not
mean every page is translated yet.

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

Run `npm run build`, `npm run lint` and `npm test`. Test saved/unknown language
preferences, English fallback and switching without losing the selected view.
Check the picker and menus at narrow widths, including translated status text.
The language preference tolerates unavailable browser storage; the choice then
lasts only for that visit. Tests use the real i18next resources, reset to English
after each test, and keep route/state assertions on canonical identifiers.
