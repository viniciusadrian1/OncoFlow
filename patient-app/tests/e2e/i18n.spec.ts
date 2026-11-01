import { expect, test } from "@playwright/test";

test("English selection persists and localizes patient data, dates, documents and safety disclosures", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#welcome-language").selectOption("en-US");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(
    page.getByText(
      "Demo with fictional data — no alerts are sent to professionals.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore demo" }).click();
  await expect(page.locator(".demo-banner")).toHaveCount(0);
  const appointment = page.getByTestId("home-next-appointment");
  await expect(appointment).toContainText("Follow-up appointment");
  await expect(appointment).toContainText("November 03");
  await expect(appointment).toContainText("09:30 AM");
  await appointment.click();
  await expect(page.getByRole("dialog")).toContainText("Confirmed · fictional");
  await expect(page.getByRole("dialog")).toContainText(
    "The details of this appointment are fictional.",
  );
  await page.getByRole("button", { name: "Request rescheduling" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "No request will be sent to a real care team.",
  );
  await page.getByRole("button", { name: "Confirm simulated request" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Request recorded in this demo. The original appointment has not changed.",
  );
  await expect(appointment).toContainText("Follow-up appointment");
  await page.getByRole("button", { name: /My documents/ }).click();
  await page.getByRole("button", { name: /Your follow-up guide/ }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "No real care team monitors this demo.",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Journey", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "First welcome meeting" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("#welcome-language")).toHaveValue("en-US");
  await expect(
    page.getByRole("button", { name: "Explore demo" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("oncoflow-locale")),
  ).toBe("en-US");
});

test("Profile switches languages without losing the canonical check-in", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page.getByRole("button", { name: "Como estou", exact: true }).click();
  await page.getByRole("button", { name: "Com dor", exact: true }).click();
  await page.getByRole("button", { name: "Salvar registro fictício" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Perfil", exact: true })
    .click();
  await page.locator("#app-language").selectOption("en-US");
  await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();
  await expect(page.getByText("48 years old · demo profile")).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Home", exact: true })
    .click();
  await page.getByRole("button", { name: /How I feel/ }).click();
  await expect(
    page.getByRole("button", { name: "In pain", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".saved-mood")).toHaveText(
    "Your check-in this session: In pain",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Profile", exact: true })
    .click();
  await page.locator("#app-language").selectOption("pt-BR");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Início", exact: true })
    .click();
  await page.getByRole("button", { name: /Como estou/ }).click();
  await expect(
    page.getByRole("button", { name: "Com dor", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".saved-mood")).toHaveText(
    "Seu registro nesta sessão: Com dor",
  );
});
