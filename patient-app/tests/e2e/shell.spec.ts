import { test, expect } from "@playwright/test";

test("enters a fictional profile and navigates all five tabs", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Seu cuidado, mais perto." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Demonstração com dados fictícios — nenhum alerta é enviado a profissionais.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await expect(page.locator(".demo-banner")).toHaveCount(0);
  for (const tab of ["Jornada", "Lia", "Agenda", "Perfil", "Início"]) {
    await page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("button", { name: tab, exact: true })
      .click();
    await expect(
      page
        .getByRole("navigation")
        .getByRole("button", { name: tab, exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("rescheduling is a request, not an actual appointment change", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Agenda", exact: true })
    .click();
  await page.getByRole("button", { name: "Ver detalhes" }).first().click();
  await page.getByRole("button", { name: "Solicitar reagendamento" }).click();
  await page.getByRole("button", { name: "Confirmar pedido simulado" }).click();
  await expect(
    page.getByText(
      "Pedido registrado nesta demonstração. A consulta original não foi alterada.",
    ),
  ).toBeVisible();
});

test("Lia explains live voice availability in the browser preview", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Lia", exact: true })
    .click();
  await expect(
    page.getByText("A IA ao vivo está disponível no APK Android.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Minha próxima consulta" }).click();
  await expect(page.getByTestId("lia-answer")).toContainText("consulta");
});
