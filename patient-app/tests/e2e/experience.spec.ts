import { test, expect } from "@playwright/test";

test("requests and check-ins clear between profiles while reading preference persists", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page.getByRole("button", { name: /Meus pedidos/ }).click();
  await page.getByRole("button", { name: "Simular pedido de contato" }).click();
  await page.getByRole("button", { name: "Confirmar pedido simulado" }).click();
  await expect(
    page.getByRole("heading", { name: "Solicitação de contato" }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Perfil", exact: true })
    .click();
  await page
    .getByLabel("Como prefere as explicações?")
    .selectOption("step_by_step");
  await page.getByRole("button", { name: /Helena Duarte/ }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Início", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Olá, Helena." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Meus pedidos/ }).click();
  await expect(
    page.getByRole("heading", { name: "Tudo tranquilo por aqui" }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Lia", exact: true })
    .click();
  await expect(page.getByText(/Vamos por partes/)).toBeVisible();
  const storage = await page.evaluate(() => Object.keys(localStorage));
  expect(storage).toEqual(["oncoflow-preferences"]);
});

test("all screens fit at 360px with text enlarged to 200 percent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Perfil", exact: true })
    .click();
  await page.getByLabel("Tamanho do texto").selectOption("2");
  for (const tab of ["Perfil", "Início", "Jornada", "Lia", "Agenda"]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: tab, exact: true })
      .click();
    const overflowing = await page.evaluate(() => ({
      width: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(
      overflowing.document,
      `${tab} overflows viewport`,
    ).toBeLessThanOrEqual(overflowing.width);
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Início", exact: true })
    .click();
  await page
    .getByRole("main")
    .getByRole("button", { name: /documentos/i })
    .click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
});

test("reset confirmation stays visible after navigation and clears demo requests", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Perfil", exact: true })
    .click();
  await page.getByRole("button", { name: /Reiniciar demonstração/ }).click();
  await page.getByRole("button", { name: /Reiniciar agora/ }).click();
  await expect(page).toHaveURL(/#home$/);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(page.getByRole("status")).toContainText(
    "Demonstração reiniciada",
  );
});

test("documents and wellbeing use only fictional local data, without external requests", async ({
  page,
  baseURL,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).origin !== new URL(baseURL!).origin &&
      !request.url().startsWith("data:")
    )
      external.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page
    .getByRole("main")
    .getByRole("button", { name: /documentos/i })
    .click();
  await page.locator(".document-card").first().click();
  await expect(page.getByRole("dialog")).toContainText("SEM VALIDADE CLÍNICA");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Início", exact: true })
    .click();
  await page.getByRole("button", { name: /Como estou/ }).click();
  await page.getByRole("button", { name: "Cansado(a)", exact: true }).click();
  await page.getByRole("button", { name: /Salvar registro fictício/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Registro fictício salvo" }),
  ).toContainText("Nenhuma avaliação clínica ou alerta");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("captures the delivered visual experience", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "docs/previews/01-welcome.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page.screenshot({
    path: "docs/previews/02-home.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const [tab, file] of [
    ["Jornada", "03-journey"],
    ["Lia", "04-lia"],
    ["Agenda", "05-agenda"],
    ["Perfil", "06-profile"],
  ]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: tab, exact: true })
      .click();
    await page.screenshot({
      path: `docs/previews/${file}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});
