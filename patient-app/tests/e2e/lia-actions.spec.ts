import { test, expect, type Page } from "@playwright/test";
import type { LiaAction } from "../../shared/liaActions";

async function mockAgent(page: Page) {
  await page.addInitScript(() => {
    const state: any = {
      starts: 0,
      closes: 0,
      chats: [],
      plays: 0,
      speeds: [],
      nextAction: null,
      hold: false,
    };
    (window as any).agent = state;
    (window as any).AudioContext = class {
      async decodeAudioData() {
        return {
          numberOfChannels: 1,
          sampleRate: 8000,
          getChannelData: () => new Float32Array(8000).fill(0.2),
        };
      }
      async close() {}
    };
    (window as any).Audio = class extends EventTarget {
      paused = true;
      ended = false;
      currentTime = 0.2;
      onended: (() => void) | null = null;
      src = "";
      onerror = null;
      constructor(src = "") {
        super();
        this.src = src;
      }
      async play() {
        this.paused = false;
        state.plays++;
        state.finish = () => {
          if (this.paused) return;
          this.paused = true;
          this.ended = true;
          this.onended?.();
          this.dispatchEvent(new Event("ended"));
        };
      }
      pause() {
        this.paused = true;
      }
      load() {}
      removeAttribute() {}
    };
  });
  await page.route("**/src/adapters/liaProvider.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    export async function providerStatus(){return {configured:true}};
    export async function cancelProvider(){};
    export async function createTranscriptionSession(){throw new Error('Mock transport only')};
    export async function chatWithLia(input){const s=window.agent;s.chats.push(input);const result={text:'Texto do modelo não comprova execução.',intent:'other',action:s.nextAction};if(s.hold)return new Promise(resolve=>s.release=()=>resolve(result));return result;}
    export async function synthesizeSpeech(text,speed){window.agent.speeds.push(speed);return new Blob(['fixture'],{type:'audio/mpeg'})};
    export async function transcribeAudio(){return {text:'fixture'}};
  `,
    }),
  );
  await page.route("**/src/features/voice/realtimeTranscription.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    export async function connectRealtimeInput(handlers,signal){const s=window.agent;s.starts++;s.handlers=handlers;let closed=false;const close=()=>{if(!closed){closed=true;s.closes++;}};signal.addEventListener('abort',close,{once:true});s.turn=text=>{handlers.onSpeechStart();handlers.onPartial(text);handlers.onSpeechEnd();handlers.onTranscript(text)};return {close,setMuted(){},finishTurn(){handlers.onSpeechEnd()}};}
  `,
    }),
  );
  await page.route("**/src/features/voice/capture.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'export async function cancelCapture(){};export async function startCapture(){throw new Error("manual not used")};export async function stopCapture(){throw new Error("manual not used")};',
    }),
  );
}
async function start(page: Page) {
  await mockAgent(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page.getByRole("button", { name: /Falar com a Lia Diga/ }).click();
  await expect(
    page.getByRole("button", { name: "Entendi, ativar e conversar" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Entendi, ativar e conversar" })
    .click();
  await expect.poll(() => page.evaluate("window.agent.plays")).toBe(1);
  await page.evaluate("window.agent.finish()");
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "listening",
  );
}
async function turn(page: Page, text: string, action: LiaAction | null = null) {
  const plays = await page.evaluate<number>("window.agent.plays");
  await page.evaluate(
    ({ text, action }) => {
      (window as any).agent.nextAction = action;
      (window as any).agent.turn(text);
    },
    { text, action },
  );
  await expect
    .poll(() => page.evaluate<number>("window.agent.plays"))
    .toBe(plays + 1);
  await page.evaluate("window.agent.finish()");
}
const action = (
  type: LiaAction["type"],
  target: string | null = null,
  value: string | null = null,
): LiaAction => ({ type, target, value });

test("one home action starts voice after first consent and one tap on subsequent visits", async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole("button", { name: "Encerrar conversa", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Início", exact: true })
    .click();
  await page.getByRole("button", { name: /Falar com a Lia Diga/ }).click();
  await expect.poll(() => page.evaluate("window.agent.starts")).toBe(2);
  await expect(
    page.getByRole("button", { name: "Entendi, ativar e conversar" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("voice-conversation")).toBeVisible();
  await page
    .getByRole("button", { name: "Encerrar conversa", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  expect(await page.evaluate("window.agent.starts")).toBe(0);
});

test("voice opens agenda, keeps one microphone connection and uses fresh preferences", async ({
  page,
}) => {
  await start(page);
  await turn(page, "Abra minha agenda", action("navigate", "agenda"));
  await expect(page).toHaveURL(/#agenda$/);
  await expect(page.getByTestId("lia-call-dock")).toBeVisible();
  expect(await page.evaluate("window.agent.closes")).toBe(0);
  await turn(page, "Fale mais devagar", action("set_speech_rate", null, "0.8"));
  await turn(
    page,
    "Aumente as letras para 200%",
    action("set_text_scale", null, "2"),
  );
  await turn(page, "Como ficou meu perfil?", action("read", "profile"));
  const last = await page.evaluate<any>("window.agent.chats.at(-1)");
  expect(JSON.parse(last.context).prefs).toEqual({
    explanation: "short",
    speechRate: 0.8,
    textScale: 2,
  });
  expect(JSON.parse(last.context).page).toBe("agenda");
  expect(await page.evaluate("window.agent.speeds.at(-1)")).toBe(0.8);
  await expect(page.locator('[data-testid="lia-answer"]').last()).toContainText(
    "200%",
  );
  await expect(
    page.getByRole("button", { name: "Encerrar conversa", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await page
    .getByRole("button", { name: "Encerrar conversa", exact: true })
    .click();
  expect(await page.evaluate("window.agent.starts")).toBe(1);
});

test("voice confirmation saves wellbeing, rejects a negative and never duplicates a request", async ({
  page,
}) => {
  await start(page);
  await turn(
    page,
    "Registre que estou cansada",
    action("record_wellbeing", null, "Cansado(a)"),
  );
  await expect(page.getByTestId("lia-action-confirmation")).toBeVisible();
  const before = await page.evaluate<number>("window.agent.chats.length");
  await turn(page, "Não, cancelar");
  await expect(page.getByTestId("lia-action-confirmation")).toHaveCount(0);
  expect(await page.evaluate("window.agent.chats.length")).toBe(before);
  await turn(
    page,
    "Registre que estou cansada",
    action("record_wellbeing", null, "Cansado(a)"),
  );
  await turn(page, "Sim, confirmar");
  await expect(page).toHaveURL(/#checkin$/);
  await expect(page.locator(".saved-mood")).toContainText("Cansado(a)");
  await turn(page, "Peça contato da equipe", action("request_contact"));
  await turn(page, "Sim");
  await expect(page).toHaveURL(/#requests$/);
  await expect(page.locator(".request-card")).toHaveCount(1);
  await turn(page, "Sim");
  await expect(page.locator(".request-card")).toHaveCount(1);
  await expect(page.locator('[data-testid="lia-answer"]').last()).toContainText(
    "Não há uma ação",
  );
  await page
    .getByRole("button", { name: "Encerrar conversa", exact: true })
    .click();
});

test("details opened by Lia leave call controls usable through the reschedule sheet", async ({
  page,
}) => {
  await start(page);
  await turn(page, "Leia minha agenda", action("read", "agenda"));
  const snapshot = JSON.parse(
    await page.evaluate<string>("window.agent.chats.at(-1).context"),
  );
  const appointment = snapshot.appointments.find(
    (a: any) => a.status === "confirmed",
  );
  await turn(
    page,
    "Abra minha próxima consulta",
    action("open_appointment", appointment.id),
  );
  const sheet = page.getByRole("dialog", { name: "Seu encontro" });
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate((el) => el.matches(":modal"))).toBe(false);
  await sheet.getByRole("button", { name: "Solicitar reagendamento" }).click();
  const request = page.getByRole("dialog", { name: "Pedir outro horário" });
  await expect(request).toBeVisible();
  expect(await request.evaluate((el) => el.matches(":modal"))).toBe(false);
  await page
    .getByRole("button", { name: "Silenciar microfone", exact: true })
    .click();
  await expect(page.getByTestId("lia-call-dock")).toHaveAttribute(
    "data-muted",
    "true",
  );
  await page
    .getByRole("button", { name: "Encerrar conversa", exact: true })
    .click();
});

test("an ended call cannot confirm its old proposal or apply a late model action", async ({
  page,
}) => {
  await start(page);
  await turn(page, "Peça contato", action("request_contact"));
  await page
    .getByRole("button", { name: "Encerrar conversa", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Lia", exact: true })
    .click();
  await expect.poll(() => page.evaluate("window.agent.plays")).toBe(3);
  await page.evaluate("window.agent.finish()");
  await turn(page, "Sim");
  await expect(page.locator('[data-testid="lia-answer"]').last()).toContainText(
    "Não há uma ação",
  );
  await page.evaluate(() => {
    const s = (window as any).agent;
    s.hold = true;
    s.nextAction = { type: "request_contact", target: null, value: null };
    s.turn("Peça contato");
  });
  await expect
    .poll(() => page.evaluate("typeof window.agent.release"))
    .toBe("function");
  await page
    .getByRole("button", { name: "Encerrar conversa", exact: true })
    .click();
  await page.evaluate("window.agent.release()");
  await expect(page.getByTestId("lia-action-confirmation")).toHaveCount(0);
  await expect(page.getByTestId("voice-conversation")).toHaveCount(0);
});

test("button confirmation works during playback and keeps the chosen mute state", async ({
  page,
}) => {
  await start(page);
  await turn(page, "Peça contato", action("request_contact"));
  await page
    .getByRole("button", { name: "Silenciar microfone", exact: true })
    .click();
  const plays = await page.evaluate<number>("window.agent.plays");
  await page
    .getByRole("button", { name: "Sim, confirmar", exact: true })
    .click();
  await expect.poll(() => page.evaluate("window.agent.plays")).toBe(plays + 1);
  await expect(page).toHaveURL(/#requests$/);
  await expect(page.locator(".request-card")).toHaveCount(1);
  await expect(page.getByTestId("lia-call-dock")).toHaveAttribute(
    "data-muted",
    "true",
  );
  await page
    .getByRole("button", { name: "Encerrar conversa", exact: true })
    .click();
});

test('manually opening details during an assisted call keeps microphone controls reachable', async({page})=>{
  await start(page);
  await turn(page,'Abra minha agenda',action('navigate','agenda'));
  await page.getByRole('button',{name:'Ver detalhes',exact:false}).first().click();
  const sheet=page.getByRole('dialog',{name:'Seu encontro'});
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(el=>el.matches(':modal'))).toBe(false);
  await page.getByRole('button',{name:'Silenciar microfone',exact:true}).click();
  await expect(page.getByTestId('lia-call-dock')).toHaveAttribute('data-muted','true');
  await page.getByRole('button',{name:'Encerrar conversa',exact:true}).click();
});

for (const viewport of [{width:360,height:640},{width:844,height:390}]) {
  test(`compact call and confirmation remain operable at 200 percent in ${viewport.width}x${viewport.height}`,async({page})=>{
    await page.setViewportSize(viewport);
    await start(page);
    await turn(page,'Abra minha agenda',action('navigate','agenda'));
    await turn(page,'Aumente as letras',action('set_text_scale',null,'2'));
    await turn(page,'Peça contato',action('request_contact'));
    for(const name of ['Voltar à conversa','Silenciar microfone','Encerrar conversa']){
      const control=page.getByRole('button',{name,exact:true});
      await expect(control).toBeInViewport({ratio:1});
      const box=await control.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(48);expect(box!.height).toBeGreaterThanOrEqual(48);
    }
    const confirm=page.getByRole('button',{name:'Sim, confirmar',exact:true});
    await confirm.scrollIntoViewIfNeeded();
    await page.screenshot({path:`../output/lia-v08/dock-${viewport.width}-200.png`});
    await confirm.click();
    await expect(page).toHaveURL(/#requests$/);
    await page.getByRole('button',{name:'Encerrar conversa',exact:true}).click();
  });
}
