import { test, expect } from "@playwright/test";

test("the four home shortcuts open the patient's journey, check-in, agenda and documents", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  const destinations = [
    { name: /Minha jornada/i, hash: "journey", heading: "Minha jornada" },
    { name: /Como estou/i, hash: "checkin", heading: null },
    { name: /Minha agenda/i, hash: "agenda", heading: "Minha agenda" },
    { name: /documentos/i, hash: "documents", heading: "Meus documentos" },
  ];
  for (const destination of destinations) {
    await page
      .getByRole("main")
      .getByRole("button", { name: destination.name })
      .click();
    await expect(page).toHaveURL(new RegExp(`#${destination.hash}$`));
    if (destination.heading) {
      await expect(
        page.getByRole("heading", { name: destination.heading, exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("button", { name: "Náusea", exact: true }),
      ).toBeVisible();
    }
    await page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("button", { name: "Início", exact: true })
      .click();
    await expect(page).toHaveURL(/#home$/);
  }
});

test("home uses the selected fictional patient's actual appointment, including after a profile change", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  const marina = page
    .getByRole("main")
    .getByRole("button", { name: /Consulta de acompanhamento/ });
  await expect(marina).toContainText("09:30");
  await marina.click();
  const details = page.getByRole("dialog");
  await expect(details).toContainText("Consulta de acompanhamento");
  await expect(details).toContainText("03 de novembro");
  await expect(details).toContainText("09:30");
  await expect(details).toContainText("Unidade fictícia");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Perfil", exact: true })
    .click();
  await page.getByRole("button", { name: /João Almeida/ }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Início", exact: true })
    .click();
  const joao = page
    .getByRole("main")
    .getByRole("button", { name: /Consulta de retorno/ });
  await expect(joao).toContainText("10:00");
  await joao.click();
  await expect(details).toContainText("Consulta de retorno");
  await expect(details).toContainText("04 de novembro");
  await expect(details).toContainText("10:00");
  await expect(details).not.toContainText("Consulta de acompanhamento");
});
