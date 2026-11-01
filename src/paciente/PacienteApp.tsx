// OncoFlow Paciente: app mobile-first da paciente, híbrido entre navegação visual e a Lia.
// Na demo roda em /paciente com a sessão fictícia da Maria.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { transcrever, usePaciente } from './api';
import { useFala, useGravador } from './voz';
import { TelaAgenda, TelaComoEstou, TelaDocumentos, TelaInicio, TelaJornada, type Tela } from './telas';
import { TelaLia } from './TelaLia';

type TamanhoFonte = 'normal' | 'grande' | 'muito-grande';

interface Preferencias {
  fonte: TamanhoFonte;
  velocidade: number;
  lerRespostas: boolean;
}

const PREFERENCIAS_PADRAO: Preferencias = { fonte: 'normal', velocidade: 1, lerRespostas: false };
const CHAVE_PREFERENCIAS = 'oncoflow-paciente-preferencias';
const ESCALA_FONTE: Record<TamanhoFonte, string> = { normal: '112.5%', grande: '125%', 'muito-grande': '137.5%' };

function lerPreferencias(): Preferencias {
  try {
    const salvo = localStorage.getItem(CHAVE_PREFERENCIAS);
    return salvo ? { ...PREFERENCIAS_PADRAO, ...JSON.parse(salvo) } : PREFERENCIAS_PADRAO;
  } catch {
    return PREFERENCIAS_PADRAO;
  }
}

