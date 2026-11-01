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

const noSubscribe = () => () => {};
const emptySnapshot = () => emptyHospitalView;

export function useConnectedPatient() {
  const [session, setSession] = useState<HospitalConnection | null>(null);
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState(false);
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
        void paired.refresh();
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
      current.current?.disconnect();
    },
    [],
  );
  return { session, view, pairing, pairError, connect, disconnect };
}
