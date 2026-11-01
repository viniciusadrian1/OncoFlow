import { test, expect, type Page } from "@playwright/test";

// Real UI, live conversation controller and playback analyser. Only transport,
// providers and audio completion are fixtures; no network speech requests occur.
async function mockConversation(page: Page) {
  await page.addInitScript(() => {
    const state: any = {
      starts: 0,
      closes: 0,
      cancels: 0,
      chats: 0,
      transcribes: 0,
      speech: 0,
      plays: 0,
      pauses: 0,
      commits: 0,
      text: "Quando é minha próxima consulta?",
      histories: [],
      sessions: [],
      inputMuted: false,
      muteChanges: [],
      failMicrophone: false,
      holdChat: false,
      playbackTime: 0,
    };
    (window as any).testConversation = state;
    (window as any).AudioContext = class {
      async decodeAudioData() {
        const pcm = new Float32Array(16000);
        pcm.fill(0.5, 2000, 6000);
        return {
          numberOfChannels: 1,
          sampleRate: 8000,
          getChannelData: () => pcm,
        };
      }
      async close() {}
    };
    (window as any).Audio = class extends EventTarget {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      paused = true;
      ended = false;
      src: string;
      get currentTime() {
        return state.playbackTime;
      }
      constructor(src = "") {
        super();
        this.src = src;
      }
      async play() {
        this.paused = false;
        state.plays++;
        state.playbackTime = 0;
        state.finishPlayback = () => {
          if (this.paused) return;
          this.paused = true;
          this.ended = true;
          this.onended?.();
          this.dispatchEvent(new Event("ended"));
        };
      }
      pause() {
        this.paused = true;
        state.pauses++;
      }
      load() {}
      removeAttribute(name: string) {
        if (name === "src") this.src = "";
      }
    };
  });
  await page.route("**/src/adapters/liaProvider.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
      export async function providerStatus(){return {configured:true}};
      export async function cancelProvider(){window.testConversation.cancels++};
      export async function createTranscriptionSession(){throw new Error('Transport is mocked; no credentials are used')};
      export async function chatWithLia(input,signal){
        const s=window.testConversation;s.chats++;s.histories.push(input.history);
        const result={text:s.chats===1?'Sua próxima consulta fictícia é em 3 de novembro.':'Vamos por partes: sua consulta fictícia é em 3 de novembro.',intent:'agenda'};
        if(s.holdChat)return new Promise(resolve=>s.releaseChat=()=>resolve(result));
        return result;
      };
      export async function transcribeAudio(){window.testConversation.transcribes++;return {text:window.testConversation.text}};
      export async function synthesizeSpeech(){window.testConversation.speech++;return new Blob(['fake-audio'],{type:'audio/mpeg'})};
    `,
    }),
  );
  await page.route("**/src/features/voice/realtimeTranscription.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
      export async function connectRealtimeInput(handlers,signal){
        const s=window.testConversation;s.starts++;
        if(s.failMicrophone)throw new Error('Microfone não autorizado. Tente novamente.');
        let closed=false;
        const close=()=>{if(closed)return;closed=true;s.closes++;signal.removeEventListener('abort',close)};
        signal.addEventListener('abort',close,{once:true});
        s.handlers=handlers;s.sessions.push(handlers);
        s.sendTurn=(text=s.text)=>{handlers.onSpeechStart();handlers.onPartial(text);handlers.onSpeechEnd();handlers.onTranscript(text)};
        return {
          setMuted(value){s.inputMuted=value;s.muteChanges.push(value)},
          finishTurn(){s.commits++;handlers.onSpeechEnd()},
          close,
        };
      };
    `,
    }),
  );
  await page.route("**/src/features/voice/capture.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
      export async function startCapture(){throw new Error('Manual capture must not run in live mode')};
      export async function stopCapture(){return {base64:'ZmFrZQ==',mimeType:'audio/mp4',durationMs:3000}};
      export async function cancelCapture(){};
    `,
    }),
  );
}

async function openConversation(page: Page) {
  await mockConversation(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Lia", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Prefiro digitar", exact: true })
    .click();
  await page.getByRole("button", { name: "Entendi, ativar a Lia" }).click();
}
async function startConversation(page: Page, finishGreeting = true) {
  await page
    .getByRole("button", { name: "Iniciar conversa", exact: true })
    .click();
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "speaking",
  );
  await expect
    .poll(() => page.evaluate("window.testConversation.plays"))
    .toBe(1);
  await expect(page.getByTestId("lia-answer")).toHaveCount(1);
  expect(await page.evaluate("window.testConversation.chats")).toBe(0);
  if (finishGreeting) await finishPlayback(page);
}
async function finishPlayback(page: Page, state = "listening") {
  await page.evaluate("window.testConversation.finishPlayback()");
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    state,
  );
}
async function sendTurn(page: Page, text = "Quando é minha próxima consulta?") {
  const plays = await page.evaluate<number>("window.testConversation.plays");
  await page.evaluate(
    (value) => (window as any).testConversation.sendTurn(value),
    text,
  );
  await expect
    .poll(() => page.evaluate("window.testConversation.plays"))
    .toBe(plays + 1);
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "speaking",
  );
}
async function endConversation(page: Page) {
  await page
    .getByRole("button", { name: "Encerrar conversa", exact: true })
    .click();
  await expect(page.getByTestId("voice-conversation")).toHaveCount(0);
}

test("greets automatically and handles two turns through one microphone connection", async ({
  page,
}) => {
  await openConversation(page);
  await startConversation(page);
  await expect(page.getByTestId("lia-answer").first()).toContainText(
    "Sou a Lia",
  );
  for (const text of [
    "Quando é minha próxima consulta?",
    "Pode explicar passo a passo?",
  ]) {
    await sendTurn(page, text);
    await expect(page.locator(".lia-review")).toHaveCount(0);
    await expect(page.locator(".lia-composer")).toBeHidden();
    expect(await page.evaluate("window.testConversation.starts")).toBe(1);
    await finishPlayback(page);
  }
  await expect(page.getByTestId("lia-user-message")).toHaveCount(2);
  await expect(page.getByTestId("lia-answer")).toHaveCount(3);
  expect(
    await page.evaluate("window.testConversation.histories[1].length"),
  ).toBeGreaterThanOrEqual(3);
  expect(await page.evaluate("window.testConversation.transcribes")).toBe(0);
  await endConversation(page);
  expect(await page.evaluate("window.testConversation.closes")).toBe(1);
});

test("speech start interrupts Lia and continues automatically on the same input", async ({
  page,
}) => {
  await openConversation(page);
  await startConversation(page);
  await sendTurn(page);
  const pauses = await page.evaluate<number>("window.testConversation.pauses");
  await page.evaluate(
    "window.testConversation.oldPlaybackEnd=window.testConversation.finishPlayback;window.testConversation.handlers.onSpeechStart()",
  );
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "listening",
  );
  expect(await page.evaluate("window.testConversation.pauses")).toBeGreaterThan(
    pauses,
  );
  await page.evaluate(
    "window.testConversation.handlers.onPartial('Pode explicar de novo?');window.testConversation.handlers.onSpeechEnd();window.testConversation.handlers.onTranscript('Pode explicar de novo?')",
  );
  await expect
    .poll(() => page.evaluate("window.testConversation.plays"))
    .toBe(3);
  await page.evaluate("window.testConversation.oldPlaybackEnd()");
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "speaking",
  );
  await finishPlayback(page);
  expect(await page.evaluate("window.testConversation.starts")).toBe(1);
  await endConversation(page);
});

test("tapping Lia preserves playback, mute and a pending response", async ({
  page,
}) => {
  await openConversation(page);
  await startConversation(page, false);
  const tapLia = async () => {
    const box = await page.getByTestId("voice-orb").boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  };
  const pauses = await page.evaluate<number>("window.testConversation.pauses");
  await tapLia();
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "speaking",
  );
  expect(await page.evaluate("window.testConversation.pauses")).toBe(pauses);
  await page
    .getByRole("button", { name: "Silenciar microfone", exact: true })
    .click();
  await tapLia();
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-muted",
    "true",
  );
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "speaking",
  );
  expect(await page.evaluate("window.testConversation.pauses")).toBe(pauses);
  await page
    .getByRole("button", { name: "Ativar microfone", exact: true })
    .click();
  await finishPlayback(page);
  await page.evaluate(
    "window.testConversation.holdChat=true;window.testConversation.sendTurn()",
  );
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "thinking",
  );
  await tapLia();
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "thinking",
  );
  await page.evaluate("window.testConversation.releaseChat()");
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "speaking",
  );
  expect(await page.evaluate("window.testConversation.starts")).toBe(1);
  await expect(
    page.getByRole("button", { name: "Interromper e falar", exact: true }),
  ).toHaveCount(0);
  await endConversation(page);
});

test("mute preserves Lia's response, ignores input and resumes the existing connection", async ({
  page,
}) => {
  await openConversation(page);
  await startConversation(page);
  await sendTurn(page);
  const pauses = await page.evaluate("window.testConversation.pauses");
  await page
    .getByRole("button", { name: "Silenciar microfone", exact: true })
    .click();
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "speaking",
  );
  await expect(
    page.getByRole("button", { name: "Ativar microfone", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate("window.testConversation.inputMuted")).toBe(true);
  await page.evaluate(
    "window.testConversation.sendTurn('Esta fala silenciada deve ser ignorada')",
  );
  expect(await page.evaluate("window.testConversation.pauses")).toBe(pauses);
  expect(await page.evaluate("window.testConversation.chats")).toBe(1);
  await finishPlayback(page, "muted");
  await page
    .getByRole("button", { name: "Ativar microfone", exact: true })
    .click();
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "listening",
  );
  expect(await page.evaluate("window.testConversation.inputMuted")).toBe(false);
  await sendTurn(page, "Pode explicar melhor?");
  expect(await page.evaluate("window.testConversation.starts")).toBe(1);
  await expect(page.getByTestId("lia-user-message")).toHaveCount(2);
  await endConversation(page);
});

test("mute preserves pending transcription, reasoning and playback through the same turn", async ({
  page,
}) => {
  await openConversation(page);
  await startConversation(page);
  await page.evaluate(
    "window.testConversation.holdChat=true;window.testConversation.handlers.onSpeechStart();window.testConversation.handlers.onSpeechEnd()",
  );
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "transcribing",
  );
  const cancels = await page.evaluate<number>("window.testConversation.cancels");
  await page
    .getByRole("button", { name: "Silenciar microfone", exact: true })
    .click();
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-muted",
    "true",
  );
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "transcribing",
  );
  await page.evaluate(
    "window.testConversation.handlers.onTranscript('Quando é minha consulta?')",
  );
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "thinking",
  );
  await page
    .getByRole("button", { name: "Ativar microfone", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Silenciar microfone", exact: true })
    .click();
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "thinking",
  );
  const thinkingCancels = await page.evaluate<number>(
    "window.testConversation.cancels",
  );
  await page.evaluate("window.testConversation.releaseChat()");
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "speaking",
  );
  expect(await page.evaluate("window.testConversation.cancels")).toBe(
    thinkingCancels,
  );
  expect(thinkingCancels).toBeGreaterThanOrEqual(cancels);
  await finishPlayback(page, "muted");
  expect(await page.evaluate("window.testConversation.chats")).toBe(1);
  expect(await page.evaluate("window.testConversation.starts")).toBe(1);
  await endConversation(page);
});

test("partial transcripts and input bars follow live input; manual finish commits the same turn", async ({
  page,
}) => {
  await openConversation(page);
  await startConversation(page);
  await page.getByRole("button", { name: "Mostrar legendas" }).click();
  const captions = page.getByRole("region", { name: "Legendas da conversa" });
  await page.evaluate(
    "window.testConversation.handlers.onSpeechStart();window.testConversation.handlers.onPartial('Quando é minha');window.testConversation.handlers.onLevel(0.6)",
  );
  await expect(captions).toContainText("Quando é minha");
  await expect(page.getByTestId("voice-input-level")).toHaveAttribute(
    "data-input-level",
    "0.600",
  );
  await page
    .getByRole("button", { name: "Terminei de falar", exact: true })
    .click();
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "transcribing",
  );
  expect(await page.evaluate("window.testConversation.commits")).toBe(1);
  await page.evaluate(
    "window.testConversation.handlers.onTranscript('Quando é minha próxima consulta?')",
  );
  await expect(captions).toContainText("3 de novembro");
  await expect(page.getByTestId("voice-input-level")).toHaveAttribute(
    "data-input-level",
    "0.000",
  );
  expect(await page.evaluate("window.testConversation.starts")).toBe(1);
  await endConversation(page);
});

test("the orb follows decoded output amplitude and captions remain optional", async ({
  page,
}) => {
  await openConversation(page);
  await startConversation(page);
  await sendTurn(page);
  const captions = page.getByRole("region", { name: "Legendas da conversa" });
  const orb = page.getByTestId("voice-orb");
  await expect(captions).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar legendas" }).click();
  await expect(captions).toContainText("3 de novembro");
  await page.evaluate("window.testConversation.playbackTime=0.4");
  await expect
    .poll(async () => Number(await orb.getAttribute("data-audio-level")))
    .toBeGreaterThan(0.2);
  await page.evaluate("window.testConversation.playbackTime=1.5");
  await expect
    .poll(async () => Number(await orb.getAttribute("data-audio-level")))
    .toBeLessThan(0.01);
  await page.getByRole("button", { name: "Ocultar legendas" }).click();
  await expect(captions).toHaveCount(0);
  await endConversation(page);
});

test("connection errors stay inside the dialog and retry establishes a fresh live session", async ({
  page,
}) => {
  await openConversation(page);
  await page.evaluate("window.testConversation.failMicrophone=true");
  await page
    .getByRole("button", { name: "Iniciar conversa", exact: true })
    .click();
  const dialog = page.getByTestId("voice-conversation");
  await expect(dialog).toHaveAttribute("data-stage", "error");
  await expect(dialog.getByRole("alert")).toContainText(
    "Microfone não autorizado",
  );
  await expect(
    dialog.getByRole("button", { name: "Encerrar conversa", exact: true }),
  ).toBeEnabled();
  await page.evaluate("window.testConversation.failMicrophone=false");
  await dialog
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(dialog).toHaveAttribute("data-stage", "speaking");
  expect(await page.evaluate("window.testConversation.starts")).toBe(2);
  await finishPlayback(page);
  await endConversation(page);
});

test("a dropped input connection is recoverable and old transport callbacks are ignored", async ({
  page,
}) => {
  await openConversation(page);
  await startConversation(page);
  await page.evaluate(
    "window.testConversation.handlers.onError(new Error('A conexão de voz caiu. Tente novamente.'))",
  );
  const dialog = page.getByTestId("voice-conversation");
  await expect(dialog).toHaveAttribute("data-stage", "error");
  await expect(dialog.getByRole("alert")).toContainText("conexão de voz caiu");
  await dialog
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate("window.testConversation.plays"))
    .toBe(2);
  await page.evaluate(
    "window.testConversation.sessions[0].onTranscript('Uma fala atrasada')",
  );
  expect(await page.evaluate("window.testConversation.chats")).toBe(0);
  await finishPlayback(page);
  await sendTurn(page);
  expect(await page.evaluate("window.testConversation.starts")).toBe(2);
  await endConversation(page);
});

test("ending while a response is pending ignores its late result", async ({
  page,
}) => {
  await openConversation(page);
  await startConversation(page);
  await page.evaluate(
    "window.testConversation.holdChat=true;window.testConversation.sendTurn()",
  );
  await expect
    .poll(() => page.evaluate("window.testConversation.chats"))
    .toBe(1);
  await endConversation(page);
  await page.evaluate("window.testConversation.releaseChat()");
  await expect(page.getByTestId("lia-answer")).toHaveCount(1);
  expect(await page.evaluate("window.testConversation.plays")).toBe(1);
  expect(await page.evaluate("window.testConversation.starts")).toBe(1);
  expect(await page.evaluate("window.testConversation.closes")).toBe(1);
});

test("Escape closes the call and ignores old input after navigating away", async ({
  page,
}) => {
  await openConversation(page);
  await startConversation(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("voice-conversation")).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Agenda", exact: true })
    .click();
  await page.evaluate("window.testConversation.sendTurn()");
  await page.evaluate(() => {
    location.hash = "lia";
  });
  await expect(
    page.getByRole("button", { name: "Iniciar conversa", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("lia-answer")).toHaveCount(1);
  expect(await page.evaluate("window.testConversation.chats")).toBe(0);
});

test("Android Back ends the dialog before navigating away from Lia", async ({
  page,
}) => {
  await page.route("**/@capacitor_core.js*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const Capacitor={isNativePlatform:()=>true,getPlatform:()=>"android"};
      export const CapacitorHttp={request:async()=>{throw new Error("Hospital transport is not used by this standalone test")}};`,
    }),
  );
  await page.route("**/@capacitor_app.js*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `const callbacks=new Map();window.testAndroidBack=()=>callbacks.get('backButton')?.();
      export const App={async addListener(name,callback){callbacks.set(name,callback);return {remove:async()=>{if(callbacks.get(name)===callback)callbacks.delete(name)}}},async exitApp(){window.testAndroidExited=true}};`,
    }),
  );
  await openConversation(page);
  await startConversation(page);
  await page.evaluate("window.testAndroidBack()");
  await expect(page.getByTestId("voice-conversation")).toHaveCount(0);
  await expect(page).toHaveURL(/#lia$/);
  await page.evaluate("window.testConversation.sendTurn()");
  expect(await page.evaluate("window.testConversation.chats")).toBe(0);
  expect(await page.evaluate("window.testAndroidExited")).not.toBe(true);
  await page.evaluate("window.testAndroidBack()");
  await expect(page).toHaveURL(/#home$/);
});

test("small-screen controls remain visible at 200 percent text, including captions and errors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openConversation(page);
  await page
    .locator(".app-shell")
    .evaluate((element) =>
      (element as HTMLElement).style.setProperty("--text-scale", "2"),
    );
  await startConversation(page);
  for (const name of [
    "Silenciar microfone",
    "Encerrar conversa",
    "Mostrar legendas",
  ]) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeInViewport({ ratio: 1 });
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(
      name === "Mostrar legendas" ? 48 : 64,
    );
    expect(box?.height).toBeGreaterThanOrEqual(
      name === "Mostrar legendas" ? 48 : 64,
    );
  }
  await page.getByRole("button", { name: "Mostrar legendas" }).click();
  await page.evaluate(
    "window.testConversation.handlers.onPartial('Quando é minha próxima consulta?')",
  );
  await expect(
    page.getByRole("region", { name: "Legendas da conversa" }),
  ).toContainText("Quando é minha próxima consulta?");
  await expect(
    page.getByRole("button", { name: "Encerrar conversa", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "Ocultar legendas" }).click();
  await page.evaluate(
    "window.testConversation.handlers.onError(new Error('A conexão de voz caiu. Confira a internet e tente novamente.'))",
  );
  await page.screenshot({ path: "docs/previews/v07/voice-error-200.png" });
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole("button", { name: "Encerrar conversa", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  expect(
    await page.evaluate(
      "document.querySelector('dialog').scrollWidth<=window.innerWidth",
    ),
  ).toBe(true);
  await endConversation(page);
});

test("landscape captions leave turn completion operable", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await openConversation(page);
  await page
    .locator(".app-shell")
    .evaluate((element) =>
      (element as HTMLElement).style.setProperty("--text-scale", "2"),
    );
  await startConversation(page, false);
  await page
    .getByRole("button", { name: "Mostrar legendas", exact: true })
    .click();
  await page.evaluate("window.testConversation.handlers.onSpeechStart()");
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "listening",
  );
  await page.screenshot({
    path: "docs/previews/v07/voice-landscape-controls-200.png",
  });
  await page.locator(".voice-captions").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/previews/v07/voice-landscape-captions-200.png",
  });
  await page
    .getByRole("button", { name: "Terminei de falar", exact: true })
    .click({ timeout: 2500 });
  expect(await page.evaluate("window.testConversation.commits")).toBe(1);
  await endConversation(page);
});

test("voice text respects the full 200 percent preference", async ({
  page,
}) => {
  await openConversation(page);
  await startConversation(page, false);
  const sizes = () =>
    page.evaluate(() =>
      [".voice-status", ".voice-hint", ".voice-control-group > span"].map(
        (selector) =>
          parseFloat(
            getComputedStyle(document.querySelector(selector)!).fontSize,
          ),
      ),
    );
  const normal = await sizes();
  await endConversation(page);
  await page
    .locator(".app-shell")
    .evaluate((element) =>
      (element as HTMLElement).style.setProperty("--text-scale", "2"),
    );
  await page
    .getByRole("button", { name: "Iniciar conversa", exact: true })
    .click();
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "speaking",
  );
  await page.screenshot({ path: "docs/previews/v07/voice-text-200.png" });
  const enlarged = await sizes();
  enlarged.forEach((size, index) =>
    expect(size / normal[index]).toBeCloseTo(2, 1),
  );
  await endConversation(page);
});
