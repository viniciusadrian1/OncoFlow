import { test, expect, type Page } from "@playwright/test";

const feelings = [
  "Bem",
  "Cansado(a)",
  "Com dor",
  "Náusea",
  "Ansioso(a)",
  "Outro",
];

async function openCheckin(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page.evaluate(() => {
    location.hash = "checkin";
  });
  await expect(page).toHaveURL(/#checkin$/);
}

test("check-in offers six accessible feelings with a single selected choice", async ({
  page,
}) => {
  await openCheckin(page);
  const save = page.getByRole("button", { name: /Salvar registro fictício/ });
  await expect(save).toBeDisabled();
  for (const feeling of feelings) {
    await expect(
      page.getByRole("button", { name: feeling, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: feeling, exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
  }
  for (const feeling of feelings) {
    await page.getByRole("button", { name: feeling, exact: true }).click();
    await expect(
      page.getByRole("button", { name: feeling, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { pressed: true })).toHaveCount(1);
    await expect(save).toBeEnabled();
  }
});

test("saving a feeling preserves the session record and the Lia route", async ({
  page,
}) => {
  await openCheckin(page);
  await page.getByRole("button", { name: "Náusea", exact: true }).click();
  await page.getByRole("button", { name: /Salvar registro fictício/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Registro fictício salvo" }),
  ).toContainText("Nenhuma avaliação clínica ou alerta");
  await expect(page.getByText(/Seu registro nesta sessão:/)).toContainText(
    "Náusea",
  );
  await page
    .getByRole("main")
    .getByRole("button", { name: /(?:conversar|falar) com a Lia/i })
    .click();
  await expect(page).toHaveURL(/#lia$/);
  await expect(page.getByLabel("Mensagem para a Lia")).toBeVisible();
  await page.evaluate(() => {
    location.hash = "checkin";
  });
  await expect(
    page.getByRole("button", { name: "Náusea", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Seu registro nesta sessão:/)).toContainText(
    "Náusea",
  );
});