export default function PacienteApp() {
  const { inicio, erro, ocupado, enviar, responder, checkin } = usePaciente();
  const gravador = useGravador();
  const fala = useFala();
  const [tela, setTela] = useState<Tela>('inicio');
  const [documentoId, setDocumentoId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferencias>(lerPreferencias);
  const [prefsAbertas, setPrefsAbertas] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [erroVoz, setErroVoz] = useState<string | null>(null);
  const [modoLia, setModoLia] = useState<'voz' | 'texto'>('voz');
  const operacaoVoz = useRef(0);
  const cancelarVoz = useCallback(() => {
    operacaoVoz.current += 1;
    gravador.cancelar();
    setTranscrevendo(false);
    setErroVoz(null);
  }, [gravador.cancelar]);

  // Tipografia ajustável no app (padrão 18 px), sem impedir o zoom do sistema.
  useEffect(() => {
    document.documentElement.style.fontSize = ESCALA_FONTE[prefs.fonte];
    try {
      localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(prefs));
    } catch {
      // Preferências só não persistem entre visitas.
    }
  }, [prefs]);

  const irPara = useCallback(
    (destino: Tela, modo: 'voz' | 'texto' = 'voz') => {
      fala.parar();
      cancelarVoz();
      if (destino === 'lia') setModoLia(modo);
      setErroVoz(null);
      setTela(destino);
      window.scrollTo({ top: 0 });
    },
    [fala.parar, cancelarVoz]
  );

  const falar = useCallback((texto: string) => fala.falar(texto, prefs.velocidade), [fala, prefs.velocidade]);
  const falaComVelocidade = useMemo(
    () => ({ falando: fala.falando, disponivel: fala.disponivel, nivel: fala.nivel, falar, parar: fala.parar }),
    [fala.falando, fala.disponivel, fala.nivel, falar, fala.parar]
  );

  // Late permission/transcription results cannot send a message after cancellation or navigation.
  const alternarGravacao = useCallback(async (aoTranscrever: (texto: string) => void) => {
    if (gravador.iniciando || transcrevendo) return;
    const operacao = ++operacaoVoz.current;
    setErroVoz(null);
    if (gravador.gravando) {
      setTranscrevendo(true);
      try {
        const audio = await gravador.parar();
        if (operacao !== operacaoVoz.current) return;
        const texto = audio ? await transcrever(audio.base64, audio.mimeType) : null;
        if (operacao !== operacaoVoz.current) return;
        if (texto) aoTranscrever(texto);
        else setErroVoz("I couldn't transcribe that right now. You can try again or type your message.");
      } catch {
        if (operacao === operacaoVoz.current) setErroVoz("I couldn't transcribe that right now. You can try again or type your message.");
      } finally {
        if (operacao === operacaoVoz.current) setTranscrevendo(false);
      }
      return;
    }
    const ok = await gravador.iniciar();
    if (operacao === operacaoVoz.current && !ok) setErroVoz("I couldn't use the microphone. Check the permission or keep typing.");
  }, [gravador.iniciando, gravador.gravando, gravador.iniciar, gravador.parar, transcrevendo]);

  const gravacao = {
    iniciando: gravador.iniciando,
    nivel: gravador.nivel,
    gravando: gravador.gravando,
    transcrevendo,
    erro: erroVoz,
    alternar: alternarGravacao,
    cancelar: cancelarVoz,
  };

  const pedirLia = (texto: string) => {
    irPara('lia', 'texto');
    enviar(texto, 'texto');
  };

  return (
    <div className="patient-app">
      <div className="patient-frame">
        {erro && (
          <div role="alert" className="mt-3 flex items-center gap-2 rounded-xl bg-atencao-fundo border border-atencao-borda text-atencao px-3 py-2">
            <AlertCircle className="w-5 h-5 shrink-0" aria-hidden />
            {erro}
          </div>
        )}

        {!inicio ? (
          <p className="py-10 text-center text-tinta-suave">Loading…</p>
        ) : tela === 'inicio' ? (
          <TelaInicio inicio={inicio} irPara={irPara} onPreferencias={() => setPrefsAbertas(true)} />
        ) : tela === 'jornada' ? (
          <TelaJornada inicio={inicio} onVoltar={() => irPara('inicio')} />
        ) : tela === 'agenda' ? (
          <TelaAgenda inicio={inicio} onVoltar={() => irPara('inicio')} onOuvir={falar} onPedirLia={pedirLia} />
        ) : tela === 'documentos' ? (
          <TelaDocumentos
            inicio={inicio}
            documentoId={documentoId}
            onAbrir={setDocumentoId}
            onVoltar={() => irPara('inicio')}
            onOuvir={falar}
          />
        ) : tela === 'como-estou' ? (
          <TelaComoEstou
            inicio={inicio}
            ocupado={ocupado}
            onVoltar={() => irPara('inicio')}
            onEnviar={checkin}
            onFalarComLia={() => irPara('lia')}
            gravacao={gravacao}
          />
        ) : (
          <TelaLia
            modoInicial={modoLia}
            inicio={inicio}
            ocupado={ocupado}
            onVoltar={() => irPara('inicio')}
            enviar={enviar}
            responder={responder}
            irPara={irPara}
            abrirDocumento={(id) => {
              setDocumentoId(id);
              irPara('documentos');
            }}
            fala={falaComVelocidade}
            lerRespostas={prefs.lerRespostas}
            gravacao={gravacao}
          />
        )}
      </div>

      {prefsAbertas && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="titulo-prefs">
          <div className="w-full max-w-[440px] bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[max(20px,env(safe-area-inset-bottom))] space-y-5">
            <div className="flex items-center justify-between">
              <h2 id="titulo-prefs" className="text-lg font-bold text-azul">
                Reading and voice
              </h2>
              <button type="button" onClick={() => setPrefsAbertas(false)} aria-label="Close" className="min-w-11 min-h-11 flex items-center justify-center cursor-pointer">
                <X className="w-6 h-6" aria-hidden />
              </button>
            </div>

            <fieldset className="space-y-2">
              <legend className="font-semibold text-azul mb-1">Text size</legend>
              {(
                [
                  ['normal', 'Normal'],
                  ['grande', 'Large'],
                  ['muito-grande', 'Extra large'],
                ] as const
              ).map(([valor, rotulo]) => (
                <label key={valor} className="flex items-center gap-3 min-h-11 cursor-pointer">
                  <input
                    type="radio"
                    name="fonte"
                    checked={prefs.fonte === valor}
                    onChange={() => setPrefs({ ...prefs, fonte: valor })}
                    className="w-5 h-5 accent-verde"
                  />
                  {rotulo}
                </label>
              ))}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="font-semibold text-azul mb-1">Voice speed</legend>
              <div className="flex gap-2">
                {[0.75, 1, 1.25].map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={prefs.velocidade === v}
                    onClick={() => setPrefs({ ...prefs, velocidade: v })}
                    className={`flex-1 min-h-11 rounded-xl border-2 font-semibold cursor-pointer ${
                      prefs.velocidade === v ? 'border-verde bg-gelo text-azul' : 'border-linha text-azul'
                    }`}
                  >
                    {String(v)}×
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="flex items-center justify-between gap-3 min-h-11 cursor-pointer">
              <span className="font-semibold text-azul">Read Lia's replies aloud</span>
              <input
                type="checkbox"
                checked={prefs.lerRespostas}
                onChange={(e) => setPrefs({ ...prefs, lerRespostas: e.target.checked })}
                className="w-6 h-6 accent-verde"
              />
            </label>
            {!fala.disponivel && <p className="text-sm text-tinta-suave">This browser does not support reading aloud.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
