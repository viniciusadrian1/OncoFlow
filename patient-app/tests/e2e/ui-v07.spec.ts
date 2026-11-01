import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sizes = [
  { name: "phone-390", width: 390, height: 844 },
  { name: "small-360", width: 360, height: 640 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "landscape-844", width: 844, height: 390 },
];

async function inspectLayout(page: Page) {
  return page.evaluate(() => {
    const selectors =
      "button,a[href],input:not([type=checkbox]):not([type=radio]),textarea,select,summary,[role=button]";
    const controls = [...document.querySelectorAll<HTMLElement>(selectors)]
      .filter(
        (element) =>
          element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility !== "hidden",
      )
      .map((element) => {
        const r = element.getBoundingClientRect();
        return {
          label:
            element.getAttribute("aria-label") ||
            element.textContent?.trim().replace(/\s+/g, " ").slice(0, 90) ||
            element.id ||
            element.tagName,
          width: r.width,
          height: r.height,
          left: r.left,
          right: r.right,
        };
      });
    const reducedMotion = matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const ongoingMotion = document.getAnimations().filter((animation) => {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      if (
        !(target instanceof HTMLElement || target instanceof SVGElement) ||
        !target.getClientRects().length
      )
        return false;
      return (
        animation.playState === "running" &&
        animation.effect?.getTiming().iterations === Infinity
      );
    }).length;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      smallTargets: controls.filter(
        (control) => control.width < 47.5 || control.height < 47.5,
      ),
      outsideViewport: controls.filter(
        (control) => control.left < -1 || control.right > innerWidth + 1,
      ),
      checkedControls: controls.length,
      reducedMotion,
      ongoingMotion,
    };
  });
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  directory: string,
  name: string,
) {
  await page.evaluate(() => document.fonts.ready);
  const measured = await inspectLayout(page);
  const screenshot = join(directory, `${name}.png`);
  await page.screenshot({
    path: screenshot,
    fullPage: true,
    animations: "disabled",
  });
  await testInfo.attach(name, { path: screenshot, contentType: "image/png" });
  expect
    .soft(measured.documentWidth, `${name}: document overflows horizontally`)
    .toBeLessThanOrEqual(measured.viewport.width + 1);
  expect
    .soft(
      measured.outsideViewport,
      `${name}: controls extend outside the viewport`,
    )
    .toEqual([]);
  expect
    .soft(
      measured.smallTargets,
      `${name}: touch controls must be at least 48 × 48 px`,
    )
    .toEqual([]);
  if (measured.reducedMotion) {
    expect
      .soft(
        measured.ongoingMotion,
        `${name}: reduced motion must stop continuing decorative animations`,
      )
      .toBe(0);
  }
  // This also detects a fixed navigation bar covering the final actionable control.
  const lastControl = page
    .getByRole("main")
    .locator("button:visible:enabled")
    .last();
  if (await lastControl.count()) await lastControl.click({ trial: true });
  return measured;
}

for (const size of sizes) {
  for (const scale of [1, 2]) {
    const mode = `${size.name}-${scale === 2 ? "text-200-reduced-motion" : "text-100"}`;
    test(`v0.7 visual and usable layout: ${mode}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(60000);
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({
        reducedMotion: scale === 2 ? "reduce" : "no-preference",
      });
      const external: string[] = [],
        errors: string[] = [];
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (
          ["http:", "https:"].includes(url.protocol) &&
          !["127.0.0.1", "localhost"].includes(url.hostname)
        ) {
          external.push(url.origin);
          return route.abort();
        }
        return route.continue();
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/");
      await page.getByRole("button", { name: "Explorar demonstração" }).click();
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Perfil", exact: true })
        .click();
      await page.getByLabel("Tamanho do texto").selectOption(String(scale));
      await expect(page.getByLabel("Tamanho do texto")).toHaveValue(
        String(scale),
      );
      const directory = join("docs", "previews", "v07", mode);
      mkdirSync(directory, { recursive: true });
      const measurements: Record<
        string,
        Awaited<ReturnType<typeof inspectLayout>>
      > = {};
      for (const [tab, name] of [
        ["Início", "01-home"],
        ["Jornada", "02-journey"],
        ["Agenda", "03-agenda"],
        ["Lia", "04-lia-text"],
      ]) {
        await page
          .getByRole("navigation")
          .getByRole("button", { name: tab, exact: true })
          .click();
        if (tab === "Lia") {
          await page
            .getByRole("button", {
              name: "Minha próxima consulta",
              exact: true,
            })
            .click();
          await expect(page.getByTestId("lia-answer").last()).toContainText(
            "03 de novembro",
          );
        }
        measurements[name] = await capture(page, testInfo, directory, name);
      }
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Início", exact: true })
        .click();
      await page
        .getByRole("main")
        .getByRole("button", { name: /documentos/i })
        .click();
      measurements["05-documents"] = await capture(
        page,
        testInfo,
        directory,
        "05-documents",
      );
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Início", exact: true })
        .click();
      await page
        .getByRole("main")
        .getByRole("button", { name: /Como estou/ })
        .click();
      await page
        .getByRole("button", { name: "Cansado(a)", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Cansado(a)", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      measurements["06-checkin"] = await capture(
        page,
        testInfo,
        directory,
        "06-checkin",
      );
      const manifest = join(directory, "verification.json");
      writeFileSync(
        manifest,
        JSON.stringify(
          {
            viewport: size,
            textScale: scale,
            reducedMotion: scale === 2,
            measurements,
            external,
            errors,
          },
          null,
          2,
        ) + "\n",
      );
      await testInfo.attach("layout-measurements", {
        path: manifest,
        contentType: "application/json",
      });
      expect(external).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
