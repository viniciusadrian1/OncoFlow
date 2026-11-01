import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  Angry,
  ArrowRight,
  Ellipsis,
  Frown,
  Meh,
  Mic,
  Smile,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Heart,
  House,
  Info,
  MapPin,
  MessageCircle,
  Route,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import type {
  Appointment,
  DemoDocument,
  Preferences,
  Persona,
} from "../../shared/contracts";
import { useI18n } from "../i18n";
import {
  localizeAppointment,
  localizeDocument,
  localizeJourney,
  localizePersona,
} from "../i18n/content";
import { formatDate as date } from "../i18n/date";
import { personas, DEMO_NOTICE } from "../demo/fixtures";
import { createPatientDataPort } from "../adapters/patientData.mock";
import {
  createConnectedSession,
  createSession,
  getSession,
  resetSession,
} from "./session";
import { LiaPage } from "../features/lia/LiaPage";
import { createLiaAppBridge, type ConnectedLiaActions } from "./liaAppBridge";
import type { LiaAppBridge, LiaAppSnapshot } from "../../shared/liaActions";
import { useConnectedPatient } from "../integrations/useConnectedPatient";
import {
  PairHospitalPanel,
  TeamMessages,
} from "../integrations/ConnectedPanels";
import {
  appointmentStatusLabel,
  requestStatusLabel,
} from "../integrations/connectedText";
import { hospitalOrigin } from "../integrations/hospital/connection";

type Page =
  | "home"
  | "journey"
  | "lia"
  | "agenda"
  | "profile"
  | "documents"
  | "requests"
  | "messages"
  | "checkin";
type ModalContent =
  | { type: "appointment"; value: Appointment }
  | { type: "document"; value: DemoDocument }
  | { type: "reschedule"; value: Appointment }
  | { type: "reset" | "help" | "contact" };
type Modal = ModalContent & { assisted?: boolean };
const tabs: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: "home", label: "Início", icon: House },
  { page: "journey", label: "Jornada", icon: Route },
  { page: "lia", label: "Lia", icon: Sparkles },
  { page: "agenda", label: "Agenda", icon: CalendarDays },
  { page: "profile", label: "Perfil", icon: UserRound },
];
const feelings: { label: string; icon: LucideIcon; tone: string }[] = [
  { label: "Bem", icon: Smile, tone: "well" },
  { label: "Cansado(a)", icon: Meh, tone: "tired" },
  { label: "Com dor", icon: Frown, tone: "pain" },
  { label: "Náusea", icon: Frown, tone: "nausea" },
  { label: "Ansioso(a)", icon: Angry, tone: "anxious" },
  { label: "Outro", icon: Ellipsis, tone: "other" },
];
const pageNames: Page[] = [
  ...tabs.map((t) => t.page),
  "documents",
  "requests",
  "checkin",
  "messages",
];
const data = createPatientDataPort();
const initialPreferences: Preferences = {
  explanation: "short",
  speechRate: 1,
  textScale: 1,
};
function loadPreferences(): Preferences {
  try {
    const raw = JSON.parse(
      localStorage.getItem("oncoflow-preferences") || "{}",
    );
    return {
      explanation:
        raw.explanation === "step_by_step" ? "step_by_step" : "short",
      speechRate: [0.8, 1, 1.2].includes(raw.speechRate) ? raw.speechRate : 1,
      textScale: [1, 1.25, 1.5, 2].includes(raw.textScale) ? raw.textScale : 1,
    };
  } catch {
    return initialPreferences;
  }
}
function currentPage(): Page {
  const name = location.hash.slice(1) as Page;
  return pageNames.includes(name) ? name : "home";
}
const time = (iso: string) => date(iso, { hour: "2-digit", minute: "2-digit" });

function Orb({ small = false }: { small?: boolean }) {
  return (
    <div
      className={"orb brand-orb " + (small ? "orb-small" : "")}
      aria-hidden="true"
    >
      <img src="./visual/lia-orb.svg" alt="" width={148} height={148} />
    </div>
  );
}
function Tag({ children, kind = "" }: { children: ReactNode; kind?: string }) {
  return <span className={`tag ${kind}`}>{children}</span>;
}
function PageTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="page-title">
      <p className="eyebrow">{eyebrow}</p>
      <h1 tabIndex={-1}>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}
