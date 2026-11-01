import { expect, test, type Page } from "@playwright/test";
import { mockConnectedAgent } from "./helpers/connectedAgent";

const scope = {
  tenantId: "demo",
  hospitalId: "oncoflow",
  patientId: "pac-maria",
};
const now = "2026-10-31T12:00:00Z";
const base = "https://hospital.example";
function envelope(resourceType: string, data: unknown) {
  return { apiVersion: "1", resourceType, scope, asOf: now, data };
}
type RequestRecord = typeof scope & {
  id: string;
  type: string;
  status: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};
type MessageRecord = typeof scope & {
  id: string;
  role: string;
  authorLabel: string;
  text: string;
  createdAt: string;
  status: string;
};

async function hospitalApi(page: Page) {
  const requests: RequestRecord[] = [];
  const messages: MessageRecord[] = [];
  const reports: Record<string, unknown>[] = [];
  const symptomReports: Record<string, unknown>[] = [];
  const writes: {
    endpoint: string;
    body: Record<string, unknown>;
    authorization: string | undefined;
  }[] = [];
  const preferences = {
    ...scope,
    id: "prefs",
    locale: "pt-BR",
    explanation: "short",
    speechRate: 1,
    textScale: 1,
  };
  let appointments = [
    {
      ...scope,
      id: "marina-consulta-1",
      startsAt: "2026-11-04T15:00:00Z",
      title: "Consulta publicada no painel",
      locationLabel: "Unidade de demonstração",
      professionalLabel: "Equipe do painel",
      status: "confirmed",
      preparation: "Traga suas perguntas anotadas.",
    },
  ];
  let failNextRequest = false;
  let failNextSymptom = false;
  let holdCheckin = false;
  let releaseCheckin: (() => void) | undefined;
  await page.route(`${base}/**`, async (route) => {
    const request = route.request();
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
      "access-control-allow-headers":
        "authorization,content-type,idempotency-key",
      "content-type": "application/json",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const endpoint = new URL(request.url()).pathname.split("/").at(-1)!;
    const body =
      request.method() === "GET"
        ? null
        : (request.postDataJSON() as Record<string, unknown>);
    const json = async (value: unknown) =>
      route.fulfill({ status: 200, headers, body: JSON.stringify(value) });
    if (endpoint === "pair") {
      expect(body).toEqual({ code: "OF-123456" });
      await json({
        accessToken: "memory-only-token",
        expiresAt: "2099-10-31T12:00:00Z",
        scope,
        patient: { displayName: "Maria do painel" },
        demo: true,
      });
      return;
    }
    expect(request.headers().authorization).toBe("Bearer memory-only-token");
    if (body)
      writes.push({
        endpoint,
        body,
        authorization: request.headers().authorization,
      });
    if (endpoint === "summary")
      await json(
        envelope("patient_summary", {
          ...scope,
          id: "summary",
          displayName: "Maria do painel",
          preferredName: "Maria",
          careTeamLabel: "Equipe de navegação",
          careContext: {
            diagnosisLabel: "Carcinoma invasivo de mama",
            treatmentLabel: "Acompanhamento cadastrado",
            sourceLabel: "Cadastro fictício do serviço",
            patientInstructions: ["Traga suas perguntas para a equipe."],
          },
        }),
      );
    else if (endpoint === "appointments")
      await json(envelope("appointments", appointments));
    else if (endpoint === "journey")
      await json(
        envelope("journey", [
          {
            ...scope,
            id: "journey-1",
            title: "Etapa publicada",
            occurredAt: now,
            description: "Conteúdo compartilhado no painel.",
            status: "current",
            source: "hospital",
          },
        ]),
      );
    else if (endpoint === "documents")
      await json(
        envelope("documents", [
          {
            ...scope,
            id: "marina-doc-1",
            title: "Documento publicado no painel",
            issuedAt: now,
            typeLabel: "Orientação",
            authorLabel: "Equipe de navegação",
            body: ["Conteúdo publicado e visível para Maria."],
          },
        ]),
      );
    else if (endpoint === "preferences") {
      if (body)
        Object.assign(preferences, {
          locale: body.locale,
          explanation: body.explanation,
          speechRate: body.speechRate,
          textScale: body.textScale,
        });
      await json(envelope("preferences", preferences));
    } else if (endpoint === "requests") {
      if (body) {
        if (
          !requests.some((item) => item.idempotencyKey === body.idempotencyKey)
        )
          requests.push({
            ...scope,
            id: "request-1",
            type: body.type as string,
            status: "accepted",
            idempotencyKey: body.idempotencyKey as string,
            createdAt: now,
            updatedAt: now,
          });
        if (failNextRequest) {
          failNextRequest = false;
          await route.abort("failed");
          return;
        }
        await json(envelope("request", requests[0]));
      } else await json(envelope("requests", requests));
    } else if (endpoint === "symptom-reports") {
      if (body!.text !== "Estou com febre e vomitando") {
        await json(
          envelope("symptom_report", { ...scope, status: "not_applicable" }),
        );
      } else {
        if (
          !symptomReports.some(
            (item) => item.idempotencyKey === body!.idempotencyKey,
          )
        )
          symptomReports.push(body!);
        if (failNextSymptom) {
          failNextSymptom = false;
          await route.abort("failed");
          return;
        }
        await json(
          envelope("symptom_report", {
            ...scope,
            id: "symptom-1",
            text: body!.text,
            source: body!.source,
            recordedAt: now,
            status: "recorded",
            alertId: "signal-1",
            reviewRequired: true,
            guidance:
              "Procure avaliação no serviço de oncologia agora. Se não conseguir contato, procure um pronto atendimento. Não espere pelo aplicativo.",
          }),
        );
      }
    } else if (endpoint === "wellbeing") {
      if (holdCheckin)
        await new Promise<void>((resolve) => {
          releaseCheckin = resolve;
        });
      reports.push(body!);
      await json(
        envelope("wellbeing_record", {
          ...scope,
          id: "report-1",
          feeling: body!.feeling,
          recordedAt: body!.recordedAt,
          createdAt: now,
          idempotencyKey: body!.idempotencyKey,
          status: "recorded",
        }),
      );
    } else if (endpoint === "messages") {
      if (body) {
        messages.push({
          ...scope,
          id: "patient-message-1",
          role: "patient",
          authorLabel: "Maria",
          text: body.text as string,
          createdAt: now,
          status: "recorded",
        });
        await json(envelope("message", messages.at(-1)));
      } else await json(envelope("messages", messages));
    } else await route.fulfill({ status: 404, headers, body: "{}" });
  });
  return {
    requests,
    messages,
    reports,
    symptomReports,
    writes,
    preferences,
    failRequest() {
      failNextRequest = true;
    },
    failSymptom() {
      failNextSymptom = true;
    },
    holdReport() {
      holdCheckin = true;
    },
    releaseReport() {
      holdCheckin = false;
      releaseCheckin?.();
    },
    changeAppointment(title: string) {
      appointments = appointments.map((item) => ({ ...item, title }));
    },
  };
}

