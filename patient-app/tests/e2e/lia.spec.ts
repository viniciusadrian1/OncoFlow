import { test, expect } from "@playwright/test";

async function mockLiveProviders(page: import("@playwright/test").Page) {
  await page.route("**/src/adapters/liaProvider.ts", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    window.testLia = { chats: 0, transcribes: 0, speech: 0, cancelled: 0, transcript: 'Quando é minha próxima consulta?' };
    export async function providerStatus(){return {configured:true}};
    export async function cancelProvider(){window.testLia.cancelled++};
    export async function createTranscriptionSession(){throw new Error('Live transport is not used by manual-mode tests')};
    export async function chatWithLia(input,signal){window.testLia.chats++; await new Promise(r=>setTimeout(r,200)); return {text:'Sua próxima consulta fictícia é em 3 de novembro.',intent:'agenda'}};
    export async function transcribeAudio(){window.testLia.transcribes++; return {text:window.testLia.transcript}};
    export async function synthesizeSpeech(){window.testLia.speech++; throw new Error('Falha de voz simulada no teste. A resposta continua no texto.')};
  `,
    }),
  );
  await page.route("**/src/features/voice/capture.ts", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    export async function startCapture(auto,error){window.testLia.auto=auto;window.testLia.captureError=error};
    export async function stopCapture(){return {base64:'ZmFrZQ==',mimeType:'audio/mp4',durationMs:3000}};
    export async function cancelCapture(){};
  `,
    }),
  );
}

async function openLia(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Lia", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Prefiro digitar", exact: true })
    .click();
}

test("Lia keeps text accessible, discloses processing and offers fictional scenarios", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Lia", exact: true })
    .click();
  await expect(page.getByLabel("Mensagem para a Lia")).toBeVisible();
  await expect(
    page.getByText("OpenAI e ElevenLabs", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar mensagem" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Minha próxima consulta", exact: true })
    .click();
  await expect(page.getByTestId("lia-answer").last()).toContainText(
    "03 de novembro",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Agenda", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Lia", exact: true })
    .click();
  await expect(page.getByTestId("lia-answer").last()).toContainText(
    "03 de novembro",
  );
});

test("voice transcript is reviewed before chat and a TTS failure preserves the answer", async ({
  page,
}) => {
  await mockLiveProviders(page);
  await openLia(page);
  await page.getByRole("button", { name: "Entendi, ativar a Lia" }).click();
  await page.getByRole("button", { name: "Gravar mensagem" }).click();
  await expect(page.getByText(/Ouvindo você/)).toBeVisible();
  await page.getByRole("button", { name: "Concluir gravação" }).click();
  await expect(page.getByLabel("Mensagem para a Lia")).toHaveValue(
    "Quando é minha próxima consulta?",
  );
  expect(await page.evaluate("window.testLia.chats")).toBe(0);
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.getByTestId("lia-answer").last()).toContainText(
    "3 de novembro",
  );
  await expect(page.getByRole("alert")).toContainText("Falha de voz simulada");
  expect(await page.evaluate("window.testLia.chats")).toBe(1);
});

test("urgent voice scenario precedes confirmation and no LLM request; failure and retry stay explicit", async ({
  page,
}) => {
  await mockLiveProviders(page);
  await openLia(page);
  await page.getByText("Explorar cenários fictícios", { exact: false }).click();
  await expect(page.getByTestId("safety-result")).toHaveCount(0);
  await page.getByLabel("Aplicar este cenário à conversa e à voz").check();
  await page.getByLabel("Simular falha no envio do próximo alerta").check();
  await page.getByRole("button", { name: "Entendi, ativar a Lia" }).click();
  await page.getByLabel("Ouvir as respostas da Lia").uncheck();
  await page.evaluate(
    "window.testLia.transcript='Estou com muita falta de ar agora'",
  );
  await page.getByRole("button", { name: "Gravar mensagem" }).click();
  await page.getByRole("button", { name: "Concluir gravação" }).click();
  await expect(page.getByTestId("safety-result")).toContainText(
    "procurar atendimento de urgência imediatamente",
  );
  await expect(page.getByLabel("Mensagem para a Lia")).toHaveValue(
    "Estou com muita falta de ar agora",
  );
  expect(await page.evaluate("window.testLia.chats")).toBe(0);
  await page
    .getByRole("button", { name: "Tentar envio simulado novamente" })
    .click();
  await expect(
    page.getByRole("button", { name: "Simular recebimento", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator(".safety-alert")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Simular recebimento", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Simular equipe assumindo" }),
  ).toBeVisible();
});

test("leaving Lia cancels work and rejects a late chat response", async ({
  page,
}) => {
  await mockLiveProviders(page);
  await openLia(page);
  await page.getByRole("button", { name: "Entendi, ativar a Lia" }).click();
  await page.getByLabel("Mensagem para a Lia").fill("Mostre minha consulta");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Agenda", exact: true })
    .click();
  await page.waitForTimeout(350);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Lia", exact: true })
    .click();
  await expect(page.getByTestId("lia-answer")).toHaveCount(0);
  expect(await page.evaluate("window.testLia.cancelled")).toBeGreaterThan(0);
});

test("Lia is usable at 200% text and resets conversation on persona change", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Perfil", exact: true })
    .click();
  await page.getByLabel("Tamanho do texto").selectOption("2");
  await page.getByLabel("Velocidade da voz").selectOption("0.8");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Lia", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Minha próxima consulta", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByLabel("Mensagem para a Lia")).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Perfil", exact: true })
    .click();
  await page.getByRole("button", { name: /João Almeida/ }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Lia", exact: true })
    .click();
  await expect(page.getByTestId("lia-answer")).toHaveCount(0);
});
