import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  addListener: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => native,
}));
import { setLocale } from "../../src/i18n";
import {
  cancelCapture,
  startCapture,
  stopCapture,
} from "../../src/features/voice/capture";

beforeEach(() => {
  vi.clearAllMocks();
  native.start.mockResolvedValue(undefined);
  native.cancel.mockResolvedValue(undefined);
  native.addListener.mockResolvedValue({ remove: async () => {} });
  setLocale("en-US");
});
afterEach(async () => {
  await cancelCapture();
  setLocale("pt-BR");
});

describe("English native recorder errors", () => {
  it.each([
    [
      "Microfone não autorizado. Você pode escrever sua mensagem.",
      "Microphone access isn't allowed. You can type your message.",
    ],
    [
      "Não foi possível iniciar o microfone. Tente novamente.",
      "I couldn't start the microphone. Try again.",
    ],
    ["Identificador de gravação inválido.", "Invalid recording identifier."],
  ])(
    "localizes a rejected native recording start: %s",
    async (message, expected) => {
      native.start.mockRejectedValueOnce(
        Object.assign(new Error(message), { code: "MICROPHONE_DENIED" }),
      );
      await expect(startCapture(vi.fn())).rejects.toMatchObject({
        message: expected,
        code: "MICROPHONE_DENIED",
      });
    },
  );
  it("localizes an empty-audio native stop without masking its code", async () => {
    native.stop.mockRejectedValueOnce(
      Object.assign(
        new Error(
          "Não foi possível obter áudio. Fale por mais tempo e tente novamente.",
        ),
        { code: "CAPTURE_EMPTY" },
      ),
    );
    await startCapture(vi.fn());
    await expect(stopCapture()).rejects.toMatchObject({
      message: "I couldn't capture audio. Speak for longer and try again.",
      code: "CAPTURE_EMPTY",
    });
  });
});
