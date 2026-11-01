import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, FileText, Link2, RefreshCw, Route, Smartphone } from 'lucide-react';
import { chamarApi } from '../api/pro';
import type { PacientePro, UsuarioEquipe } from '../types';

type Locale = 'pt-BR' | 'en-US';
type Appointment = {
  id: string; title: string; startsAt: string; locationLabel: string; professionalLabel: string;
  preparation?: string; status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
};
type JourneyEvent = {
  id: string; title: string; description: string; occurredAt: string; status: 'completed' | 'current' | 'planned';
};
type Document = {
  id: string; title: string; issuedAt: string; typeLabel: string; authorLabel: string; body: string[]; published: boolean;
};
type MobileData = { demo: true; appointments: Appointment[]; journey: JourneyEvent[]; documents: Document[] };
type Pairing = { code: string; expiresAt: string; demo: true };

const COPY = {
  'pt-BR': {
    title: 'Aplicativo do paciente', subtitle: 'O mesmo cuidado, conectado entre a equipe e o aplicativo.',
    language: 'Idioma desta área', refresh: 'Atualizar dados', loading: 'Carregando informações compartilhadas…',
    failure: 'Não foi possível concluir. Tente novamente.', paired: 'Código emitido pelo servidor.',
    pairTitle: 'Conectar o aplicativo', pairIntro: 'Gere um código temporário para este paciente. O código só pode ser usado uma vez.',
    generate: 'Gerar código de pareamento', generating: 'Gerando código…', server: 'Endereço do servidor',
    addressHint: 'No Android, use o endereço HTTPS do painel acessível pelo aparelho. localhost aponta para o próprio celular.',
    instructions: 'No aplicativo, escolha Conectar ao hospital na entrada ou no Perfil. Informe o endereço do servidor e o código abaixo. Para HTTP na rede local, marque a opção de demonstração.',
    expires: 'Válido até', openApp: 'Abrir aplicativo web', demo: 'Dados fictícios · conexão de demonstração',
    schedule: 'Agenda publicada', scheduleHint: 'Salvar altera o compromisso real que o aplicativo consulta. Pedidos de reagendamento são revisados nas pendências.',
    journey: 'Jornada compartilhada', journeyHint: 'Revise os textos e estados antes de disponibilizá-los ao paciente.',
    documents: 'Documentos para o paciente', documentHint: 'Publique somente conteúdo revisado e autorizado. O plano interno da equipe continua separado.',
    titleLabel: 'Título', date: 'Data e horário', localTime: 'Horário local deste dispositivo', location: 'Local', professional: 'Profissional',
    preparation: 'Preparo autorizado', status: 'Estado', saveAppointment: 'Salvar e atualizar no aplicativo', saveJourney: 'Publicar alteração da jornada',
    saving: 'Salvando…', savedAppointment: 'Compromisso salvo no servidor e disponível no aplicativo.',
    savedJourney: 'Jornada salva no servidor e disponível no aplicativo.', published: 'Documento publicado no servidor e disponível no aplicativo.',
    scheduled: 'Agendado', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado', current: 'Em andamento', planned: 'Próxima etapa',
    description: 'Descrição para o paciente', type: 'Tipo do documento', body: 'Texto autorizado', bodyHint: 'Cada parágrafo será exibido no aplicativo.',
    approval: 'Revisei este texto e autorizo sua publicação para o paciente.', publish: 'Aprovar e publicar documento',
    released: 'Publicado', draft: 'Rascunho · visível apenas à equipe', publishDraft: 'Aprovar e publicar rascunho',
    noAppointments: 'Nenhum compromisso cadastrado.', noJourney: 'Nenhuma etapa cadastrada.', noDocuments: 'Nenhum documento publicado.',
    busy: 'Aguarde a confirmação do servidor antes de iniciar outra ação.', codeExpired: 'Este código expirou. Gere um novo código.',
  },
  'en-US': {
    title: 'Patient app', subtitle: 'The same care, connected between the team and the app.',
    language: 'Language for this area', refresh: 'Refresh data', loading: 'Loading shared information…',
    failure: "We couldn't finish. Please try again.", paired: 'Code issued by the server.',
    pairTitle: 'Connect the app', pairIntro: 'Generate a temporary code for this patient. The code can only be used once.',
    generate: 'Generate pairing code', generating: 'Generating code…', server: 'Server address',
    addressHint: 'On Android, use the HTTPS panel address accessible to the device. localhost refers to the phone itself.',
    instructions: 'In the app, choose Connect to hospital on the welcome screen or in Profile. Enter the server address and code below. For local HTTP, enable the demo network option.',
    expires: 'Valid until', openApp: 'Open web app', demo: 'Fictional data · demo connection',
    schedule: 'Published schedule', scheduleHint: 'Saving changes the actual appointment read by the app. Review rescheduling requests in Pending items.',
    journey: 'Shared journey', journeyHint: 'Review the text and status before making them available to the patient.',
    documents: 'Patient documents', documentHint: 'Publish reviewed and authorized content only. The internal team plan is kept separately.',
    titleLabel: 'Title', date: 'Date and time', localTime: 'Local time on this device', location: 'Location', professional: 'Professional',
    preparation: 'Authorized preparation', status: 'Status', saveAppointment: 'Save and update in app', saveJourney: 'Publish journey change',
    saving: 'Saving…', savedAppointment: 'Appointment saved on the server and available in the app.',
    savedJourney: 'Journey saved on the server and available in the app.', published: 'Document published on the server and available in the app.',
    scheduled: 'Scheduled', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', current: 'In progress', planned: 'Upcoming',
    description: 'Patient description', type: 'Document type', body: 'Authorized text', bodyHint: 'Each paragraph will be displayed in the app.',
    approval: 'I reviewed this text and authorize its publication to the patient.', publish: 'Approve and publish document',
    released: 'Published', draft: 'Draft · team only', publishDraft: 'Approve and publish draft',
    noAppointments: 'No appointments recorded.', noJourney: 'No journey steps recorded.', noDocuments: 'No documents published.',
    busy: 'Wait for server confirmation before starting another action.', codeExpired: 'This code expired. Generate a new code.',
  },
};
type Copy = typeof COPY['pt-BR'];

function localDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function textField(data: FormData, name: string): string { return String(data.get(name) ?? '').trim(); }

function AppointmentForm({ item, copy, pending, save }: { item: Appointment; copy: Copy; pending: boolean; save: (input: Omit<Appointment, 'id'>) => Promise<boolean> }) {
  return <form onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void save({ title: textField(data, 'title'), startsAt: new Date(textField(data, 'startsAt')).toISOString(),
      locationLabel: textField(data, 'locationLabel'), professionalLabel: textField(data, 'professionalLabel'),
      preparation: textField(data, 'preparation'), status: textField(data, 'status') as Appointment['status'] });
  }} className="mobile-editor">
    <fieldset disabled={pending}>
      <legend className="font-semibold mb-3">{item.title}</legend>
      <div className="mobile-field-grid">
        <label>{copy.titleLabel}<input name="title" required maxLength={200} defaultValue={item.title} /></label>
        <label>{copy.date}<input name="startsAt" type="datetime-local" required defaultValue={localDateTime(item.startsAt)} /><small>{copy.localTime}</small></label>
        <label>{copy.location}<input name="locationLabel" required maxLength={200} defaultValue={item.locationLabel} /></label>
        <label>{copy.professional}<input name="professionalLabel" required maxLength={200} defaultValue={item.professionalLabel} /></label>
        <label className="mobile-field-wide">{copy.preparation}<textarea name="preparation" rows={2} maxLength={3000} defaultValue={item.preparation ?? ''} /></label>
        <label>{copy.status}<select name="status" aria-label={copy.status} defaultValue={item.status}>
          <option value="scheduled">{copy.scheduled}</option><option value="confirmed">{copy.confirmed}</option>
          <option value="completed">{copy.completed}</option><option value="cancelled">{copy.cancelled}</option>
        </select></label>
      </div>
      <button className="pro-primary" type="submit">{pending ? copy.saving : copy.saveAppointment}</button>
    </fieldset>
  </form>;
}

function JourneyForm({ item, copy, pending, save }: { item: JourneyEvent; copy: Copy; pending: boolean; save: (input: Omit<JourneyEvent, 'id'>) => Promise<boolean> }) {
  return <form className="mobile-editor" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void save({ title: textField(data, 'title'), description: textField(data, 'description'),
      occurredAt: new Date(textField(data, 'occurredAt')).toISOString(), status: textField(data, 'status') as JourneyEvent['status'] });
  }}>
    <fieldset disabled={pending}>
      <legend className="font-semibold mb-3">{item.title}</legend>
      <div className="mobile-field-grid">
        <label>{copy.titleLabel}<input name="title" required maxLength={200} defaultValue={item.title} /></label>
        <label>{copy.status}<select name="status" aria-label={copy.status} defaultValue={item.status}>
          <option value="completed">{copy.completed}</option><option value="current">{copy.current}</option><option value="planned">{copy.planned}</option>
        </select></label>
        <label className="mobile-field-wide">{copy.description}<textarea name="description" required maxLength={3000} rows={3} defaultValue={item.description} /></label>
        <label>{copy.date}<input name="occurredAt" type="datetime-local" required defaultValue={localDateTime(item.occurredAt)} /><small>{copy.localTime}</small></label>
      </div>
      <button type="submit" className="pro-primary">{pending ? copy.saving : copy.saveJourney}</button>
    </fieldset>
  </form>;
}

