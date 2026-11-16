export type TemperatureUnit = "c" | "f";
export type DistanceUnit = "metric" | "imperial";

// The wire carries Celsius; these convert at the display edge only.
export const toDisplayTemp = (celsius: number, unit: TemperatureUnit): number => (unit === "f" ? (celsius * 9) / 5 + 32 : celsius);

export const fromDisplayTemp = (value: number, unit: TemperatureUnit): number => (unit === "f" ? ((value - 32) * 5) / 9 : value);

export const tempSymbol = (unit: TemperatureUnit): "°C" | "°F" => (unit === "f" ? "°F" : "°C");

export const formatTemp = (celsius: number, unit: TemperatureUnit, digits = 1): string =>
  `${toDisplayTemp(celsius, unit).toFixed(digits)} ${tempSymbol(unit)}`;