async function textLia(page: Page) {
  await page.evaluate(() => {
    location.hash = "#lia";
  });
  await page.getByLabel("Mensagem para a Lia", { exact: true }).waitFor();
  await page.getByLabel("Ouvir as respostas da Lia", { exact: true }).uncheck();
}
async function sayByText(page: Page, text: string) {
  await page.getByLabel("Mensagem para a Lia", { exact: true }).fill(text);
  await page
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
}

test("a connected symptom report does not require the AI or TTS provider to be configured", async ({
  page,
}) => {
  await mockConnectedAgent(page, false);
  const api = await hospitalApi(page);
  await connect(page);
  await textLia(page);
  await sayByText(page, "Estou com febre e vomitando");
  await expect(page.getByTestId("connected-symptom-status")).toContainText(
    "Alerta registrado",
  );
  expect(api.symptomReports).toHaveLength(1);
  expect(await page.evaluate("window.agent.chats.length")).toBe(0);
});

test("an identical symptom in a new app session creates a new report, while retries stay idempotent", async ({
  page,
}) => {
  await mockConnectedAgent(page);
  const api = await hospitalApi(page);
  await connect(page);
  await textLia(page);
  await sayByText(page, "Estou com febre e vomitando");
  await expect(page.getByTestId("connected-symptom-status")).toContainText(
    "Alerta registrado",
  );
  await page.reload();
  await connect(page);
  await textLia(page);
  await sayByText(page, "Estou com febre e vomitando");
  await expect(page.getByTestId("connected-symptom-status")).toContainText(
    "Alerta registrado",
  );
  expect(api.symptomReports).toHaveLength(2);
  expect(api.symptomReports[0].idempotencyKey).not.toBe(
    api.symptomReports[1].idempotencyKey,
  );
});

