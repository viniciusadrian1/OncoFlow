/** Connected fictional demo. This adapter shares the existing Pro state; it is not clinical infrastructure. */
import express, { type Request, type Response, type NextFunction } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Mensagem, OpcaoCheckin, Paciente, Pendencia } from '../src/types';
import {
  adicionarMensagem, auditar, criarPendencia, ErroDominio, exportarEstado, importarEstado,
  marcarAlteracao, observarReset, obterPaciente, registrarCheckin, registrarSinalUrgencia, todasPendencias,
  todosPacientes, usuarioPorId,
} from './estado';
import { CONFIG_SERVICO } from './configServico';
import { detectarRelatoAfirmativo, detectarUrgencia } from './urgencia';
import { agoraISO, gerarId } from './util';

type Scope = { tenantId: string; hospitalId: string; patientId: string };
type RecordBase = Scope & { id: string };
type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
type JourneyStatus = 'completed' | 'current' | 'planned';
type Preferences = RecordBase & { locale: 'pt-BR' | 'en-US'; explanation: 'short' | 'step_by_step'; speechRate: 0.8 | 1 | 1.2; textScale: 1 | 1.25 | 1.5 | 2 };
type RequestLink = { patientId: string; type: 'contact' | 'reschedule'; appointmentId?: string; idempotencyKey: string };
type Wellbeing = RecordBase & { feeling: string; note?: string; recordedAt: string; createdAt: string; idempotencyKey: string; status: 'recorded' };
type Message = RecordBase & { role: 'patient' | 'team' | 'system'; authorLabel: string; text: string; createdAt: string; status: 'recorded' };
type SymptomReport = RecordBase & { text: string; source: 'text' | 'voice'; recordedAt: string; status: 'recorded'; alertId: string; reviewRequired: true; guidance: string };
type DraftDocument = RecordBase & { title: string; issuedAt: string; typeLabel: string; authorLabel: string; body: string[]; published: boolean };
type Idempotent = { fingerprint: string; resource: string; resultId: string; result?: unknown };
type Extras = {
  convertedAt: string;
  appointmentStatuses: Record<string, AppointmentStatus>;
  journeyDates: Record<string, string>;
  preferences: Record<string, Preferences>;
  requests: Record<string, RequestLink>;
  wellbeing: Record<string, Wellbeing>;
  symptomReports: Record<string, SymptomReport>;
  drafts: Record<string, DraftDocument>;
  idempotency: Record<string, Idempotent>;
};
export type MobileOptions = {
  /** Null disables disk persistence only for isolated test servers. Never expose this via HTTP. */
  statePath?: string | null;
  now?: () => number;
  pairingTtlMs?: number;
  sessionTtlMs?: number;
  /** Test-only fault injection for the local atomic persistence boundary; never an HTTP option. */
  beforePersist?: () => void;
};
const scopeFor = (patientId: string): Scope => ({ tenantId: 'demo', hospitalId: 'oncoflow', patientId });
const baseFor = (patientId: string, id: string): RecordBase => ({ ...scopeFor(patientId), id });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const invalid = (message = 'Dados inválidos para esta operação.'): never => { throw new ErroDominio(400, 'dados_invalidos', message); };
function object(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const item = value as Record<string, unknown>;
  if (required.some(k => !(k in item)) || Object.keys(item).some(k => !required.includes(k) && !optional.includes(k))) return invalid();
  return item;
}
function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return invalid();
  return value;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) return invalid();
  return value;
}
function date(value: unknown): string {
  const result = text(value, 40);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(result);
  if (!match || !Number.isFinite(Date.parse(result))) return invalid();
  const [, y, m, d, h, min, s, oh = '0', om = '0'] = match;
  if (+m < 1 || +m > 12 || +d < 1 || +d > new Date(Date.UTC(+y, +m, 0)).getUTCDate() || +h > 23 || +min > 59 || +s > 59 || +oh > 23 || +om > 59) return invalid();
  return result;
}
function choice<T extends string | number>(value: unknown, values: readonly T[]): T {
  return values.includes(value as T) ? value as T : invalid();
}
function confirmation(value: unknown) {
  const item = object(value, ['confirmed', 'confirmedAt']);
  if (item.confirmed !== true) return invalid('Confirmação explícita do paciente é necessária.');
  return { confirmed: true, confirmedAt: date(item.confirmedAt) };
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
const route = (fn: (req: Request, res: Response) => void) => (req: Request, res: Response, next: NextFunction) => {
  try { fn(req, res); } catch (error) {
    if (error instanceof ErroDominio) res.status(error.status).json({ erro: error.codigo, mensagem: error.message });
    else next(error);
  }
};

export function criarIntegracaoMobile(options: MobileOptions = {}) {
  const now = options.now ?? Date.now;
  const filename = options.statePath === null ? null : path.resolve(options.statePath ?? process.env.ONCOFLOW_DEMO_STATE_PATH ?? 'outputs/.oncoflow-demo/state.json');
  const fresh = (): Extras => ({ convertedAt: new Date(now()).toISOString(), appointmentStatuses: {}, journeyDates: {}, preferences: {}, requests: {}, wellbeing: {}, symptomReports: {}, drafts: {}, idempotency: {} });
  let extras = fresh();
  const pairings = new Map<string, { patientId: string; expires: number }>();
  const sessions = new Map<string, { patientId: string; expires: number }>();
  const attempts = new Map<string, { count: number; expires: number }>();
  const savedRequests = new WeakSet<Request>();
  if (filename && existsSync(filename)) {
    // A broken file is surfaced, never silently replaced by a new seed.
    const saved = JSON.parse(readFileSync(filename, 'utf8'));
    if (saved.format !== 'oncoflow-fictional-demo-1' || !saved.extras || !saved.extras.idempotency) throw new Error('Invalid saved fictional demo state.');
    importarEstado(saved.state);
    extras = saved.extras;
    extras.symptomReports ??= {};
  }
  function persist() {
    if (!filename) return;
    options.beforePersist?.();
    mkdirSync(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ format: 'oncoflow-fictional-demo-1', state: exportarEstado(), extras }), { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, filename);
  }
  function prune() {
    for (const map of [pairings, sessions, attempts]) for (const [key, value] of map) if (value.expires <= now()) map.delete(key);
  }
  function bound(key: string, limit: number, milliseconds = 60_000) {
    prune();
    let attempt = attempts.get(key);
    if (!attempt) {
      if (attempts.size >= 2000) throw new ErroDominio(429, 'limite_demo', 'Tente novamente em alguns instantes.');
      attempts.set(key, attempt = { count: 0, expires: now() + milliseconds });
    }
    if (++attempt.count > limit) throw new ErroDominio(429, 'limite_demo', 'Tente novamente em alguns instantes.');
  }
  function patient(req: Request): Paciente {
    prune();
    const raw = req.header('authorization');
    const session = raw && /^Bearer [A-Za-z0-9_-]+$/.test(raw) ? sessions.get(hash(raw.slice(7))) : undefined;
    if (!session) throw new ErroDominio(401, 'sessao_invalida', 'Pareie novamente o aplicativo.');
    if (req.params.tenantId !== 'demo' || req.params.hospitalId !== 'oncoflow' || req.params.patientId !== session.patientId) throw new ErroDominio(403, 'escopo_invalido', 'Sessão fora do escopo autorizado.');
    return obterPaciente(session.patientId);
  }
  function team(req: Request) { const user = usuarioPorId(req.header('x-demo-usuario')); const p = obterPaciente(id(req.params.id)); return { user, p }; }
  function envelope(res: Response, p: Paciente, resourceType: string, data: unknown) {
    // The strict mobile reader caps responses at 256 KiB. Preserve recent records without
    // deleting the full shared demo history from disk or the team view.
    let bounded = data;
    if (Array.isArray(data)) {
      const recent = data.slice(-250);
      while (recent.length > 1 && Buffer.byteLength(JSON.stringify(recent), 'utf8') > 225 * 1024) recent.shift();
      bounded = recent;
    }
    res.json({ apiVersion: '1', resourceType, scope: scopeFor(p.id), asOf: new Date(now()).toISOString(), data: bounded });
  }
  function preferences(p: Paciente): Preferences {
    return extras.preferences[p.id] ?? { ...baseFor(p.id, `pref-${p.id}`), locale: 'pt-BR', explanation: 'short', speechRate: 1, textScale: 1 };
  }
  function appointments(p: Paciente) {
    return p.agenda.map(a => ({ ...baseFor(p.id, a.id), startsAt: a.dataHora, title: a.titulo, locationLabel: a.local, professionalLabel: a.profissional || 'Equipe do hospital (demonstração)', ...(a.preparo ? { preparation: a.preparo } : {}), status: extras.appointmentStatuses[a.id] ?? 'scheduled' as AppointmentStatus }));
  }
  function journey(p: Paciente) {
    return p.jornada.map(j => ({ ...baseFor(p.id, j.id), title: j.titulo, occurredAt: extras.journeyDates[j.id] ?? extras.convertedAt, description: j.descricao || 'Etapa cadastrada pela equipe na demonstração fictícia.', status: j.estado === 'concluida' ? 'completed' : j.estado === 'em_andamento' ? 'current' : 'planned', source: 'hospital' as const }));
  }
  function documents(p: Paciente) {
    const published = p.documentos.map(d => ({ ...baseFor(p.id, d.id), title: d.titulo, issuedAt: d.data, typeLabel: d.tipo === 'resultado' ? 'Resultado' : 'Orientação', authorLabel: d.liberadoPor, body: d.texto.split(/\n+/).filter(s => s.trim()) }));
    return published;
  }
  function requestResult(p: Paciente, pend: Pendencia) {
    const link = extras.requests[pend.id];
    if (!link || link.patientId !== p.id || pend.pacienteId !== p.id) throw new ErroDominio(404, 'pedido_nao_encontrado', 'Pedido não encontrado.');
    const changes = exportarEstado().auditoria.filter(a => a.alvo === pend.id);
    return { ...baseFor(p.id, pend.id), type: link.type, ...(link.appointmentId ? { appointmentId: link.appointmentId } : {}), status: pend.estado === 'concluida' ? 'completed' : pend.estado === 'em_andamento' ? 'in_progress' : 'accepted', idempotencyKey: link.idempotencyKey, createdAt: pend.criadaEm, updatedAt: pend.concluidaEm ?? changes.at(-1)?.em ?? pend.criadaEm };
  }
  function messageResult(p: Paciente, message: Mensagem): Message {
    if (message.texto.length > 4000 || !message.texto.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(message.texto)) {
      // Older shared-state files can contain messages written before the strict mobile
      // contract. Never truncate a possible care instruction or expose any original
      // fragment. Keep it in Pro and return a transparent, bounded system notice.
      return { ...baseFor(p.id, message.id), role: 'system', authorLabel: 'OncoFlow', text: 'Esta mensagem não pôde ser exibida integralmente no aplicativo. O conteúdo original permanece disponível para a equipe no OncoFlow Pro. Peça à equipe uma nova mensagem pelo aplicativo.', createdAt: message.em, status: 'recorded' };
    }
    return { ...baseFor(p.id, message.id), role: message.autor === 'paciente' ? 'patient' : message.autor === 'profissional' ? 'team' : 'system', authorLabel: message.nomeAutor, text: message.texto, createdAt: message.em, status: 'recorded' };
  }
  const visibleMessage = (m: Mensagem) => m.visivelPaciente === true && (m.autor !== 'lia' || m.tipoSistema === 'urgencia');
  function idempotent(req: Request, p: Paciente, resource: string, key: string, input: unknown, create: () => { id: string }, lookup: (id: string) => unknown) {
    if (req.header('Idempotency-Key') !== key) return invalid('A chave de idempotência deve corresponder ao corpo.');
    const storeKey = `${p.id}:${key}`;
    const fingerprint = hash(stable(input));
    const previous = extras.idempotency[storeKey];
    if (previous) {
      if (previous.resource !== resource || previous.fingerprint !== fingerprint) throw new ErroDominio(409, 'idempotencia_conflitante', 'Esta operação já foi usada com outros dados.');
      savedRequests.add(req);
      if (resource === 'preferences' && previous.result) return previous.result;
      return lookup(previous.resultId);
    }
    bound(`write:${p.id}`, 60);
    if (Object.keys(extras.idempotency).length >= 20_000) throw new ErroDominio(429, 'limite_demo', 'Limite de operações desta demonstração atingido.');
    const stateBefore = structuredClone(exportarEstado());
    const extrasBefore = structuredClone(extras);
    try {
      const result = create();
      extras.idempotency[storeKey] = { fingerprint, resource, resultId: result.id, ...(resource === 'preferences' ? { result: lookup(result.id) } : {}) };
      persist();
      savedRequests.add(req);
      return lookup(result.id);
    } catch (error) {
      // Failed storage must not leave an acknowledged-looking in-memory message or alert.
      importarEstado(stateBefore); extras = extrasBefore;
      throw error;
    }
  }
  function mobileData(p: Paciente) {
    const published = documents(p).map(d => ({ ...d, published: true }));
    return { demo: true, conversion: { source: 'fictional_mvp', convertedAt: extras.convertedAt, journeyDates: 'Undated seed stages use the demo conversion date until edited by the team.' }, appointments: appointments(p), journey: journey(p), documents: [...published, ...Object.values(extras.drafts).filter(d => d.patientId === p.id && !d.published)], preferences: preferences(p) };
  }
  const r = express.Router();
  r.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      const original = res.json.bind(res);
      res.json = ((body: unknown) => { if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && res.statusCode < 400 && !savedRequests.has(req)) persist(); return original(body); }) as typeof res.json;
    }
    next();
  });
  r.post('/api/pro/pacientes/:id/mobile-pairing', route((req, res) => {
    const { p, user } = team(req);
    object(req.body ?? {}, []);
    bound(`pair-generate:${p.id}`, 10);
    prune();
    for (const [key, pair] of pairings) if (pair.patientId === p.id) pairings.delete(key);
    const code = randomBytes(5).toString('hex').toUpperCase();
    const expires = now() + (options.pairingTtlMs ?? 5 * 60_000);
    pairings.set(hash(code), { patientId: p.id, expires });
    auditar(user.nome, 'emitiu_pareamento_mobile_demo', p.id);
    res.json({ code, expiresAt: new Date(expires).toISOString(), demo: true });
  }));
  r.post('/api/mobile/pair', route((req, res) => {
    bound(`pair-attempt:${req.ip}`, 20);
    const item = object(req.body, ['code']);
    const code = text(item.code, 20).trim().toUpperCase();
    prune();
    const pairing = pairings.get(hash(code));
    if (!pairing) throw new ErroDominio(401, 'pareamento_invalido', 'Código inválido, expirado ou já utilizado.');
    if (sessions.size >= 2000) throw new ErroDominio(429, 'limite_demo', 'Limite de sessões desta demonstração atingido.');
    pairings.delete(hash(code));
    const p = obterPaciente(pairing.patientId);
    const token = randomBytes(32).toString('base64url');
    const expires = now() + (options.sessionTtlMs ?? 30 * 60_000);
    sessions.set(hash(token), { patientId: p.id, expires });
    auditar(p.id, 'pareou_mobile_demo', p.id);
    res.json({ accessToken: token, expiresAt: new Date(expires).toISOString(), scope: scopeFor(p.id), patient: { displayName: p.nome }, demo: true });
  }));
  const prefix = '/api/v1/tenants/:tenantId/hospitals/:hospitalId/patients/:patientId';
  r.get(`${prefix}/summary`, route((req, res) => {
    const p = patient(req);
    const last = Object.values(extras.wellbeing).filter(record => record.patientId === p.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
    const contextText = (value: string, limit: number) => Boolean(value?.trim() && value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value));
    const patientInstructions = p.documentos.filter(d => d.tipo === 'orientacao').flatMap(d => d.texto.split(/\n+/)).filter(paragraph => contextText(paragraph, 4000)).slice(-16);
    // Do not truncate a diagnosis or instruction into a changed clinical statement. The
    // optional context is omitted if its source cannot meet the patient display contract.
    const careContext = contextText(p.diagnosticoResumido, 200) ? { diagnosisLabel: p.diagnosticoResumido, ...(contextText(p.esquemaResumido, 200) ? { treatmentLabel: p.esquemaResumido } : {}), ...(contextText(p.cicloAtual, 200) ? { cycleLabel: p.cicloAtual } : {}), sourceLabel: 'Cadastro fictício do OncoFlow e orientações publicadas pela equipe', patientInstructions } : undefined;
    envelope(res, p, 'patient_summary', { ...baseFor(p.id, p.id), displayName: p.nome, preferredName: p.nome.split(' ')[0], careTeamLabel: CONFIG_SERVICO.instituicao, ...(careContext ? { careContext } : {}), ...(last ? { lastWellbeing: { feeling: last.feeling, recordedAt: last.recordedAt } } : {}) });
  }));
  r.get(`${prefix}/appointments`, route((req, res) => { const p = patient(req); envelope(res, p, 'appointments', appointments(p)); }));
  r.get(`${prefix}/journey`, route((req, res) => { const p = patient(req); envelope(res, p, 'journey', journey(p)); }));
  r.get(`${prefix}/documents`, route((req, res) => { const p = patient(req); auditar(p.id, 'leu_documentos_mobile_demo', p.id); persist(); envelope(res, p, 'documents', documents(p)); }));
  r.get(`${prefix}/requests`, route((req, res) => { const p = patient(req); envelope(res, p, 'requests', todasPendencias().filter(pe => pe.pacienteId === p.id && extras.requests[pe.id]).map(pe => requestResult(p, pe)).slice(-250)); }));
  r.get(`${prefix}/preferences`, route((req, res) => { const p = patient(req); envelope(res, p, 'preferences', preferences(p)); }));
  r.get(`${prefix}/messages`, route((req, res) => { const p = patient(req); auditar(p.id, 'leu_mensagens_mobile_demo', p.id); persist(); envelope(res, p, 'messages', p.mensagens.filter(visibleMessage).slice(-250).map(m => messageResult(p, m))); }));
  r.post(`${prefix}/requests`, route((req, res) => {
    const p = patient(req);
    const item = object(req.body, ['type', 'idempotencyKey', 'confirmation'], ['appointmentId']);
    const type = choice(item.type, ['contact', 'reschedule'] as const);
    if ((type === 'reschedule') !== (item.appointmentId !== undefined)) return invalid();
    const appointmentId = item.appointmentId === undefined ? undefined : id(item.appointmentId);
    if (appointmentId && !p.agenda.some(a => a.id === appointmentId)) throw new ErroDominio(404, 'compromisso_nao_encontrado', 'Compromisso não encontrado para esta sessão.');
    const key = id(item.idempotencyKey); confirmation(item.confirmation);
    const result = idempotent(req, p, 'request', key, item, () => {
      const pend = criarPendencia(p, { tipo: type === 'contact' ? 'contato_equipe' : 'reagendamento', origem: 'solicitacao_paciente', titulo: type === 'contact' ? 'Patient requested team contact · mobile demo' : `Rescheduling request · ${p.agenda.find(a => a.id === appointmentId)!.titulo}`, confirmadaPeloPaciente: true });
      extras.requests[pend.id] = { patientId: p.id, type, ...(appointmentId ? { appointmentId } : {}), idempotencyKey: key };
      auditar(p.id, 'registrou_solicitacao_mobile_demo', pend.id);
      return pend;
    }, requestId => requestResult(p, todasPendencias().find(pe => pe.id === requestId)!));
    envelope(res, p, 'request', result);
  }));
  const feelings: Record<string, OpcaoCheckin> = { 'Bem': 'bem', 'Cansado(a)': 'cansaco', 'Com dor': 'dor', 'Náusea': 'nausea', 'Ansioso(a)': 'ansiedade', 'Outro': 'outro' };
  r.post(`${prefix}/wellbeing`, route((req, res) => {
    const p = patient(req);
    const item = object(req.body, ['feeling', 'recordedAt', 'idempotencyKey', 'confirmation'], ['note']);
    const feeling = text(item.feeling); if (!Object.hasOwn(feelings, feeling)) return invalid('Opção de check-in não reconhecida.');
    const recordedAt = date(item.recordedAt); const note = item.note === undefined ? undefined : text(item.note, 2000);
    const key = id(item.idempotencyKey); confirmation(item.confirmation);
    const result = idempotent(req, p, 'wellbeing', key, item, () => {
      const { checkin } = registrarCheckin(p, [feelings[feeling]], note, 'visual');
      // Keep patient supplied time separate from immutable server receipt time in Pro.
      const record: Wellbeing = { ...baseFor(p.id, checkin.id), feeling, ...(note ? { note } : {}), recordedAt, createdAt: checkin.em, idempotencyKey: key, status: 'recorded' };
      extras.wellbeing[record.id] = record;
      return record;
    }, recordId => extras.wellbeing[recordId]);
    envelope(res, p, 'wellbeing_record', result);
  }));
  r.post(`${prefix}/messages`, route((req, res) => {
    const p = patient(req);
    const item = object(req.body, ['text', 'source', 'idempotencyKey', 'confirmation']);
    const body = text(item.text, 4000); const source = choice(item.source, ['text', 'voice'] as const);
    const key = id(item.idempotencyKey); confirmation(item.confirmation);
    const result = idempotent(req, p, 'message', key, item, () => {
      const message = adicionarMensagem(p, { autor: 'paciente', nomeAutor: p.nome, texto: body, origem: source === 'voice' ? 'voz' : 'texto', visivelPaciente: true });
      const urgency = detectarUrgencia(body);
      if (urgency) {
        // The existing service path shows only the service notice to the patient and keeps
        // the possible-sign hypothesis in Pro. It does not run conversational Lia rules.
        registrarSinalUrgencia(p, body, urgency.termo);
      }
      // Deliberately no rule-based Lia response: the native app owns its assistant conversation.
      auditar(p.id, 'enviou_mensagem_mobile_demo', p.id);
      return message;
    }, messageId => messageResult(p, p.mensagens.find(m => m.id === messageId && visibleMessage(m))!));
    envelope(res, p, 'message', result);
  }));
  r.post(`${prefix}/symptom-reports`, route((req, res) => {
    const p = patient(req);
    const item = object(req.body, ['text', 'source', 'locale', 'idempotencyKey']);
    const literal = text(item.text, 4000); const source = choice(item.source, ['text', 'voice'] as const); const locale = choice(item.locale, ['pt-BR', 'en-US'] as const); const key = id(item.idempotencyKey);
    if (req.header('Idempotency-Key') !== key) return invalid('A chave de idempotência deve corresponder ao corpo.');
    const finding = detectarRelatoAfirmativo(literal);
    // No message, pending item, audit content or idempotency record for non-report turns.
    // A previously accepted operation still replays its stored result after a config change.
    if (!finding && !extras.idempotency[`${p.id}:${key}`]) {
      bound(`write:${p.id}`, 60);
      savedRequests.add(req);
      envelope(res, p, 'symptom_report', { ...scopeFor(p.id), status: 'not_applicable' }); return;
    }
    const result = idempotent(req, p, 'symptom_report', key, item, () => {
      adicionarMensagem(p, { autor: 'paciente', nomeAutor: p.nome, texto: literal, origem: source === 'voice' ? 'voz' : 'texto', visivelPaciente: true });
      const alert = registrarSinalUrgencia(p, literal, finding!.termo);
      const record: SymptomReport = { ...baseFor(p.id, gerarId('symptom')), text: literal, source, recordedAt: agoraISO(), status: 'recorded', alertId: alert.id, reviewRequired: true, guidance: CONFIG_SERVICO.relatoAutomaticoDemo.orientacao[locale] };
      extras.symptomReports[record.id] = record;
      auditar(p.id, 'registrou_relato_automatico_demo', record.id);
      return record;
    }, reportId => extras.symptomReports[reportId]);
    envelope(res, p, 'symptom_report', result);
  }));
  r.put(`${prefix}/preferences`, route((req, res) => {
    const p = patient(req);
    const item = object(req.body, ['locale', 'explanation', 'speechRate', 'textScale', 'idempotencyKey']);
    const prefs: Preferences = { ...baseFor(p.id, `pref-${p.id}`), locale: choice(item.locale, ['pt-BR', 'en-US'] as const), explanation: choice(item.explanation, ['short', 'step_by_step'] as const), speechRate: choice(item.speechRate, [0.8, 1, 1.2] as const), textScale: choice(item.textScale, [1, 1.25, 1.5, 2] as const) };
    const key = id(item.idempotencyKey);
    const result = idempotent(req, p, 'preferences', key, item, () => { extras.preferences[p.id] = prefs; auditar(p.id, 'alterou_preferencias_mobile_demo', p.id); return prefs; }, () => preferences(p));
    envelope(res, p, 'preferences', result);
  }));
  r.get('/api/pro/pacientes/:id/mobile-data', route((req, res) => { const { p } = team(req); res.json(mobileData(p)); }));
  r.post('/api/pro/pacientes/:id/agenda/:appointmentId', route((req, res) => {
    const { p, user } = team(req);
    const a = p.agenda.find(item => item.id === req.params.appointmentId);
    if (!a) throw new ErroDominio(404, 'compromisso_nao_encontrado', 'Compromisso não encontrado.');
    const item = object(req.body, ['title', 'startsAt', 'locationLabel', 'professionalLabel', 'status'], ['preparation']);
    const replacement = { title: text(item.title), startsAt: date(item.startsAt), locationLabel: text(item.locationLabel), professionalLabel: text(item.professionalLabel), status: choice(item.status, ['scheduled', 'confirmed', 'completed', 'cancelled'] as const) };
    const preparation = item.preparation === undefined ? undefined : item.preparation === '' ? '' : text(item.preparation, 4000);
    a.titulo = replacement.title; a.dataHora = replacement.startsAt; a.local = replacement.locationLabel; a.profissional = replacement.professionalLabel; extras.appointmentStatuses[a.id] = replacement.status;
    if (preparation !== undefined) a.preparo = preparation || undefined;
    auditar(user.nome, 'editou_agenda_mobile_demo', a.id); marcarAlteracao();
    res.json({ ok: true, demo: true, resource: appointments(p).find(item => item.id === a.id) });
  }));
  r.post('/api/pro/pacientes/:id/journey/:eventId', route((req, res) => {
    const { p, user } = team(req); const j = p.jornada.find(item => item.id === req.params.eventId);
    if (!j) throw new ErroDominio(404, 'etapa_nao_encontrada', 'Etapa não encontrada.');
    const item = object(req.body, ['title', 'description', 'occurredAt', 'status']);
    const replacement = { title: text(item.title), description: text(item.description, 4000), occurredAt: date(item.occurredAt), status: choice(item.status, ['completed', 'current', 'planned'] as const) };
    j.titulo = replacement.title; j.descricao = replacement.description; j.estado = replacement.status === 'completed' ? 'concluida' : replacement.status === 'current' ? 'em_andamento' : 'futura'; extras.journeyDates[j.id] = replacement.occurredAt;
    auditar(user.nome, 'editou_jornada_mobile_demo', j.id); marcarAlteracao(); res.json({ ok: true, demo: true, resource: journey(p).find(item => item.id === j.id) });
  }));
  function publish(p: Paciente, d: DraftDocument) {
    if (!p.documentos.some(item => item.id === d.id)) p.documentos.push({ id: d.id, titulo: d.title, tipo: d.typeLabel === 'Resultado' ? 'resultado' : 'orientacao', data: d.issuedAt, texto: d.body.join('\n\n'), liberadoPor: d.authorLabel });
    d.published = true; marcarAlteracao();
  }
  r.post('/api/pro/pacientes/:id/documents', route((req, res) => {
    const { p, user } = team(req); const item = object(req.body, ['title', 'issuedAt', 'typeLabel', 'body', 'publish']);
    if (!Array.isArray(item.body) || !item.body.length || item.body.length > 100 || typeof item.publish !== 'boolean') return invalid();
    const d: DraftDocument = { ...baseFor(p.id, gerarId('doc')), title: text(item.title), issuedAt: date(item.issuedAt), typeLabel: choice(item.typeLabel, ['Resultado', 'Orientação'] as const), authorLabel: user.nome, body: item.body.map(s => text(s, 4000)), published: false };
    if (Buffer.byteLength(JSON.stringify(d), 'utf8') > 128 * 1024) return invalid('Documento muito extenso.');
    extras.drafts[d.id] = d; if (item.publish) publish(p, d);
    auditar(user.nome, item.publish ? 'publicou_documento_mobile_demo' : 'criou_rascunho_documento_mobile_demo', d.id); res.json({ ok: true, demo: true, resource: d });
  }));
  r.post('/api/pro/pacientes/:id/documents/:documentId/publish', route((req, res) => {
    const { p, user } = team(req); const item = object(req.body, ['publish']); if (item.publish !== true) return invalid('Confirme a publicação explícita.');
    const d = extras.drafts[req.params.documentId]; if (!d || d.patientId !== p.id) throw new ErroDominio(404, 'documento_nao_encontrado', 'Rascunho não encontrado.');
    publish(p, d); auditar(user.nome, 'publicou_documento_mobile_demo', d.id); res.json({ ok: true, demo: true, resource: d });
  }));
  // Keep existing APIs and metadata views backed by the same patient objects.
  persist();
  const dispose = observarReset(() => { extras = fresh(); pairings.clear(); sessions.clear(); attempts.clear(); persist(); });
  return { router: r, persist, dispose, mobileData };
}
