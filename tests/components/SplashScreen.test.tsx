import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SplashScreen } from "../../src/components/SplashScreen";
import i18n from "../../src/i18n";

describe("SplashScreen", () => {
  it("translates the tagline but keeps the brand", async () => {
    sessionStorage.clear();
    await i18n.changeLanguage("fr");
    render(<SplashScreen />);
    expect(screen.getByText("Analyseur de réseau MeshCore")).toBeInTheDocument();
  });
});