test("Lia automatically registers a literal symptom report before GPT, without an extra confirmation", async ({
  page,
}) => {
  await mockConnectedAgent(page);
  const api = await hospitalApi(page);
  await connect(page);
  await textLia(page);
  await sayByText(page, "Estou com febre e vomitando");
  await expect(page.getByTestId("connected-symptom-status")).toContainText(
    "Alerta registrado",
  );
  await expect(page.getByTestId("connected-symptom-status")).toContainText(
    "pronto atendimento",
  );
  expect(api.symptomReports).toHaveLength(1);
  expect(api.symptomReports[0]).toMatchObject({
    text: "Estou com febre e vomitando",
    source: "text",
    locale: "pt-BR",
  });
  expect(await page.evaluate("window.agent.chats.length")).toBe(0);
  await expect(
    page.getByRole("button", { name: "Sim, confirmar", exact: true }),
  ).toHaveCount(0);
});

test("Lia retry reconciles a lost acknowledgement with the same report key", async ({
  page,
}) => {
  await mockConnectedAgent(page);
  const api = await hospitalApi(page);
  await connect(page);
  await textLia(page);
  api.failSymptom();
  await sayByText(page, "Estou com febre e vomitando");
  await expect(page.getByTestId("connected-symptom-status")).toContainText(
    "Envio não confirmado",
  );
  await expect(page.getByTestId("connected-symptom-status")).not.toContainText(
    "Alerta registrado",
  );
  await page.getByRole("button", { name: "Perfil", exact: true }).click();
  await page
    .getByLabel("Idioma do aplicativo", { exact: true })
    .selectOption("en-US");
  await page.evaluate(() => {
    location.hash = "#lia";
  });
  await page
    .getByRole("button", {
      name: "Retry sending report",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("connected-symptom-status")).toContainText(
    "Alert recorded",
  );
  expect(api.symptomReports).toHaveLength(1);
  const writes = api.writes.filter(
    (item) => item.endpoint === "symptom-reports",
  );
  expect(writes).toHaveLength(2);
  expect(writes[1].body).toEqual(writes[0].body);
});

test("Lia sends the registered cancer context to GPT for education while negated symptoms create no alert", async ({
  page,
}) => {
  await mockConnectedAgent(page);
  const api = await hospitalApi(page);
  await connect(page);
  await textLia(page);
  await sayByText(page, "Não estou com febre. Pode explicar meu diagnóstico?");
  await expect(page.getByTestId("lia-answer").last()).toContainText("cadastro");
  expect(api.symptomReports).toHaveLength(0);
  const chats = await page.evaluate<any[]>("window.agent.chats");
  expect(chats).toHaveLength(1);
  expect(chats[0].context).toContain("Carcinoma invasivo de mama");
  expect(chats[0].context).not.toContain("planoTerapeuticoTexto");
  await expect(page.getByTestId("connected-symptom-status")).toHaveCount(0);
});

for (const scale of [1, 2])
  test(`continuous voice uses automatic symptoms and reachable controls at text scale ${scale}`, async ({
    page,
  }) => {
    await mockConnectedAgent(page);
    await page.setViewportSize({ width: 360, height: 640 });
    const api = await hospitalApi(page);
    api.preferences.textScale = scale;
    await connect(page);
    await page.getByRole("button", { name: /Falar com a Lia Diga/ }).click();
    await expect.poll(() => page.evaluate("window.agent.plays")).toBe(1);
    await page.evaluate("window.agent.finish()");
    await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
      "data-stage",
      "listening",
    );
    await page.evaluate('window.agent.turn("Estou com febre e vomitando")');
    await expect(page.getByTestId("connected-symptom-status")).toContainText(
      "Alerta registrado",
    );
    expect(api.symptomReports[0]).toMatchObject({ source: "voice" });
    expect(await page.evaluate("window.agent.chats.length")).toBe(0);
    for (const name of ["Silenciar microfone", "Encerrar conversa"])
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeInViewport({ ratio: 1 });
    await page
      .getByRole("button", { name: "Encerrar conversa", exact: true })
      .click();
  });

