import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appointments,
  documents,
  journey,
  personas,
} from "../../src/demo/fixtures";
import {
  localizeAppointment,
  localizeDocument,
  localizeJourney,
  localizePersona,
} from "../../src/i18n/content";
import { formatDate } from "../../src/i18n/date";

describe("patient app localization", () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal("document", { documentElement: { lang: "" } });
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to Portuguese and restores the persisted English selection after reload", async () => {
    const first = await import("../../src/i18n");
    expect(first.getLocale()).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    first.setLocale("en-US");
    expect(storage.get("oncoflow-locale")).toBe("en-US");
    expect(document.documentElement.lang).toBe("en-US");
    vi.resetModules();
    const reloaded = await import("../../src/i18n");
    expect(reloaded.getLocale()).toBe("en-US");
    expect(reloaded.translate("Olá, {name}", { name: "Marina" })).toBe(
      "Hello, Marina",
    );
    expect(reloaded.translate("Com dor")).toBe("In pain");
    reloaded.setLocale("pt-BR");
    expect(reloaded.translate("Olá, {name}", { name: "Marina" })).toBe(
      "Olá, Marina",
    );
  });

  it("keeps an in-memory selection when device storage is unavailable and supports registered strings", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
    });
    const i18n = await import("../../src/i18n");
    i18n.setLocale("en-US");
    i18n.registerTranslations("en-US", {
      "Exemplo {count}": "Example {count}",
    });
    expect(i18n.getLocale()).toBe("en-US");
    expect(i18n.translate("Exemplo {count}", { count: 3 })).toBe("Example 3");
    expect(i18n.translate("Texto sem tradução")).toBe("Texto sem tradução");
    expect(i18n.translate(" Início ")).toBe(" Home ");
  });

  it("formats both languages in the fixed Brazilian demo timezone", () => {
    const beforeMidnightInBrazil = "2026-11-03T01:00:00Z";
    expect(formatDate(beforeMidnightInBrazil, undefined, "pt-BR")).toBe(
      "02 de novembro",
    );
    expect(formatDate(beforeMidnightInBrazil, undefined, "en-US")).toBe(
      "November 02",
    );
    expect(
      formatDate(
        appointments[0]!.startsAt,
        { hour: "numeric", minute: "2-digit" },
        "en-US",
      ),
    ).toBe("9:30 AM");
  });

  it("localizes every fixture while preserving identifiers, dates and canonical Portuguese content", () => {
    const original = JSON.stringify({
      personas,
      appointments,
      journey,
      documents,
    });
    for (const item of personas) {
      const english = localizePersona(item, "en-US");
      expect(english.id).toBe(item.id);
      expect(english.ageLabel).toContain("years old");
      expect(localizePersona(english, "pt-BR")).toEqual(item);
    }
    for (const item of appointments) {
      const english = localizeAppointment(item, "en-US");
      expect(english.title).not.toBe(item.title);
      expect(english.startsAt).toBe(item.startsAt);
      expect(english.id).toBe(item.id);
      expect(english.status).toBe(item.status);
      expect(localizeAppointment(english, "pt-BR")).toEqual(item);
    }
    for (const item of journey) {
      const english = localizeJourney(item, "en-US");
      expect(english.title).not.toBe(item.title);
      expect(english.id).toBe(item.id);
      expect(english.status).toBe(item.status);
      expect(localizeJourney(english, "pt-BR")).toEqual(item);
    }
    for (const item of documents) {
      const english = localizeDocument(item, "en-US");
      expect(english.title).not.toBe(item.title);
      expect(english.body[0]).toContain("FICTIONAL");
      expect(english.approvedContentId).toBe(item.approvedContentId);
      expect(localizeDocument(english, "pt-BR")).toEqual(item);
    }
    expect(JSON.stringify({ personas, appointments, journey, documents })).toBe(
      original,
    );
  });
});
