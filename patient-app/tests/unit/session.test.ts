import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSession,
  createConnectedSession,
  getSession,
  isCurrent,
  registerSessionCleanup,
  resetSession,
} from "../../src/app/session";

describe("demo sessions", () => {
  beforeEach(() => {
    createSession("marina");
  });
  it("binds a server patient to a new epoch and resets safely to an independent profile", () => {
    const demo = getSession();
    const connected = createConnectedSession("pac-maria");
    expect(isCurrent(demo)).toBe(false);
    expect(isCurrent(connected)).toBe(true);
    expect(connected.personaId).toBe("pac-maria");
    const reset = resetSession();
    expect(reset.personaId).toBe("marina");
    expect(isCurrent(connected)).toBe(false);
  });
  it.each(["", "../patient", "a/b", "a\nb", "a".repeat(129)])(
    "rejects an invalid server identity: %s",
    (id) => {
      const previous = getSession();
      expect(() => createConnectedSession(id)).toThrow();
      expect(isCurrent(previous)).toBe(true);
    },
  );

  it("invalidates outstanding work after resetting the same persona", () => {
    const previous = getSession();
    const next = resetSession();
    expect(next.personaId).toBe("marina");
    expect(next.sessionId).not.toBe(previous.sessionId);
    expect(next.epoch).toBeGreaterThan(previous.epoch);
    expect(isCurrent(previous)).toBe(false);
    expect(isCurrent(next)).toBe(true);
  });

  it("invalidates the old context when changing personas", () => {
    const previous = getSession();
    const next = createSession("joao");
    expect(next.personaId).toBe("joao");
    expect(isCurrent(previous)).toBe(false);
    expect(isCurrent({ ...next, personaId: "marina" })).toBe(false);
  });

  it("rejects unknown personas without replacing the active session", () => {
    const previous = getSession();
    expect(() => createSession("patient-real")).toThrow(
      "Perfil fictício desconhecido",
    );
    expect(isCurrent(previous)).toBe(true);
  });

  it("cleans up session work when resetting and can remove a listener", () => {
    const cleanup = vi.fn();
    const unsubscribe = registerSessionCleanup(cleanup);
    resetSession();
    expect(cleanup).toHaveBeenCalledTimes(1);
    unsubscribe();
    resetSession();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("returns a copy so consumers cannot mutate the active context", () => {
    const context = getSession();
    context.personaId = "joao";
    expect(getSession().personaId).toBe("marina");
    expect(isCurrent(context)).toBe(false);
  });
});