export function MobileIntegrationPanel({ paciente, usuario }: { paciente: PacientePro; usuario: UsuarioEquipe }) {
  const [locale, setLocale] = useState<Locale>('pt-BR');
  const copy = COPY[locale];
  const [data, setData] = useState<MobileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [now, setNow] = useState(Date.now());
  const active = useRef(true);
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const path = `/api/pro/pacientes/${encodeURIComponent(paciente.id)}`;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await chamarApi<MobileData>(`${path}/mobile-data`, usuario.id, undefined, { signal });
    if (active.current && !signal?.aborted) setData(next);
  }, [path, usuario.id]);

  useEffect(() => {
    active.current = true;
    const abort = new AbortController();
    controller.current = abort;
    void refresh(abort.signal).catch((e: Error) => { if (!abort.signal.aborted) setError(e.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { active.current = false; abort.abort(); };
  }, [refresh]);

  useEffect(() => {
    if (!pairing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  // A synchronous lock also blocks two clicks before React renders the disabled button.
  const mutate = async (key: string, suffix: string, input: unknown, acknowledgement: string): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true;
    setPending(key); setError(''); setNotice('');
    try {
      await chamarApi<{ ok: true }>(`${path}/${suffix}`, usuario.id, input, { signal: controller.current?.signal });
      if (!active.current) return false;
      setNotice(acknowledgement);
      // Publication already succeeded. A failed refresh must not invite resubmission.
      try { await refresh(controller.current?.signal); }
      catch { if (active.current) setError(locale === 'pt-BR' ? 'A ação foi salva. Não conseguimos atualizar a lista; use Atualizar dados.' : 'The action was saved. The list could not refresh; use Refresh data.'); }
      return true;
    } catch (e) {
      if (active.current) setError((e as Error).message || copy.failure);
      return false;
    } finally {
      lock.current = false;
      if (active.current) setPending(null);
    }
  };

  const generate = async () => {
    if (lock.current) return;
    lock.current = true; setPending('pair'); setError(''); setNotice(''); setPairing(null);
    try {
      const result = await chamarApi<Pairing>(`${path}/mobile-pairing`, usuario.id, {}, { signal: controller.current?.signal });
      if (active.current) { setPairing(result); setNow(Date.now()); setNotice(copy.paired); }
    } catch (e) { if (active.current) setError((e as Error).message || copy.failure); }
    finally { lock.current = false; if (active.current) setPending(null); }
  };

  const reload = async () => {
    if (lock.current) return;
    lock.current = true; setLoading(true); setError('');
    try { await refresh(controller.current?.signal); }
    catch (e) { if (active.current) setError((e as Error).message || copy.failure); }
    finally { lock.current = false; if (active.current) setLoading(false); }
  };

  const disabled = Boolean(pending) || loading;
  const expired = pairing ? Date.parse(pairing.expiresAt) <= now : false;

  return <div className="mobile-integration" lang={locale} data-testid="mobile-integration">
    <div className="mobile-integration-heading">
      <div><p className="pro-eyebrow">OncoFlow · Pro + Paciente</p><h3>{copy.title}</h3><p>{copy.subtitle}</p></div>
      <label className="mobile-language">{copy.language}<select aria-label={copy.language} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}><option value="pt-BR">Português</option><option value="en-US">English</option></select></label>
    </div>
    <p className="mobile-demo"><span aria-hidden className="demo-dot" />{copy.demo}</p>
    {error && <div role="alert" className="mobile-feedback is-error">{error}</div>}
    {notice && <div role="status" className="mobile-feedback"><CheckCircle2 size={19} aria-hidden /><span>{notice}</span></div>}

    <section className="mobile-section mobile-pairing" aria-labelledby="mobile-pairing-title">
      <div className="mobile-section-title"><Smartphone aria-hidden size={23} /><h4 id="mobile-pairing-title">{copy.pairTitle}</h4></div>
      <p>{copy.pairIntro}</p>
      <label className="mobile-server-address">{copy.server}<input readOnly value={window.location.origin} aria-describedby="mobile-address-hint" /></label>
      <p id="mobile-address-hint" className="mobile-hint">{copy.addressHint}</p>
      <button type="button" className="pro-primary" disabled={disabled} onClick={() => void generate()} data-testid="generate-pairing"><Link2 size={18} aria-hidden />{pending === 'pair' ? copy.generating : copy.generate}</button>
      {pairing && <div className="mobile-pairing-result">
        <p>{copy.instructions}</p>
        <output aria-label="Pairing code" className="mobile-pairing-code" data-testid="pairing-code">{pairing.code}</output>
        <p>{expired ? copy.codeExpired : `${copy.expires}: ${new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(pairing.expiresAt))}`}</p>
      </div>}
      <a className="mobile-app-link" href="/app/" target="_blank" rel="noopener"><Smartphone size={17} aria-hidden />{copy.openApp}</a>
    </section>

    <button className="pro-secondary" type="button" disabled={disabled} onClick={() => void reload()}><RefreshCw size={17} aria-hidden />{loading ? copy.loading : copy.refresh}</button>
    {loading && !data && <p role="status">{copy.loading}</p>}
    {data && <>
      <section className="mobile-section" aria-labelledby="mobile-agenda-title">
        <div className="mobile-section-title"><CalendarDays size={22} aria-hidden /><h4 id="mobile-agenda-title">{copy.schedule}</h4></div><p>{copy.scheduleHint}</p>
        {data.appointments.length === 0 && <p>{copy.noAppointments}</p>}
        {data.appointments.map((item) => <AppointmentForm key={JSON.stringify(item)} item={item} copy={copy} pending={disabled}
          save={(input) => mutate(`agenda-${item.id}`, `agenda/${encodeURIComponent(item.id)}`, input, copy.savedAppointment)} />)}
      </section>
      <section className="mobile-section" aria-labelledby="mobile-journey-title">
        <div className="mobile-section-title"><Route size={22} aria-hidden /><h4 id="mobile-journey-title">{copy.journey}</h4></div><p>{copy.journeyHint}</p>
        {data.journey.length === 0 && <p>{copy.noJourney}</p>}
        {data.journey.map((item) => <JourneyForm key={JSON.stringify(item)} item={item} copy={copy} pending={disabled}
          save={(input) => mutate(`journey-${item.id}`, `journey/${encodeURIComponent(item.id)}`, input, copy.savedJourney)} />)}
      </section>
      <section className="mobile-section" aria-labelledby="mobile-documents-title">
        <div className="mobile-section-title"><FileText size={22} aria-hidden /><h4 id="mobile-documents-title">{copy.documents}</h4></div><p>{copy.documentHint}</p>
        <form className="mobile-editor" data-testid="publish-document" onSubmit={async (event) => {
          event.preventDefault(); const form = event.currentTarget; const input = new FormData(form);
          const succeeded = await mutate('document', 'documents', { title: textField(input, 'title'), typeLabel: textField(input, 'typeLabel'),
            issuedAt: new Date().toISOString(), body: textField(input, 'body').split(/\n\s*\n/).filter(Boolean), publish: true }, copy.published);
          if (succeeded && active.current) form.reset();
        }}>
          <fieldset disabled={disabled}>
            <div className="mobile-field-grid">
              <label>{copy.titleLabel}<input name="title" required maxLength={200} /></label>
              <label>{copy.type}<select name="typeLabel" aria-label={copy.type} required defaultValue="Orientação"><option value="Orientação">{locale === 'pt-BR' ? 'Orientação' : 'Guidance'}</option><option value="Resultado">{locale === 'pt-BR' ? 'Resultado' : 'Result'}</option></select></label>
              <label className="mobile-field-wide">{copy.body}<textarea name="body" required rows={5} maxLength={20000} /><small>{copy.bodyHint}</small></label>
            </div>
            <label className="mobile-approval"><input type="checkbox" required name="approval" /><span>{copy.approval}</span></label>
            <button type="submit" className="pro-primary">{pending === 'document' ? copy.saving : copy.publish}</button>
          </fieldset>
        </form>
        {data.documents.length === 0 && <p>{copy.noDocuments}</p>}
        {data.documents.map((document) => <article className="mobile-document" key={document.id}>
          <span className={`mobile-publication-status ${document.published ? 'is-published' : ''}`}>{document.published ? copy.released : copy.draft}</span>
          <h5>{document.title}</h5><p>{document.typeLabel} · {document.authorLabel}</p>
          {document.body.map((paragraph, index) => <p key={index} className="mobile-document-text">{paragraph}</p>)}
          {!document.published && <button className="pro-secondary" disabled={disabled} type="button" onClick={() => void mutate(`publish-${document.id}`, `documents/${encodeURIComponent(document.id)}/publish`, { publish: true }, copy.published)}>{copy.publishDraft}</button>}
        </article>)}
      </section>
    </>}
  </div>;
}
