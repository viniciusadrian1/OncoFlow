import type { DemoContext } from "../../shared/contracts";
import { personas } from "../demo/fixtures";

let current: DemoContext | undefined;
let generation = 0;
const cleanupListeners = new Set<() => void>();

export function createSession(personaId: string): DemoContext {
  if (!personas.some((persona) => persona.id === personaId)) {
    throw new Error("Perfil fictício desconhecido");
  }
  return rotateSession(personaId);
}

/** Identity comes from a paired server session, never from an AI proposal. */
export function createConnectedSession(patientId: string): DemoContext {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(patientId)) {
    throw new Error("Identificador de paciente inválido");
  }
  return rotateSession(patientId);
}

function rotateSession(personaId: string): DemoContext {
  generation += 1;
  current = {
    sessionId:
      globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now()}-${generation}`,
    epoch: generation,
    personaId,
  };
  for (const cleanup of cleanupListeners) {
    // A cancelled consumer cannot prevent other session resources from clearing.
    try {
      cleanup();
    } catch {
      /* Best-effort cancellation; old epoch is already invalid. */
    }
  }
  return { ...current };
}

export function resetSession(): DemoContext {
  const previous = current?.personaId;
  return createSession(
    personas.some((p) => p.id === previous) ? previous! : "marina",
  );
}

export function getSession(): DemoContext {
  return current ? { ...current } : createSession("marina");
}

export function isCurrent(ctx: DemoContext): boolean {
  return (
    !!current &&
    ctx.sessionId === current.sessionId &&
    ctx.epoch === current.epoch &&
    ctx.personaId === current.personaId
  );
}

export function registerSessionCleanup(cleanup: () => void): () => void {
  cleanupListeners.add(cleanup);
  return () => {
    cleanupListeners.delete(cleanup);
  };
}
