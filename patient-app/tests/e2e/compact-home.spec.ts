import { expect, test } from "@playwright/test";

for (const locale of ["pt-BR", "en-US"]) {
for (const size of [{ width: 390, height: 844, safe: 0 }, { width: 360, height: 640, safe: 0 }, { width: 390, height: 844, safe: 24 }]) {
  test(`home voice entry fits ${locale} at ${size.width}x${size.height}, insets ${size.safe}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await page.addInitScript((language) => localStorage.setItem("oncoflow-locale", language), locale);
    await page.goto("/");
    await page.getByRole("button", { name: locale === "en-US" ? "Explore demo" : "Explorar demonstração" }).click();
    if (size.safe) await page.addStyleTag({ content: `:root { --safe-area-inset-top: ${size.safe}px; --safe-area-inset-bottom: ${size.safe}px; }` });
    await page.evaluate(() => document.fonts.ready);
    const measurements = await page.evaluate(() => {
      const header = document.querySelector(".brand-header")!.getBoundingClientRect();
      const cta = document.querySelector(".home-lia-cta")!.getBoundingClientRect();
      const nav = document.querySelector(".bottom-nav")!.getBoundingClientRect();
      const hit = document.elementFromPoint(cta.x + cta.width / 2, cta.y + cta.height / 2);
      return {
        scroll: window.scrollY, headerHeight: header.height,
        ctaTop: cta.top, ctaBottom: cta.bottom, navTop: nav.top,
        reachable: !!hit?.closest(".home-lia-cta"),
        smallTargets: [...document.querySelectorAll(".home-shortcut, .home-lia-cta, .brand-header button")]
          .some(element => { const r = element.getBoundingClientRect(); return r.width < 48 || r.height < 48; }),
      };
    });
    expect(measurements.scroll).toBe(0);
    expect(measurements.headerHeight).toBeLessThanOrEqual(54);
    expect(measurements.ctaTop).toBeGreaterThan(0);
    expect(measurements.ctaBottom).toBeLessThanOrEqual(measurements.navTop - 4);
    expect(measurements.reachable).toBe(true);
    expect(measurements.smallTargets).toBe(false);
    await expect(page.locator(".demo-banner")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("compact-home.png") });
  });
}
}