test("TTS quota failure keeps the microphone, written guidance and automatic alerts working", async ({
  page,
}) => {
  await mockConnectedAgent(page, true, false);
  await page.setViewportSize({ width: 360, height: 640 });
  const api = await hospitalApi(page);
  api.preferences.textScale = 2;
  await connect(page);
  await page.getByRole("button", { name: /Falar com a Lia Diga/ }).click();
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "listening",
  );
  await expect(page.locator(".voice-playback-warning")).toContainText(
    "continuar falando",
  );
  await expect(
    page.getByRole("region", { name: "Legendas da conversa" }),
  ).toBeVisible();
  await page.evaluate('window.agent.turn("Estou com febre e vomitando")');
  await expect(page.getByTestId("connected-symptom-status")).toContainText(
    "Alerta registrado",
  );
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "listening",
  );
  expect(api.symptomReports).toHaveLength(1);
  expect(await page.evaluate("window.agent.chats.length")).toBe(0);
  await expect(page.locator(".voice-call-error")).toHaveCount(0);
  for (const name of ["Silenciar microfone", "Encerrar conversa"])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeInViewport({ ratio: 1 });
  await page
    .getByRole("button", { name: "Encerrar conversa", exact: true })
    .click();
});

async function connect(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Conectar ao hospital", exact: true })
    .click();
  await page.getByLabel("Endereço do hospital", { exact: true }).fill(base);
  await page
    .getByLabel("Código de pareamento", { exact: true })
    .fill("OF-123456");
  await page
    .getByRole("button", { name: "Conectar ao hospital", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Olá, Maria." }),
  ).toBeVisible();
  await expect(
    page.getByText("Demonstração conectada · dados fictícios", { exact: true }),
  ).toBeVisible();
}

test("hospital data, requests, messages and preferences use the connected server session", async ({
  page,
}) => {
  const api = await hospitalApi(page);
  await connect(page);
  await expect(page.getByTestId("home-next-appointment")).toContainText(
    "Consulta publicada no painel",
  );
  await expect(page.getByTestId("home-next-appointment")).not.toContainText(
    "Consulta de acompanhamento",
  );
  api.changeAppointment("Consulta atualizada pela equipe");
  await expect(page.getByTestId("home-next-appointment")).toContainText(
    "Consulta atualizada pela equipe",
    { timeout: 7000 },
  );
  await page.getByTestId("home-next-appointment").click();
  await expect(page.getByRole("dialog")).toContainText(
    "Traga suas perguntas anotadas.",
  );
  await page.getByRole("button", { name: "Fechar", exact: true }).click();

  await page
    .getByRole("button", { name: "Meus pedidos Acompanhe suas solicitações" })
    .click();
  api.failRequest();
  await page
    .getByRole("button", { name: "Pedir contato da equipe", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar envio", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Não foi possível confirmar o envio",
  );
  await page
    .getByRole("button", { name: "Confirmar envio", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".request-card")).toContainText(
    "Recebido pelo hospital",
  );
  const requestWrites = api.writes.filter(
    (item) => item.endpoint === "requests",
  );
  expect(requestWrites).toHaveLength(2);
  expect(requestWrites[1].body).toEqual(requestWrites[0].body);
  expect(api.requests).toHaveLength(1);
  api.requests[0].status = "completed";
  await expect(page.locator(".request-card")).toContainText(
    "Concluído pela equipe",
    { timeout: 7000 },
  );

  await page
    .getByRole("button", { name: "Início", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: /Mensagens da equipe Conversas/ })
    .click();
  await page
    .getByLabel("Sua mensagem", { exact: true })
    .fill("Gostaria de conversar com a equipe.");
  await page
    .getByRole("button", { name: "Revisar mensagem", exact: true })
    .click();
  expect(api.messages).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirmar envio", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Mensagem confirmada" }),
  ).toBeVisible();
  expect(api.messages).toHaveLength(1);
  api.messages.push({
    ...scope,
    id: "team-response",
    role: "team",
    authorLabel: "Navegação",
    text: "Recebemos sua mensagem no painel.",
    createdAt: now,
    status: "recorded",
  });
  await expect(page.getByTestId("team-messages")).toContainText(
    "Recebemos sua mensagem no painel.",
    { timeout: 7000 },
  );

  await page.getByRole("button", { name: "Perfil", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Maria do painel" }),
  ).toBeVisible();
  await page
    .getByLabel("Tamanho do texto", { exact: true })
    .selectOption("1.25");
  await expect(
    page.getByLabel("Tamanho do texto", { exact: true }),
  ).toHaveValue("1.25");
  expect(api.preferences.textScale).toBe(1.25);
  await page
    .getByLabel("Idioma do aplicativo", { exact: true })
    .selectOption("en-US");
  await expect(
    page.getByRole("heading", { name: "My profile", exact: true }),
  ).toBeVisible();
  expect(api.preferences.locale).toBe("en-US");
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toMatch(/memory-only-token|OF-123456/);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Explore demo", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Maria do painel", { exact: true })).toHaveCount(
    0,
  );
});

