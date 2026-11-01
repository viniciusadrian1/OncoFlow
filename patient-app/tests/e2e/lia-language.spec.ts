import { test, expect, type Page } from "@playwright/test";
import type { LiaAction } from "../../shared/liaActions";

async function prepareEnglishVoice(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("oncoflow-locale", "en-US");
    (window as any).englishVoice = {
      starts: 0,
      closes: 0,
      plays: 0,
      chats: [],
      spoken: [],
      nextAction: null,
      hold: false,
    };
  });
  await page.route("**/src/adapters/liaProvider.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
      export async function providerStatus(){return {configured:true}};
      export async function cancelProvider(){};
      export async function createTranscriptionSession(){throw new Error('fixture only')};
      export async function chatWithLia(input){const s=window.englishVoice;s.chats.push(input);const result={text:'Original model output',intent:'other',action:s.nextAction};if(s.hold)return new Promise(resolve=>s.release=()=>resolve(result));return result;}
      export async function synthesizeSpeech(text){window.englishVoice.spoken.push(text);return new Blob(['fixture'],{type:'audio/mpeg'})};
      export async function transcribeAudio(){return {text:'Original transcript'}};
    `,
    }),
  );
  await page.route("**/src/features/voice/realtimeTranscription.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
      export async function connectRealtimeInput(handlers,signal){const s=window.englishVoice;s.starts++;let closed=false;const close=()=>{if(!closed){closed=true;s.closes++}};signal.addEventListener('abort',close,{once:true});s.turn=text=>{handlers.onSpeechStart();handlers.onPartial(text);handlers.onSpeechEnd();handlers.onTranscript(text)};return {close,setMuted(){},finishTurn(){handlers.onSpeechEnd()}};}
    `,
    }),
  );
  await page.route("**/src/features/voice/playback.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
      export function createPlaybackSession(blob,options){let resolve=()=>{};const s=window.englishVoice;return {play(){s.plays++;options.onStarted?.();return new Promise(r=>{resolve=r;s.finish=r;options.signal?.addEventListener('abort',r,{once:true})})},stop(){resolve()}};}
    `,
    }),
  );
  await page.route("**/src/features/voice/capture.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "export async function cancelCapture(){};export async function startCapture(){throw new Error('not used')};export async function stopCapture(){throw new Error('not used')};",
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo", exact: true }).click();
  await page
    .getByRole("button", { name: /Talk to Lia Say what you need to do/ })
    .click();
  await page
    .getByRole("button", { name: "I understand, enable and chat", exact: true })
    .click();
  await expect.poll(() => page.evaluate("window.englishVoice.plays")).toBe(1);
  await page.evaluate("window.englishVoice.finish()");
  await expect(page.getByTestId("voice-conversation")).toHaveAttribute(
    "data-stage",
    "listening",
  );
}

async function turn(page: Page, text: string, action: LiaAction | null = null) {
  const plays = await page.evaluate<number>("window.englishVoice.plays");
  await page.evaluate(
    ({ text, action }) => {
      (window as any).englishVoice.nextAction = action;
      (window as any).englishVoice.turn(text);
    },
    { text, action },
  );
  await expect
    .poll(() => page.evaluate<number>("window.englishVoice.plays"))
    .toBe(plays + 1);
  await page.evaluate("window.englishVoice.finish()");
}

test("English one-tap voice greets, confirms locally and records a canonical feeling", async ({
  page,
}) => {
  await prepareEnglishVoice(page);
  expect(await page.evaluate("window.englishVoice.spoken[0]")).toMatch(
    /^Hi, Marina\. I'm Lia/,
  );
  await expect(
    page.getByRole("button", { name: "End conversation", exact: true }),
  ).toBeVisible();
  await turn(page, "Record that I am tired", {
    type: "record_wellbeing",
    target: null,
    value: "Cansado(a)",
  });
  await expect(page.getByTestId("lia-action-confirmation")).toContainText(
    "May I record “Tired”",
  );
  await expect(
    page.getByRole("button", { name: "Yes, confirm", exact: true }),
  ).toBeVisible();
  await turn(page, "Yes, confirm");
  await expect(page).toHaveURL(/#checkin$/);
  await expect(page.locator(".saved-mood")).toContainText("Tired");
  expect(await page.evaluate("window.englishVoice.chats.length")).toBe(1);
  expect(await page.evaluate("window.englishVoice.chats[0].locale")).toBe(
    "en-US",
  );
  expect(
    await page.evaluate(
      "JSON.parse(window.englishVoice.chats[0].context).locale",
    ),
  ).toBe("en-US");
  expect(await page.evaluate("window.englishVoice.spoken.at(-1)")).toContain(
    "I recorded Tired",
  );
  await page
    .getByRole("button", { name: "End conversation", exact: true })
    .click();
  expect(await page.evaluate("window.englishVoice.starts")).toBe(1);
});

test("changing language through Profile ends voice and blocks a late action and speech", async ({
  page,
}) => {
  await prepareEnglishVoice(page);
  await turn(page, "Open my profile", {
    type: "navigate",
    target: "profile",
    value: null,
  });
  await expect(page.getByTestId("lia-call-dock")).toBeVisible();
  await page.evaluate(() => {
    const state = (window as any).englishVoice;
    state.hold = true;
    state.nextAction = { type: "set_text_scale", target: null, value: "2" };
    state.turn("Set the text to 200 percent");
  });
  await expect
    .poll(() => page.evaluate("window.englishVoice.chats.length"))
    .toBe(2);
  const plays = await page.evaluate<number>("window.englishVoice.plays");
  await page.locator("#app-language").selectOption("pt-BR");
  await expect(page.getByTestId("lia-call-dock")).toHaveCount(0);
  await page.evaluate("window.englishVoice.release()");
  await expect(page.locator("#text-size")).toHaveValue("1");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  expect(await page.evaluate("window.englishVoice.plays")).toBe(plays);
  expect(await page.evaluate("window.englishVoice.closes")).toBe(1);
});
