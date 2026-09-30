# Translating Beacon

The header language picker starts in English and saves the selected language in
this browser; an unset or empty string in a catalog falls back to English.

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

- Use `t("region.count", { count })` with i18next's language-specific plural
  suffixes (`_one`, `_other`, and `_many` where applicable).
- Preserve placeholders such as `{{seconds}}`; translate the whole phrase rather
  than joining words.
- Never translate tab IDs, URL parameters, IATA codes, query keys, or packet
  contents.
- Chart helpers receive `t` explicitly, and their memoized options must depend
  on `t` so labels redraw when the language changes.
- Sortable tables need a stable `Column.id` (e.g. `defaultSort={{ id: "drift",
  direction: "desc" }}`) so the visible `header` can change language without
  losing sorting or focus.
- Shared `Timestamp` uses the whole `timestamp.ago` phrase with `{{duration}}`,
  so a translation can reorder duration and phrase (e.g. French's "il y a").

## Verify

Run `npm run build`, `npm run lint` and `npm test`. Tests use the real i18next
catalogs and reset to English after each test.
