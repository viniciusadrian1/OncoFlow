import type { Page } from "@playwright/test";

export async function mockConnectedAgent(
  page: Page,
  configured = true,
  ttsAvailable = true,
) {
  await page.addInitScript(() => {
    localStorage.setItem("oncoflow-lia-consent-v1", "accepted");
    const state: any = { chats: [], plays: 0 };
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
    export async function providerStatus(){return {configured:${configured}}};
    export async function cancelProvider(){};
    export async function createTranscriptionSession(){throw new Error('Mock voice transport only')};
    export async function chatWithLia(input){window.agent.chats.push(input);return {text:'Posso explicar os termos do seu cadastro e orientar o contato com a equipe.',intent:'other',action:null}};
    export async function synthesizeSpeech(){if(!${ttsAvailable})throw new Error('O limite ou saldo do serviço de IA foi atingido. Tente mais tarde.');return new Blob(['fixture'],{type:'audio/mpeg'})};
    export async function transcribeAudio(){return {text:'Estou com febre e vomitando'}};
  `,
    }),
  );
  await page.route("**/src/features/voice/realtimeTranscription.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    export async function connectRealtimeInput(h,signal){const s=window.agent;s.turn=text=>{h.onSpeechStart();h.onPartial(text);h.onSpeechEnd();h.onTranscript(text)};return {close(){},setMuted(){},finishTurn(){h.onSpeechEnd()}};}
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
