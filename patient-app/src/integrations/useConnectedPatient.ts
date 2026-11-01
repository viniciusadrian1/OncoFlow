import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  emptyHospitalView,
  pairHospital,
  type HospitalConnection,
} from "./hospital/connection";
import { Capacitor } from "@capacitor/core";
import { discoverDemoService, type DemoService } from "./hospital/discovery";
import { startDemoHospital, type DemoPatient } from "./hospital/demoAccess";

const noSubscribe = () => () => {};
const emptySnapshot = () => emptyHospitalView;

export function useConnectedPatient() {
  const [session, setSession] = useState<HospitalConnection | null>(null);
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState(false);
  const [autoError, setAutoError] = useState(false);
  const [demoPatients, setDemoPatients] = useState<DemoPatient[]>([]);
  const demoService = useRef<DemoService | null>(null);
  const current = useRef<HospitalConnection | null>(null);
  const attempt = useRef<AbortController | null>(null);
  const view = useSyncExternalStore(
    session?.subscribe ?? noSubscribe,
    session?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  const disconnect = useCallback(() => {
    attempt.current?.abort();
    attempt.current = null;
    current.current?.disconnect();
    current.current = null;
    setSession(null);
    setPairing(false);
    setPairError(false);
    setAutoError(false);
    setDemoPatients([]);
    demoService.current = null;
  }, []);
  const connect = useCallback(
    async (origin: string, code: string, allowLocalDemoHttp: boolean) => {
      disconnect();
      const controller = new AbortController();
      attempt.current = controller;
      setPairing(true);
      try {
        const paired = await pairHospital({
          origin,
          code,
          allowLocalDemoHttp,
          signal: controller.signal,
        });
        if (controller.signal.aborted || attempt.current !== controller) {
          paired.disconnect();
          return null;
        }
        current.current = paired;
        setSession(paired);
        setPairError(false);
        void paired.refresh().catch(() => {});
        return paired;
      } catch {
        if (!controller.signal.aborted && attempt.current === controller)
          setPairError(true);
        return null;
      } finally {
        if (attempt.current === controller) {
          attempt.current = null;
          setPairing(false);
        }
      }
    },
    [disconnect],
  );
  const connectAutomatically = useCallback(
    async (patientId?: string) => {
      const knownService = patientId ? demoService.current : null;
      disconnect();
      const controller = new AbortController();
      attempt.current = controller;
      const timer = window.setTimeout(() => controller.abort(), 20000);
      setPairing(true);
      try {
        let storage: Storage | undefined;
        try {
          storage = globalThis.localStorage;
        } catch {
          /* Public URL caching is optional. */
        }
        const service =
          knownService ??
          (await discoverDemoService({
            native: Capacitor.isNativePlatform(),
            webOrigin: window.location.origin,
            storage,
            signal: controller.signal,
          }));
        const result = await startDemoHospital({
          service,
          patientId,
          signal: controller.signal,
        });
        if (controller.signal.aborted || attempt.current !== controller) {
          result.connection.disconnect();
          return null;
        }
        demoService.current = service;
        setDemoPatients(result.patients);
        current.current = result.connection;
        setSession(result.connection);
        setAutoError(false);
        void result.connection.refresh().catch(() => {});
        return result.connection;
      } catch {
        if (attempt.current === controller) setAutoError(true);
        return null;
      } finally {
        clearTimeout(timer);
        if (attempt.current === controller) {
          attempt.current = null;
          setPairing(false);
        }
      }
    },
    [disconnect],
  );
  useEffect(() => {
    if (!session) return;
    const refresh = () => {
      void session.refresh().catch(() => {});
    };
    const timer = window.setInterval(refresh, 2000);
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [session]);
  useEffect(
    () => () => {
      attempt.current?.abort();
      attempt.current = null;
      current.current?.disconnect();
      current.current = null;
      demoService.current = null;
    },
    [],
  );
  return {
    session,
    view,
    pairing,
    pairError,
    autoError,
    demoPatients,
    connect,
    connectAutomatically,
    disconnect,
  };
}