test("check-in UI waits for a hospital acknowledgement", async ({ page }) => {
  const api = await hospitalApi(page);
  await connect(page);
  await page.getByRole("button", { name: "Como estou", exact: true }).click();
  await page.getByRole("button", { name: "Náusea", exact: true }).click();
  api.holdReport();
  await page
    .getByRole("button", { name: "Salvar registro", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Salvar registro", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Último registro confirmado:", { exact: false }),
  ).toHaveCount(0);
  expect(api.reports).toHaveLength(0);
  api.releaseReport();
  await expect(
    page.getByText("Último registro confirmado:", { exact: false }),
  ).toContainText("Náusea");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Registro confirmado pelo hospital" }),
  ).toBeVisible();
  expect(api.reports[0]).toMatchObject({
    feeling: "Náusea",
    confirmation: { confirmed: true },
  });
});

for (const size of [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
]) {
  test(`connected home keeps Lia reachable without scrolling at ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await hospitalApi(page);
    await connect(page);
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => {
      const cta = document
        .querySelector(".home-lia-cta")!
        .getBoundingClientRect();
      const nav = document
        .querySelector(".bottom-nav")!
        .getBoundingClientRect();
      return {
        scroll: window.scrollY,
        bottom: cta.bottom,
        navTop: nav.top,
        reachable: !!document
          .elementFromPoint(cta.x + cta.width / 2, cta.y + cta.height / 2)
          ?.closest(".home-lia-cta"),
      };
    });
    expect(layout.scroll).toBe(0);
    expect(layout.bottom).toBeLessThanOrEqual(layout.navTop - 4);
    expect(layout.reachable).toBe(true);
  });
}
