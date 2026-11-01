import { expect, test, type Page } from "@playwright/test";

async function demoServer(page: Page, available = true) {
  const requests: string[] = [];
  const sessions: string[] = [];
  const names: Record<string, string> = {
    "pac-maria": "Maria do hospital",
    "pac-joao": "João do hospital",
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    requests.push(url.pathname);
    const json = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (!available) {
      await json({ error: "not deployed" }, 503);
      return;
    }
    if (url.pathname === "/api/health") {
      await json({ status: "ok", service: "OncoFlow" });
      return;
    }
    if (url.pathname === "/api/mobile/config") {
      await json({
        apiVersion: "1",
        demo: true,
        autoConnectEnabled: true,
        serviceUrl: url.origin,
        defaultPatientId: "pac-maria",
      });
      return;
    }
    if (url.pathname === "/api/mobile/demo-patients") {
      await json({
        demo: true,
        patients: Object.entries(names).map(([id, displayName]) => ({
          id,
          displayName,
        })),
        defaultPatientId: "pac-maria",
      });
      return;
    }
    if (url.pathname === "/api/mobile/demo-session") {
      const { patientId } = request.postDataJSON();
      sessions.push(patientId);
      await json({
        accessToken: `server-token-${patientId}`,
        expiresAt: "2099-01-01T00:00:00Z",
        scope: { tenantId: "demo", hospitalId: "oncoflow", patientId },
        patient: { displayName: names[patientId] },
        demo: true,
      });
      return;
    }
    const patientId = url.pathname.split("/").at(-2)!;
    const endpoint = url.pathname.split("/").at(-1)!;
    expect(request.headers().authorization).toBe(
      `Bearer server-token-${patientId}`,
    );
    const scope = { tenantId: "demo", hospitalId: "oncoflow", patientId };
    const data =
      endpoint === "summary"
        ? {
            ...scope,
            id: "summary",
            displayName: names[patientId],
            preferredName: names[patientId].split(" ")[0],
            careTeamLabel: "Equipe do hospital",
          }
        : endpoint === "preferences"
          ? {
              ...scope,
              id: "prefs",
              locale: "pt-BR",
              explanation: "short",
              speechRate: 1,
              textScale: 1,
            }
          : [];
    await json({
      apiVersion: "1",
      resourceType: endpoint === "summary" ? "patient_summary" : endpoint,
      scope,
      asOf: new Date().toISOString(),
      data,
    });
  });
  return { requests, sessions };
}

test("one entry button opens the default server patient without an address or code and switches only to listed profiles", async ({
  page,
}) => {
  const api = await demoServer(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Entrar no app", exact: true }),
  ).toBeVisible();
  expect(api.requests).toEqual([]);
  await expect(
    page.getByLabel("Endereço do hospital", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Código de pareamento", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Entrar no app", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Olá, Maria." }),
  ).toBeVisible();
  expect(api.sessions).toEqual(["pac-maria"]);
  await expect(page.getByText("Marina Costa", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Perfil", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Maria do hospital", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "A sessão fica aberta enquanto você usa o app. Ao reiniciar, toque em Entrar no app novamente.",
      { exact: true },
    ),
  ).toHaveCount(2);
  await expect(
    page.getByText(
      "Sessão mantida apenas enquanto o app está aberto. Ao reiniciar, use um novo código.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await page
    .getByLabel("Perfil fictício conectado", { exact: true })
    .selectOption("pac-joao");
  await expect(page.getByRole("heading", { name: "Olá, João." })).toBeVisible();
  expect(api.sessions).toEqual(["pac-maria", "pac-joao"]);
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toMatch(/server-token|accessToken|pac-joao/);
  await page.getByRole("button", { name: "Perfil", exact: true }).click();
  await page.getByRole("button", { name: "Desconectar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Entrar no app", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("João do hospital", { exact: true })).toHaveCount(
    0,
  );
});

test("an unpublished service leaves a normal unavailable message and a usable offline demo", async ({
  page,
}) => {
  const api = await demoServer(page, false);
  await page.goto("/");
  expect(api.requests).toEqual([]);
  await page
    .getByRole("button", { name: "Entrar no app", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "O serviço está indisponível",
  );
  await expect(
    page.getByLabel("Endereço do hospital", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Explorar demonstração", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Olá, Marina." }),
  ).toBeVisible();
});
