import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const VIEWS = /(SignInView|RegisterView|VerifyView|ResetView|AccountViews)/;

describe("account views stay out of the eager bundle", () => {
  it.each(["features/account/useView.ts", "features/account/AccountMenu.tsx", "components/AppShell.tsx"])("%s does not import a view", (file) => {
    const imports = read(file).split("\n").filter((l) => /^\s*(import|export)\b.*\bfrom\b/.test(l));
    expect(imports.filter((l) => VIEWS.test(l))).toEqual([]);
  });

  it("App reaches the views only through React.lazy", () => {
    const src = read("App.tsx");
    expect(src).not.toMatch(/^import .*AccountViews/m);
    expect(src).toMatch(/lazy\(\(\) => import\("\.\/features\/account\/AccountViews"\)/);
  });

  it("no view file is imported statically by anything but AccountViews", () => {
    const viewFiles = ["SignInView", "RegisterView", "VerifyView", "ResetView"];
    for (const file of ["App.tsx", "features/account/AccountMenu.tsx", "features/account/useView.ts"]) {
      for (const v of viewFiles) expect(read(file)).not.toContain(`/${v}"`);
    }
  });
});