function RowButton({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick(): void;
}) {
  return (
    <button className="row-button" onClick={onClick}>
      <span className="icon-tile">
        <Icon size={23} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <ChevronRight size={20} />
    </button>
  );
}
function LanguageSelector({
  id,
  onSelect,
  disabled = false,
}: {
  id: string;
  onSelect?(locale: "pt-BR" | "en-US"): void;
  disabled?: boolean;
}) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="language-selector">
      <label htmlFor={id}>{t("Idioma do aplicativo")}</label>
      <select
        id={id}
        value={locale}
        disabled={disabled}
        onChange={(event) =>
          (onSelect ?? setLocale)(
            event.target.value === "en-US" ? "en-US" : "pt-BR",
          )
        }
      >
        <option value="pt-BR" lang="pt-BR">
          Português (Brasil)
        </option>
        <option value="en-US" lang="en-US">
          English (United States)
        </option>
      </select>
    </div>
  );
}
function Sheet({
  children,
  title,
  onClose,
  assisted = false,
}: {
  children: ReactNode;
  title: string;
  onClose(): void;
  assisted?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const element = ref.current;
    if (assisted) element?.show();
    else element?.showModal();
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [assisted]);
  return (
    <dialog
      ref={ref}
      className={`sheet${assisted ? " assisted-sheet" : ""}`}
      aria-labelledby="sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-inner">
        <div className="sheet-heading">
          <h2 id="sheet-title">{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("Fechar")}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function App() {
  const { locale, t, setLocale } = useI18n();
  const connected = useConnectedPatient();
  const remote = connected.view;
  const hospital = connected.session;
  const currentHospital = useRef(hospital);
  currentHospital.current = hospital;
  const connectedActions = useRef<ConnectedLiaActions | null>(null);
  const operationKeys = useRef(new Map<string, string>());
  const [context, setContext] = useState(getSession);
  const [entered, setEntered] = useState(false);
  const [page, setPage] = useState<Page>(currentPage);
  const [prefs, setPrefs] = useState(loadPreferences);
  const [modal, setModal] = useState<Modal | null>(null);
  const [notice, setNotice] = useState("");
  const [mood, setMood] = useState("");
  const [savedMood, setSavedMood] = useState("");
  const [liaStartRequest, setLiaStartRequest] = useState(0);
  const [liaAssisted, setLiaAssisted] = useState(false);
  const onCallActiveChange = useCallback((active: boolean) => {
    if (!active) setLiaAssisted(false);
  }, []);
  const main = useRef<HTMLElement>(null);
  const localizedPersonas = personas.map((item) =>
    localizePersona(item, locale),
  );
  const displayName =
    remote.summary?.displayName ?? hospital?.displayName ?? "";
  const persona: Persona = hospital
    ? {
        id: hospital.scope.patientId,
        name: displayName,
        firstName: remote.summary?.preferredName ?? displayName.split(" ")[0],
        initials: displayName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0])
          .join(""),
        ageLabel: "",
        journeyLabel: remote.summary?.careTeamLabel ?? "",
        description: "",
        accent: "teal",
        simulated: true,
      }
    : (localizedPersonas.find((p) => p.id === context.personaId) ??
      localizedPersonas[0]);
  const displayedModal: Modal | null = hospital
    ? (() => {
        if (modal?.type === "document") {
          const item = remote.documents.find(
            (document) => document.id === modal.value.id,
          );
          return item
            ? {
                ...modal,
                value: {
                  ...item,
                  personaId: hospital.scope.patientId,
                  approvedContentId: `hospital-${item.id}`,
                  simulated: true as const,
                },
              }
            : null;
        }
        if (modal?.type === "appointment" || modal?.type === "reschedule") {
          const item = remote.appointments.find(
            (appointment) => appointment.id === modal.value.id,
          );
          return item
            ? {
                ...modal,
                value: {
                  ...item,
                  personaId: hospital.scope.patientId,
                  category: t("Consulta"),
                  description: item.preparation ?? "",
                  simulated: true as const,
                },
              }
            : null;
        }
        return modal;
      })()
    : modal?.type === "document"
      ? { ...modal, value: localizeDocument(modal.value, locale) }
      : modal?.type === "appointment" || modal?.type === "reschedule"
        ? { ...modal, value: localizeAppointment(modal.value, locale) }
        : modal;
  const appointments: Appointment[] = hospital
      ? remote.appointments.map((item) => ({
          id: item.id,
          personaId: hospital.scope.patientId,
          startsAt: item.startsAt,
          title: item.title,
          locationLabel: item.locationLabel,
          professionalLabel: item.professionalLabel,
          category: t("Consulta"),
          description: item.preparation ?? "",
          status: item.status,
          simulated: true,
        }))
      : data
          .appointments(context)
          .map((item) => localizeAppointment(item, locale)),
    journey: LiaAppSnapshot["journey"] = hospital
      ? remote.journey.map((item) => ({
          ...item,
          personaId: hospital.scope.patientId,
          simulated: true,
        }))
      : data.journey(context).map((item) => localizeJourney(item, locale)),
    documents: DemoDocument[] = hospital
      ? remote.documents.map((item) => ({
          ...item,
          personaId: hospital.scope.patientId,
          approvedContentId: `hospital-${item.id}`,
          simulated: true,
        }))
      : data.documents(context).map((item) => localizeDocument(item, locale)),
    requests: LiaAppSnapshot["requests"] = hospital
      ? remote.requests.map((item) => ({ ...item, context }))
      : data.requests(context);
  const next = appointments.find(
    (a) => a.status === "confirmed" || a.status === "scheduled",
  );
  const completed = journey.filter((e) => e.status === "completed").length;
  const appSnapshot = useRef<LiaAppSnapshot>({
    context,
    persona,
    page,
    prefs,
    appointments,
    journey,
    documents,
    requests,
    savedMood,
    careContext: hospital ? remote.summary?.careContext : undefined,
    messages: hospital
      ? remote.messages.map(({ id, authorLabel, text, createdAt, role }) => ({
          id,
          authorLabel,
          text,
          createdAt,
          role,
        }))
      : undefined,
    ...(hospital
      ? { connected: { status: remote.status, asOf: remote.asOf } }
      : {}),
  });
  appSnapshot.current = {
    context,
    persona,
    page,
    prefs,
    appointments,
    journey,
    documents,
    requests,
    savedMood,
    careContext: hospital ? remote.summary?.careContext : undefined,
    messages: hospital
      ? remote.messages.map(({ id, authorLabel, text, createdAt, role }) => ({
          id,
          authorLabel,
          text,
          createdAt,
          role,
        }))
      : undefined,
    ...(hospital
      ? { connected: { status: remote.status, asOf: remote.asOf } }
      : {}),
  };
  const liaBridge = useRef<LiaAppBridge | null>(null);
  if (!liaBridge.current)
    liaBridge.current = createLiaAppBridge({
      data,
      getSnapshot: () => {
        const current = appSnapshot.current;
        if (current.connected) return { ...current };
        return {
          ...current,
          appointments: data
            .appointments(current.context)
            .map((item) => localizeAppointment(item)),
          journey: data
            .journey(current.context)
            .map((item) => localizeJourney(item)),
          documents: data
            .documents(current.context)
            .map((item) => localizeDocument(item)),
          requests: data.requests(current.context),
        };
      },
      navigate: (to) => navigate(to, true),
      openAppointment: (value) =>
        setModal({ type: "appointment", value, assisted: true }),
      openDocument: (value) =>
        setModal({ type: "document", value, assisted: true }),
      saveMood: (value) => {
        appSnapshot.current.savedMood = value;
        setMood(value);
        setSavedMood(value);
      },
      updatePreferences: (value) => {
        appSnapshot.current.prefs = value;
        setPrefs(value);
      },
      connected: () => connectedActions.current,
    });

  async function performConnected<T>(
    signature: string,
    write: (idempotencyKey: string) => Promise<T>,
    operationId?: string,
    retainKey = false,
  ) {
    const current = hospital;
    if (!current || currentHospital.current !== current)
      throw new Error("Disconnected");
    let key = operationKeys.current.get(signature);
    if (!key) {
      key =
        operationId && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(operationId)
          ? operationId
          : crypto.randomUUID();
      operationKeys.current.set(signature, key);
    }
    const result = await write(key);
    if (currentHospital.current !== current) throw new Error("Disconnected");
    if (!retainKey) operationKeys.current.delete(signature);
    return result;
  }
  connectedActions.current = hospital
    ? {
        reportSymptoms: (input, signal) =>
          performConnected(
            `symptoms-${input.operationId}`,
            (key) =>
              hospital.reportSymptoms(
                {
                  text: input.text,
                  source: input.source,
                  locale: input.locale,
                  idempotencyKey: key,
                },
                { signal },
              ),
            // Turn IDs restart when the app is reopened. The retained UUID is
            // unique to this connection; retries reuse it, new sessions do not.
            undefined,
            true,
          ),
        saveMood: (feeling, id, signal) =>
          performConnected(
            `wellbeing-${feeling}`,
            (key) =>
              hospital.recordWellbeing(
                { feeling, idempotencyKey: key },
                { signal },
              ),
            id,
          ),
        submitRequest: (type, appointmentId, id, signal) =>
          performConnected(
            `request-${type}-${appointmentId ?? "team"}`,
            (key) =>
              hospital.submitRequest(
                {
                  type,
                  ...(appointmentId ? { appointmentId } : {}),
                  idempotencyKey: key,
                },
                { signal },
              ),
            id,
          ),
        updatePreferences: (preferences, id, signal) =>
          performConnected(
            `preferences-${JSON.stringify(preferences)}-${locale}`,
            (key) =>
              hospital.updatePreferences(
                { ...preferences, locale, idempotencyKey: key },
                { signal },
              ),
            id,
          ),
      }
    : null;

  async function pair(origin: string, code: string, localDemo: boolean) {
    const paired = await connected.connect(origin, code, localDemo);
    if (!paired) return;
    operationKeys.current.clear();
    setContext(createConnectedSession(paired.scope.patientId));
    setMood("");
    setSavedMood("");
    setNotice("");
    setModal(null);
    setLiaStartRequest(0);
    setLiaAssisted(false);
    try {
      localStorage.setItem(
        "oncoflow-hospital-origin",
        hospitalOrigin(origin, localDemo),
      );
    } catch {
      /* Address persistence is optional. Credentials are never stored. */
    }
    setEntered(true);
    navigate("home");
  }
  function disconnectHospital() {
    currentHospital.current = null;
    connected.disconnect();
    operationKeys.current.clear();
    choosePersona("marina");
    setEntered(false);
    navigate("home");
  }
  async function changePreferences(value: Preferences, nextLocale = locale) {
    if (!hospital) {
      setPrefs(value);
      if (nextLocale !== locale) setLocale(nextLocale);
      return;
    }
    try {
      await performConnected(
        `preferences-${JSON.stringify(value)}-${nextLocale}`,
        (key) =>
          hospital.updatePreferences({
            ...value,
            locale: nextLocale,
            idempotencyKey: key,
          }),
      );
      if (currentHospital.current === hospital)
        setNotice("Preferências confirmadas pelo hospital.");
    } catch {
      if (currentHospital.current === hospital)
        setNotice(
          "Não foi possível confirmar o envio. Tente a mesma ação novamente; ela não será duplicada.",
        );
    }
  }
  async function saveCheckin() {
    if (!hospital) {
      setSavedMood(mood);
      setNotice(
        "Registro fictício salvo nesta sessão. Nenhuma avaliação clínica ou alerta foi realizado.",
      );
      return;
    }
    try {
      await performConnected(`wellbeing-${mood}`, (key) =>
        hospital.recordWellbeing({ feeling: mood, idempotencyKey: key }),
      );
      if (currentHospital.current === hospital)
        setNotice(
          "Registro confirmado pelo hospital da demonstração. Este registro não é uma avaliação clínica.",
        );
    } catch {
      if (currentHospital.current === hospital)
        setNotice(
          "Não foi possível confirmar o envio. Tente a mesma ação novamente; ela não será duplicada.",
        );
    }
  }

  function navigate(to: Page, assisted = false) {
    setNotice("");
    setModal(null);
    setLiaAssisted(assisted);
    appSnapshot.current.page = to;
    location.hash = to;
    setPage(to);
    window.scrollTo({ top: 0 });
  }
  function startLia() {
    navigate("lia");
    setLiaStartRequest((value) => value + 1);
  }
  function choosePersona(id: string) {
    currentHospital.current = null;
    connected.disconnect();
    operationKeys.current.clear();
    setContext(createSession(id));
    setMood("");
    setSavedMood("");
    setModal(null);
    setNotice("");
    setLiaAssisted(false);
    setLiaStartRequest(0);
  }
  function start() {
    connected.disconnect();
    setEntered(true);
    navigate("home");
  }
  function reset() {
    setContext(resetSession());
    setMood("");
    setSavedMood("");
    setModal(null);
    setLiaAssisted(false);
    setLiaStartRequest(0);
    navigate("home");
    setNotice(
      "Demonstração reiniciada. Seus pedidos e registros foram limpos.",
    );
  }
  async function submitRequest(
    type: "reschedule" | "contact",
    appt?: Appointment,
  ) {
    if (hospital) {
      try {
        await performConnected(`request-${type}-${appt?.id ?? "team"}`, (key) =>
          hospital.submitRequest({
            type,
            ...(appt ? { appointmentId: appt.id } : {}),
            idempotencyKey: key,
          }),
        );
        if (currentHospital.current !== hospital) return;
        setModal(null);
        setNotice(
          "Pedido confirmado pelo hospital da demonstração. Acompanhe o status em Meus pedidos.",
        );
      } catch {
        if (currentHospital.current === hospital)
          setNotice(
            "Não foi possível confirmar o envio. Tente a mesma ação novamente; ela não será duplicada.",
          );
      }
      return;
    }
    data.request(context, {
      type,
      appointmentId: appt?.id,
      idempotencyKey: `${type}:${appt?.id ?? "team"}`,
    });
    setModal(null);
    setNotice(
      type === "reschedule"
        ? "Pedido registrado nesta demonstração. A consulta original não foi alterada."
        : "Pedido de contato registrado apenas nesta demonstração. Nenhuma equipe foi avisada.",
    );
  }
  useEffect(() => {
    const handler = () => {
      setPage(currentPage());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    if (entered) {
      const heading = Array.from(
        main.current?.querySelectorAll<HTMLElement>("h1") ?? [],
      ).find((item) => item.offsetParent !== null);
      heading?.focus({ preventScroll: true });
    }
  }, [page, entered]);
  useEffect(() => {
    if (hospital) return;
    try {
      localStorage.setItem("oncoflow-preferences", JSON.stringify(prefs));
    } catch {
      /* In-memory preferences remain usable. */
    }
  }, [prefs, hospital]);
  useEffect(() => {
    if (!hospital || !remote.preferences) return;
    const {
      explanation,
      speechRate,
      textScale,
      locale: hospitalLocale,
    } = remote.preferences;
    setPrefs({ explanation, speechRate, textScale });
    setLocale(hospitalLocale);
  }, [hospital, remote.preferences, setLocale]);
  useEffect(() => {
    if (hospital) setSavedMood(remote.savedMood);
  }, [hospital, remote.savedMood]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener("backButton", () => {
      const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
      if (dialog) {
        dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
        return;
      }
      if (modal) setModal(null);
      else if (page !== "home") navigate("home");
      else NativeApp.exitApp();
    });
    return () => {
      void listener.then((l) => l.remove());
    };
  }, [modal, page]);

  return (
    <div
      className={`app-shell oncoflow-app ${entered ? "" : "welcome-shell"} ${prefs.textScale >= 1.5 ? "large-text" : ""}`}
      style={{ "--text-scale": prefs.textScale } as React.CSSProperties}
    >
      <header className="brand-header">
        <img src="./brand/logo.svg" alt="OncoFlow AI" />
        {entered ? (
          <button
            className={`avatar ${persona.accent}`}
            onClick={() => navigate("profile")}
            aria-label={t("Perfil de {name}", { name: persona.name })}
          >
            {persona.initials}
          </button>
        ) : (
          <Tag>{t("PRÉVIA DO APP")}</Tag>
        )}
      </header>
      {!entered ? (
        <main className="welcome">
          <div className="welcome-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <Orb />
            <span className="art-chip chip-calendar">
              <CalendarDays size={19} />
              {t(" Tudo no seu tempo ")}
            </span>
            <span className="art-chip chip-heart">
              <Heart size={19} />
              {t(" Cuidado que conecta ")}
            </span>
            <span className="orbit-dot" />
          </div>
          <div className="welcome-copy">
            <p className="eyebrow">{t("CADA ETAPA, CONECTADA")}</p>
            <h1>
              {t("Seu cuidado, ")}
              <br />
              <em>{t("mais perto.")}</em>
            </h1>
            <p>
              {t(
                "Um lugar para organizar sua jornada, encontrar seus próximos passos e se sentir acompanhado. ",
              )}
            </p>
          </div>
          <LanguageSelector id="welcome-language" />
          <PairHospitalPanel
            pairing={connected.pairing}
            error={connected.pairError}
            onConnect={pair}
          />
          <div className="persona-selector">
            <p className="field-label">
              {t("Escolha um perfil fictício para explorar ")}
            </p>
            <div className="persona-options">
              {localizedPersonas.map((p) => (
                <button
                  key={p.id}
                  className={`persona-option ${p.id === context.personaId ? "selected" : ""}`}
                  aria-pressed={p.id === context.personaId}
                  onClick={() => choosePersona(p.id)}
                >
                  <span className={`avatar ${p.accent}`}>{p.initials}</span>
                  <strong>{p.firstName}</strong>
                  <small>{p.ageLabel}</small>
                  {p.id === context.personaId && (
                    <span className="selection-check">
                      <Check size={12} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <button className="primary full" onClick={start}>
            {t("Explorar demonstração ")}
            <ArrowRight size={20} />
          </button>
          <p className="welcome-foot">
            {t("Sem cadastro. Apenas histórias fictícias. ")}
          </p>
          <p className="welcome-foot">{t(DEMO_NOTICE)}</p>
        </main>
      ) : (
        <>
          <main ref={main} className={"content page-" + page} id="main-content">
            {hospital && (
              <section
                className={`hospital-status hospital-connection-status${remote.status === "offline" ? " is-offline" : ""}`}
                aria-label={t("Conexão da demonstração")}
              >
                <strong>
                  {t(
                    remote.status === "loading"
                      ? "Carregando dados do hospital…"
                      : remote.status === "offline"
                        ? "Sem atualização do hospital. Os dados abaixo podem estar desatualizados."
                        : "Demonstração conectada · dados fictícios",
                  )}
                </strong>
                {remote.asOf && (
                  <small>
                    {t("Atualizado em {time}", { time: time(remote.asOf) })}
                  </small>
                )}
                {remote.pending > 0 && (
                  <p role="status">{t("Salvando no hospital…")}</p>
                )}
                {remote.error === "write" && (
                  <p role="alert">
                    {t(
                      "Não foi possível confirmar o envio. Tente a mesma ação novamente; ela não será duplicada.",
                    )}
                  </p>
                )}
                {(remote.status === "offline" ||
                  remote.status === "loading") && (
                  <button
                    className="secondary"
                    onClick={() => void hospital.refresh()}
                  >
                    {t("Tentar novamente")}
                  </button>
                )}
              </section>
            )}
            {notice && (
              <div className="notice" role="status">
                <Check size={20} />
                <span>{t(notice)}</span>
                <button
                  className="icon-button"
                  onClick={() => setNotice("")}
                  aria-label={t("Dispensar mensagem")}
                >
                  <X size={18} />
                </button>
              </div>
            )}
            {page === "home" && (
              <div className="home-screen" data-testid="home-screen">
                <div className="greeting">
                  <h1 tabIndex={-1}>
                    {t("Olá, {name}", { name: persona.firstName })}
                    <span className="hello-dot">{t(".")}</span>
                  </h1>
                  <p>{t("Como podemos ajudar hoje?")}</p>
                </div>
                {next && (
                  <button
                    className="home-appointment"
                    data-testid="home-next-appointment"
                    onClick={() =>
                      setModal({ type: "appointment", value: next })
                    }
                  >
                    <CalendarDays size={30} aria-hidden="true" />
                    <span className="home-appointment-copy">
                      <small>
                        {["Consulta", "Appointment"].includes(next.category)
                          ? t("Sua próxima consulta")
                          : t("Seu próximo encontro")}
                      </small>
                      <strong>
                        {date(next.startsAt, { weekday: "long" })}
                      </strong>
                      <span>
                        {t("{date} às {time}", {
                          date: date(next.startsAt),
                          time: time(next.startsAt),
                        })}
                      </span>
                      <span className="home-appointment-name">
                        {next.title}
                      </span>
                      <span className="home-appointment-place">
                        {next.locationLabel}
                        <ChevronRight size={18} aria-hidden="true" />
                      </span>
                    </span>
                  </button>
                )}
                <div
                  className="home-shortcuts"
                  aria-label={t("Atalhos do seu cuidado")}
                >
                  <button
                    className="home-shortcut"
                    onClick={() => navigate("journey")}
                  >
                    <Route size={30} aria-hidden="true" />
                    <strong>{t("Minha jornada")}</strong>
                  </button>
                  <button
                    className="home-shortcut"
                    onClick={() => navigate("checkin")}
                  >
                    <Heart size={30} aria-hidden="true" />
                    <strong>{t("Como estou")}</strong>
                    {savedMood && <small>{t("Ver meu registro")}</small>}
                  </button>
                  <button
                    className="home-shortcut"
                    onClick={() => navigate("agenda")}
                  >
                    <CalendarDays size={30} aria-hidden="true" />
                    <strong>{t("Minha agenda")}</strong>
                  </button>
                  <button
                    className="home-shortcut"
                    onClick={() => navigate("documents")}
                  >
                    <FileText size={30} aria-hidden="true" />
                    <strong>{t("Meus documentos")}</strong>
                    <small>
                      {t("{count} arquivos fictícios", {
                        count: documents.length,
                      })}
                    </small>
                  </button>
                </div>
                <button className="home-lia-cta" onClick={startLia}>
                  <Orb small />
                  <Mic size={22} aria-hidden="true" />
                  <span>
                    <strong>{t("Falar com a Lia")}</strong>
                    <small>{t("Diga o que precisa fazer")}</small>
                  </span>
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
                <RowButton
                  icon={Bell}
                  title={t("Meus pedidos")}
                  description={
                    requests.length
                      ? t("{count} pedido(s) nesta demonstração", {
                          count: requests.length,
                        })
                      : t("Acompanhe suas solicitações")
                  }
                  onClick={() => navigate("requests")}
                />
                {hospital && (
                  <RowButton
                    icon={MessageCircle}
                    title={t("Mensagens da equipe")}
                    description={t("Conversas com a equipe da demonstração")}
                    onClick={() => navigate("messages")}
                  />
                )}
                <div className="reassurance">
                  <Heart size={16} aria-hidden="true" />
                  <span>{t("Cada etapa do cuidado, conectada.")}</span>
                </div>
              </div>
            )}
            {page === "journey" && (
              <>
                <PageTitle
                  eyebrow={t("UM PASSO DE CADA VEZ")}
                  title={t("Minha jornada")}
                  subtitle={t(
                    "Veja o que já aconteceu e o que vem pela frente.",
                  )}
                />
                <div className="journey-summary card">
                  <span className="icon-tile">
                    <Route />
                  </span>
                  <div>
                    <strong>{persona.journeyLabel}</strong>
                    <p>
                      {t("{count} etapas concluídas neste cenário", {
                        count: completed,
                      })}
                    </p>
                  </div>
                </div>
                <ol className="timeline">
                  {journey.map((item) => (
                    <li key={item.id} className={item.status}>
                      <span className="timeline-dot">
                        {item.status === "completed" ? (
                          <Check size={17} />
                        ) : item.status === "current" ? (
                          <span />
                        ) : null}
                      </span>
                      <div className="timeline-date">
                        {date(item.occurredAt)}
                      </div>
                      <article className="timeline-card">
                        <Tag kind={item.status === "current" ? "green" : ""}>
                          {item.status === "completed"
                            ? t("Concluída")
                            : item.status === "current"
                              ? t("Você está aqui")
                              : t("Próxima etapa")}
                        </Tag>
                        <h2>{item.title}</h2>
                        <p>{item.description}</p>
                        <small>
                          {t(
                            hospital
                              ? "Fonte: painel do hospital da demonstração"
                              : "Fonte: instituição fictícia",
                          )}
                        </small>
                      </article>
                    </li>
                  ))}
                </ol>
                {hospital && !journey.length && remote.status === "ready" && (
                  <p className="empty-state">
                    {t("Nenhuma etapa publicada pela equipe.")}
                  </p>
                )}
                <p className="footnote">
                  {t(
                    "Linha do tempo ilustrativa. Não representa uma recomendação de tratamento. ",
                  )}
                </p>
              </>
            )}
            {page === "agenda" && (
              <>
                <PageTitle
                  eyebrow={t("TEMPO PARA O SEU CUIDADO")}
                  title={t("Minha agenda")}
                  subtitle={t("Seus próximos encontros, em um só lugar.")}
                />
                <div className="month-heading">
                  <CalendarDays size={22} />
                  <h2>
                    {hospital
                      ? appointments[0]
                        ? date(appointments[0].startsAt, {
                            month: "long",
                            year: "numeric",
                          })
                        : t("Minha agenda")
                      : t("Novembro de 2026")}
                  </h2>
                  <Tag>{t("DEMO")}</Tag>
                </div>
                {!hospital && (
                  <div className="week-strip" aria-hidden="true">
                    {(locale === "en-US"
                      ? ["S", "M", "T", "W", "T", "F", "S"]
                      : ["D", "S", "T", "Q", "Q", "S", "S"]
                    ).map((day, i) => (
                      <div
                        className={
                          appointments.some(
                            (a) =>
                              Number(date(a.startsAt, { day: "numeric" })) ===
                              i + 1,
                          )
                            ? "has-event"
                            : ""
                        }
                        key={i}
                      >
                        <span>{day}</span>
                        <strong>{i + 1}</strong>
                        <i />
                      </div>
                    ))}
                  </div>
                )}
                <p className="eyebrow list-eyebrow">
                  {t("PRÓXIMOS ENCONTROS")}
                </p>
                <div className="stack">
                  {appointments.map((item) => (
                    <article className="card agenda-card" key={item.id}>
                      <div className="agenda-card-top">
                        <span className="icon-tile">
                          <CalendarDays />
                        </span>
                        <Tag kind={item.status === "confirmed" ? "green" : ""}>
                          {t(
                            hospital
                              ? appointmentStatusLabel[item.status]
                              : "Confirmada · fictícia",
                          )}
                        </Tag>
                      </div>
                      <h2>{item.title}</h2>
                      <p>{item.professionalLabel}</p>
                      <div className="detail-line">
                        <Clock3 size={18} />
                        <span>
                          {date(item.startsAt)} · {time(item.startsAt)}
                        </span>
                      </div>
                      <div className="detail-line">
                        <MapPin size={18} />
                        <span>{item.locationLabel}</span>
                      </div>
                      <button
                        className="secondary full"
                        onClick={() =>
                          setModal({ type: "appointment", value: item })
                        }
                      >
                        {t("Ver detalhes ")}
                        <ChevronRight size={18} />
                      </button>
                    </article>
                  ))}
                </div>
                {hospital &&
                  !appointments.length &&
                  remote.status === "ready" && (
                    <p className="empty-state">
                      {t("Nenhum encontro publicado pela equipe.")}
                    </p>
                  )}
                <p className="footnote">
                  {t(
                    hospital
                      ? "Dados fornecidos pelo hospital da demonstração. Textos da equipe são exibidos no idioma original."
                      : "Agenda fixa da demonstração · horário de Brasília. ",
                  )}
                </p>
              </>
            )}
            <div hidden={page !== "lia"}>
              <LiaPage
                key={context.sessionId}
                active={page === "lia" || liaAssisted}
                appBridge={liaBridge.current}
                startRequest={liaStartRequest}
                onCallActiveChange={onCallActiveChange}
                onShowApp={() =>
                  navigate(
                    appSnapshot.current.page === "lia"
                      ? "home"
                      : appSnapshot.current.page,
                    true,
                  )
                }
                context={context}
                persona={persona}
                prefs={prefs}
                appointments={appointments}
                journey={journey}
                documents={documents}
                onNavigate={navigate}
                onContact={() => setModal({ type: "contact" })}
              />
            </div>
            {page === "profile" && (
              <>
                <PageTitle
                  eyebrow={t("DO SEU JEITO")}
                  title={t("Meu perfil")}
                  subtitle={t(
                    "Uma experiência que respeita suas preferências.",
                  )}
                />
                <div className="profile-card card">
                  <span className={`avatar large ${persona.accent}`}>
                    {persona.initials}
                  </span>
                  <h2>{persona.name}</h2>
                  <p>
                    {hospital
                      ? t("Demonstração conectada · dados fictícios")
                      : t("{age} · perfil de demonstração", {
                          age: persona.ageLabel,
                        })}
                  </p>
                  <Tag>{t("FICTÍCIO")}</Tag>
                </div>
                {hospital && (
                  <section className="hospital-status hospital-connection-actions">
                    <h2>{t("Conexão da demonstração")}</h2>
                    <p>{t("Conectado ao painel da equipe")}</p>
                    <p>
                      {t(
                        "Relatos de sintomas feitos à Lia são verificados pelo serviço conectado. Sinais identificados são registrados no painel para revisão da equipe, sem garantia de leitura imediata ou avaliação clínica.",
                      )}
                    </p>
                    <p>
                      {t(
                        "Sessão mantida apenas enquanto o app está aberto. Ao reiniciar, use um novo código.",
                      )}
                    </p>
                    <button
                      className="secondary full"
                      onClick={disconnectHospital}
                    >
                      {t("Desconectar")}
                    </button>
                  </section>
                )}
                {hospital && remote.summary?.careContext && (
                  <section
                    className="card"
                    aria-labelledby="care-context-title"
                  >
                    <h2 id="care-context-title">
                      {t("Informações compartilhadas pelo hospital")}
                    </h2>
                    <p>
                      <strong>
                        {t("Diagnóstico informado pelo hospital")}
                      </strong>
                      <br />
                      {remote.summary.careContext.diagnosisLabel}
                    </p>
                    {remote.summary.careContext.treatmentLabel && (
                      <p>
                        <strong>{t("Tratamento ou etapa informada")}</strong>
                        <br />
                        {remote.summary.careContext.treatmentLabel}
                      </p>
                    )}
                    {remote.summary.careContext.cycleLabel && (
                      <p>
                        <strong>{t("Ciclo informado")}</strong>
                        <br />
                        {remote.summary.careContext.cycleLabel}
                      </p>
                    )}
                    <p className="footnote">
                      {t("Fonte: {value}.", {
                        value: remote.summary.careContext.sourceLabel,
                      })}
                    </p>
                    {remote.summary.careContext.patientInstructions.map(
                      (instruction, index) => (
                        <p key={index}>{instruction}</p>
                      ),
                    )}
                  </section>
                )}
                <div className="section-heading">
                  <h2>{t("Conforto na leitura")}</h2>
                  <Settings2 size={20} />
                </div>
                <section className="card preferences">
                  <LanguageSelector
                    id="app-language"
                    disabled={remote.pending > 0}
                    onSelect={
                      hospital
                        ? (nextLocale) =>
                            void changePreferences(prefs, nextLocale)
                        : undefined
                    }
                  />
                  <label htmlFor="text-size">{t("Tamanho do texto")}</label>
                  <select
                    id="text-size"
                    value={prefs.textScale}
                    disabled={remote.pending > 0}
                    onChange={(e) =>
                      void changePreferences({
                        ...prefs,
                        textScale: Number(
                          e.target.value,
                        ) as Preferences["textScale"],
                      })
                    }
                  >
                    <option value="1">{t("Padrão")}</option>
                    <option value="1.25">{t("Ampliado · 125%")}</option>
                    <option value="1.5">{t("Grande · 150%")}</option>
                    <option value="2">{t("Muito grande · 200%")}</option>
                  </select>
                  <label htmlFor="explanation">
                    {t("Como prefere as explicações? ")}
                  </label>
                  <select
                    id="explanation"
                    value={prefs.explanation}
                    disabled={remote.pending > 0}
                    onChange={(e) =>
                      void changePreferences({
                        ...prefs,
                        explanation: e.target
                          .value as Preferences["explanation"],
                      })
                    }
                  >
                    <option value="short">{t("Curtas e diretas")}</option>
                    <option value="step_by_step">{t("Passo a passo")}</option>
                  </select>
                  <label htmlFor="speech-rate">{t("Velocidade da voz")}</label>
                  <select
                    id="speech-rate"
                    value={prefs.speechRate}
                    disabled={remote.pending > 0}
                    onChange={(e) =>
                      void changePreferences({
                        ...prefs,
                        speechRate: Number(
                          e.target.value,
                        ) as Preferences["speechRate"],
                      })
                    }
                  >
                    <option value="0.8">{t("Mais devagar")}</option>
                    <option value="1">{t("Natural")}</option>
                    <option value="1.2">{t("Mais rápida")}</option>
                  </select>
                  <p className="footnote">
                    {t(
                      "A Lia adapta as explicações e a voz às suas escolhas. Você pode alterá-las quando quiser. ",
                    )}
                  </p>
                </section>
                {!hospital && (
                  <>
                    <div className="section-heading">
                      <h2>{t("Explorar outro perfil")}</h2>
                    </div>
                    <div className="card persona-list">
                      {localizedPersonas.map((p) => (
                        <button
                          aria-pressed={p.id === persona.id}
                          onClick={() => {
                            choosePersona(p.id);
                            setNotice(
                              "Perfil alterado. A demonstração começou de novo.",
                            );
                          }}
                          key={p.id}
                        >
                          <span className={`avatar ${p.accent}`}>
                            {p.initials}
                          </span>
                          <span>
                            <strong>{p.name}</strong>
                            <small>
                              {t("Perfil fictício · {age}", {
                                age: p.ageLabel,
                              })}
                            </small>
                          </span>
                          {p.id === persona.id ? (
                            <Check size={22} />
                          ) : (
                            <ChevronRight size={20} />
                          )}
                        </button>
                      ))}
                    </div>
                    <RowButton
                      icon={RotateCcw}
                      title={t("Reiniciar demonstração")}
                      description={t("Limpar pedidos e registros desta sessão")}
                      onClick={() => setModal({ type: "reset" })}
                    />
                    <PairHospitalPanel
                      pairing={connected.pairing}
                      error={connected.pairError}
                      onConnect={pair}
                    />
                  </>
                )}
                <RowButton
                  icon={Info}
                  title={t("Sobre esta versão")}
                  description={t("OncoFlow Paciente · 0.11.1")}
                  onClick={() => setModal({ type: "help" })}
                />
                <p className="footnote">
                  {t(
                    hospital
                      ? "Sessão mantida apenas enquanto o app está aberto. Ao reiniciar, use um novo código."
                      : "Apenas preferências de leitura e idioma são salvas neste aparelho. Ao fechar ou recarregar, os registros da demonstração são apagados. ",
                  )}
                </p>
                <p className="footnote">
                  {t(
                    hospital
                      ? "Demonstração com dados fictícios. Registros e pedidos confirmados são compartilhados com o painel conectado. Este aplicativo não é um serviço de urgência."
                      : DEMO_NOTICE,
                  )}
                </p>
              </>
            )}
            {page === "documents" && (
              <>
                <button
                  className="back-button"
                  onClick={() => navigate("home")}
                >
                  <ChevronLeft size={18} />
                  {t(" Início ")}
                </button>
                <PageTitle
                  eyebrow={t("TUDO ORGANIZADO")}
                  title={t("Meus documentos")}
                  subtitle={t(
                    "Informações da sua jornada, fáceis de encontrar.",
                  )}
                />
                <div className="stack">
                  {documents.map((doc) => (
                    <button
                      className="document-card card"
                      key={doc.id}
                      onClick={() => setModal({ type: "document", value: doc })}
                    >
                      <span className="icon-tile blue">
                        <FileText />
                      </span>
                      <div>
                        <Tag>
                          {t(
                            hospital
                              ? "Documento publicado pela equipe"
                              : "FICTÍCIO",
                          )}
                        </Tag>
                        <h2>{doc.title}</h2>
                        <p>
                          {doc.typeLabel} · {date(doc.issuedAt)}
                        </p>
                      </div>
                      <ChevronRight size={20} />
                    </button>
                  ))}
                </div>
                {hospital && !documents.length && remote.status === "ready" && (
                  <p className="empty-state">
                    {t("Nenhum documento publicado para você.")}
                  </p>
                )}
                <div className="info-box">
                  <ShieldCheck size={21} />
                  <p>
                    {t(
                      hospital
                        ? "Dados fornecidos pelo hospital da demonstração. Textos da equipe são exibidos no idioma original."
                        : "São exemplos criados para esta demonstração. Nenhum documento real foi importado. ",
                    )}
                  </p>
                </div>
              </>
            )}
            {page === "requests" && (
              <>
                <button
                  className="back-button"
                  onClick={() => navigate("home")}
                >
                  <ChevronLeft size={18} />
                  {t(" Início ")}
                </button>
                <PageTitle
                  eyebrow={t("CADA PEDIDO, ACOMPANHADO")}
                  title={t("Meus pedidos")}
                  subtitle={t(
                    hospital
                      ? "Acompanhe os pedidos recebidos pelo hospital."
                      : "Veja o que você registrou nesta demonstração.",
                  )}
                />
                {requests.length ? (
                  <div className="stack">
                    {requests.map((req) => (
                      <article className="card request-card" key={req.id}>
                        <span className="icon-tile">
                          <MessageCircle />
                        </span>
                        <Tag>
                          {t(
                            hospital
                              ? requestStatusLabel[req.status]
                              : "SIMULAÇÃO",
                          )}
                        </Tag>
                        <h2>
                          {req.type === "contact"
                            ? t("Solicitação de contato")
                            : t("Pedido de reagendamento")}
                        </h2>
                        <p>
                          {t(
                            hospital
                              ? requestStatusLabel[req.status]
                              : "Registrado no app. Não enviado a uma equipe real.",
                          )}
                        </p>
                        <div className="request-step">
                          <Check size={18} />
                          {t(
                            hospital
                              ? requestStatusLabel[req.status]
                              : " Pedido registrado ",
                          )}
                        </div>
                        <small>
                          {date(req.createdAt)} · {time(req.createdAt)}
                        </small>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <span className="icon-tile">
                      <Bell size={28} />
                    </span>
                    <h2>{t("Tudo tranquilo por aqui")}</h2>
                    <p>
                      {t(
                        hospital
                          ? "Seus pedidos aparecerão neste espaço após a confirmação do hospital."
                          : "Seus pedidos simulados aparecerão neste espaço.",
                      )}
                    </p>
                  </div>
                )}
                <button
                  className="secondary full"
                  onClick={() => setModal({ type: "contact" })}
                >
                  <MessageCircle size={20} />
                  {t(
                    hospital
                      ? "Pedir contato da equipe"
                      : " Simular pedido de contato ",
                  )}
                </button>
                <p className="footnote">
                  {t(
                    "Este aplicativo de demonstração não presta atendimento e não é monitorado por profissionais. ",
                  )}
                </p>
              </>
            )}
            {page === "messages" && hospital && (
              <>
                <button
                  className="back-button"
                  onClick={() => navigate("home")}
                >
                  <ChevronLeft size={18} />
                  {t("Início")}
                </button>
                <PageTitle
                  eyebrow={t("CADA ETAPA, CONECTADA")}
                  title={t("Mensagens da equipe")}
                  subtitle={t("Conversas com a equipe da demonstração")}
                />
                <TeamMessages
                  key={context.sessionId}
                  messages={remote.messages}
                  pending={remote.pending > 0}
                  onSend={(text) =>
                    performConnected(`message-${text}`, (key) =>
                      hospital.sendMessage({
                        text,
                        source: "text",
                        idempotencyKey: key,
                      }),
                    )
                  }
                />
              </>
            )}
            {page === "messages" && !hospital && (
              <>
                <PageTitle
                  eyebrow={t("CADA ETAPA, CONECTADA")}
                  title={t("Mensagens da equipe")}
                  subtitle={t(
                    "Conecte ao hospital para consultar as mensagens compartilhadas pela equipe.",
                  )}
                />
                <PairHospitalPanel
                  pairing={connected.pairing}
                  error={connected.pairError}
                  onConnect={pair}
                />
              </>
            )}
            {page === "checkin" && (
              <section className="checkin-screen" data-testid="checkin-screen">
                <button
                  className="back-button"
                  onClick={() => navigate("home")}
                >
                  <ChevronLeft size={18} />
                  {t(" Início ")}
                </button>
                <PageTitle
                  eyebrow={t("UM MOMENTO PARA VOCÊ")}
                  title={t("Como você está se sentindo hoje?")}
                  subtitle={t("Escolha uma das opções ou converse com a Lia.")}
                />
                <div
                  className="mood-options"
                  role="group"
                  aria-label={t("Como você está se sentindo")}
                >
                  {feelings.map(({ label, icon: Icon, tone }) => (
                    <button
                      key={label}
                      onClick={() => setMood(label)}
                      aria-pressed={mood === label}
                      className={
                        "mood-option tone-" +
                        tone +
                        (mood === label ? " selected" : "")
                      }
                    >
                      <span className="feeling-icon" aria-hidden="true">
                        <Icon size={27} />
                      </span>
                      <span>{t(label)}</span>
                      {mood === label && (
                        <Check
                          className="feeling-check"
                          size={18}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  ))}
                </div>
                <div className="checkin-actions">
                  <button
                    disabled={!mood || remote.pending > 0}
                    className="secondary full"
                    onClick={() => void saveCheckin()}
                  >
                    {t(
                      hospital
                        ? "Salvar registro"
                        : "Salvar registro fictício ",
                    )}
                    <Check size={19} />
                  </button>
                  {savedMood && (
                    <p className="saved-mood" role="status">
                      {t(
                        hospital
                          ? "Último registro confirmado: "
                          : "Seu registro nesta sessão: ",
                      )}
                      <strong>{t(savedMood)}</strong>
                    </p>
                  )}
                  <button className="primary full" onClick={startLia}>
                    <Mic size={22} />
                    {t(" Quero falar com a Lia ")}
                  </button>
                  <button
                    className="text-button checkin-later"
                    onClick={() => navigate("home")}
                  >
                    {t("Agora não ")}
                  </button>
                </div>
                <p className="footnote">
                  {t(
                    hospital
                      ? "O registro é enviado ao painel após sua confirmação. Ele não substitui avaliação profissional."
                      : "Registro demonstrativo, sem avaliação clínica ou envio à equipe. ",
                  )}
                </p>
              </section>
            )}
          </main>
          <nav className="bottom-nav" aria-label={t("Navegação principal")}>
            {tabs.map(({ page: target, label, icon: Icon }) => (
              <button
                key={target}
                onClick={() =>
                  target === "lia" ? startLia() : navigate(target)
                }
                aria-current={page === target ? "page" : undefined}
                className={`${page === target ? "active" : ""} ${target === "lia" ? "lia-nav" : ""}`}
              >
                <span className="nav-icon">
                  <Icon size={23} strokeWidth={page === target ? 2.3 : 1.8} />
                </span>
                <span>{t(label)}</span>
              </button>
            ))}
          </nav>
        </>
      )}
      {displayedModal && (
        <Sheet
          assisted={displayedModal.assisted || liaAssisted}
          title={
            displayedModal.type === "appointment"
              ? t("Seu encontro")
              : displayedModal.type === "document"
                ? t(
                    hospital
                      ? "Documento publicado pela equipe"
                      : "Documento fictício",
                  )
                : displayedModal.type === "reschedule"
                  ? t("Pedir outro horário")
                  : displayedModal.type === "reset"
                    ? t("Começar de novo?")
                    : displayedModal.type === "contact"
                      ? t("Pedido de contato")
                      : t("Sobre a demonstração")
          }
          onClose={() => setModal(null)}
        >
          {hospital && remote.error === "write" && (
            <p role="alert" className="hospital-error">
              {t(
                "Não foi possível confirmar o envio. Tente a mesma ação novamente; ela não será duplicada.",
              )}
            </p>
          )}
          {displayedModal.type === "appointment" && (
            <>
              <Tag kind="green">
                {t(
                  hospital
                    ? appointmentStatusLabel[displayedModal.value.status]
                    : "Confirmada · fictícia",
                )}
              </Tag>
              <h3>{displayedModal.value.title}</h3>
              <p>{displayedModal.value.description}</p>
              <div className="detail-line">
                <CalendarDays size={20} />
                <span>
                  {date(displayedModal.value.startsAt)} ·{" "}
                  {time(displayedModal.value.startsAt)}
                </span>
              </div>
              <div className="detail-line">
                <MapPin size={20} />
                <span>{displayedModal.value.locationLabel}</span>
              </div>
              <button
                className="primary full"
                disabled={
                  hospital
                    ? !["scheduled", "confirmed"].includes(
                        displayedModal.value.status,
                      )
                    : false
                }
                onClick={() =>
                  setModal({
                    type: "reschedule",
                    value: displayedModal.value,
                    assisted: displayedModal.assisted,
                  })
                }
              >
                {t("Solicitar reagendamento ")}
                <ArrowRight size={18} />
              </button>
            </>
          )}
          {displayedModal.type === "reschedule" && (
            <>
              <p>
                {t(
                  hospital
                    ? "Vamos pedir outro horário para"
                    : "Vamos registrar um pedido fictício para alterar o horário de",
                )}{" "}
                <strong>{displayedModal.value.title}</strong>
                {t(". ")}
              </p>
              <div className="info-box">
                <Info size={22} />
                <p>
                  {t(
                    hospital
                      ? "O pedido não altera a consulta original. Aguarde a atualização da equipe."
                      : "A consulta original continua confirmada. Nenhum pedido será enviado a uma equipe real. ",
                  )}
                </p>
              </div>
              <button
                className="primary full"
                disabled={
                  remote.pending > 0 ||
                  (Boolean(hospital) &&
                    !["scheduled", "confirmed"].includes(
                      displayedModal.value.status,
                    ))
                }
                onClick={() =>
                  submitRequest("reschedule", displayedModal.value)
                }
              >
                {t(
                  hospital
                    ? remote.pending > 0
                      ? "Salvando no hospital…"
                      : "Confirmar envio"
                    : "Confirmar pedido simulado ",
                )}
                <Check size={18} />
              </button>
              <button className="secondary full" onClick={() => setModal(null)}>
                {t("Cancelar ")}
              </button>
            </>
          )}
          {displayedModal.type === "document" && (
            <>
              <Tag>{t("FICTÍCIO · SEM VALIDADE CLÍNICA")}</Tag>
              <h3>{displayedModal.value.title}</h3>
              <p className="footnote">
                {displayedModal.value.authorLabel} ·{" "}
                {date(displayedModal.value.issuedAt)}
              </p>
              <div className="document-body">
                {displayedModal.value.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </>
          )}
          {displayedModal.type === "reset" && (
            <>
              <p>
                {t(
                  "Seus pedidos e registros fictícios serão apagados. As preferências de leitura e idioma serão mantidas. ",
                )}
              </p>
              <button className="primary full" onClick={reset}>
                {t("Reiniciar agora ")}
                <RotateCcw size={18} />
              </button>
              <button className="secondary full" onClick={() => setModal(null)}>
                {t("Continuar explorando ")}
              </button>
            </>
          )}
          {displayedModal.type === "contact" && (
            <>
              <p>
                {t(
                  hospital
                    ? "O pedido será enviado ao painel da equipe da demonstração após sua confirmação."
                    : "Você pode experimentar como seria pedir contato da equipe de navegação. Nesta versão, o pedido fica somente no app. ",
                )}
              </p>
              <button
                className="primary full"
                disabled={remote.pending > 0}
                onClick={() => submitRequest("contact")}
              >
                {t(
                  hospital
                    ? remote.pending > 0
                      ? "Salvando no hospital…"
                      : "Confirmar envio"
                    : "Confirmar pedido simulado ",
                )}
                <Check size={18} />
              </button>
            </>
          )}
          {displayedModal.type === "help" && (
            <>
              <img
                className="about-logo"
                src="./brand/logo.svg"
                alt="OncoFlow AI"
              />
              <p>
                {t(
                  "Uma primeira versão para explorar a jornada do paciente. Todos os nomes, encontros e documentos são fictícios. ",
                )}
              </p>
              <p>
                {t(
                  "A Lia conversa com GPT-4o, transcreve sua fala e responde com a voz Sarah no Android. Os cenários de gravidade e os alertas são simulações. ",
                )}
              </p>
              <p>
                {t(
                  hospital
                    ? "Os envios confirmados aparecem no painel da equipe desta demonstração. Não há atendimento ou monitoramento clínico real."
                    : "Não há atendimento, monitoramento clínico ou envio de mensagens a profissionais. ",
                )}
              </p>
              <Tag>{t("VERSÃO 0.9.0 · DEMONSTRAÇÃO")}</Tag>
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}
