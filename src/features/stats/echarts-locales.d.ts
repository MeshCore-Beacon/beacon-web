// echarts ships no typings next to its ESM locale files
declare module "echarts/lib/i18n/langFR.js" {
  const lang: Parameters<typeof import("echarts/core").registerLocale>[1];
  export default lang;
}
