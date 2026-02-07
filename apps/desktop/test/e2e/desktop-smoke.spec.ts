import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import electronPath from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isE2E = process.env.DISPATCH_E2E === "1";

test.skip(!isE2E, "Set DISPATCH_E2E=1 to run Electron E2E tests.");

test("Desktop smoke: launch, sidebar, reader", async () => {
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const mainPath = path.join(appDir, "dist-electron", "main.js");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const electronApp = await electron.launch({
    args: [mainPath],
    cwd: appDir,
    executablePath: electronPath,
    env: {
      ...env,
      DISPATCH_E2E: "1",
    }
  });

  try {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    const exampleSource = page.getByRole("button", { name: /^Example RSS/ });
    await expect(exampleSource).toBeVisible();

    const firstArticle = page.getByRole("button", { name: /Hello Dispatch/ });
    await firstArticle.click();
    await expect(page.getByText("Welcome to Dispatch.")).toBeVisible();
  } finally {
    await electronApp.close();
  }
});
