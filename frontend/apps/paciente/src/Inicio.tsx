import { formatarDataHora } from "@oncoflow/shared";
import { useState } from "react";

import { useApi } from "./useApi";

interface Etapa {
  id: string;
  titulo: string;
  estado: string;
  descricao: string | null;
}

interface InicioApi {
  nome_exibicao: string;
  assistente_nome: string;
  proximo_compromisso: {
    titulo: string;
    inicio: string;
    local: string | null;
    preparo_titulo: string | null;
    preparo_texto: string | null;
  } | null;
  jornada: { concluidas: number; cadastradas: number; percentual: number; etapas: Etapa[] };
}

// Estado sempre com ícone + texto (nunca só cor), nos termos do documento de produto
const ESTADO_ETAPA: Record<string, { rotulo: string; icone: string; estilo: string }> = {
  concluida: { rotulo: "Concluído", icone: "✓", estilo: "bg-estado-sucesso-fundo text-estado-sucesso" },
  em_andamento: { rotulo: "Em andamento", icone: "◐", estilo: "bg-marca-gelo text-marca-azul" },
  proxima: { rotulo: "Próxima etapa", icone: "→", estilo: "bg-marca-gelo text-marca-azul" },
  aguardando: { rotulo: "Aguardando", icone: "…", estilo: "bg-white text-texto-suave border border-texto-suave/30" },
  futura: { rotulo: "Futuro", icone: "○", estilo: "bg-white text-texto-suave border border-texto-suave/30" },
};

function saudacao(agora = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(agora),
  );
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

export function Inicio() {
  const inicio = useApi<InicioApi>("/api/paciente/inicio");

  if (inicio.status === "carregando") {
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 py-6" aria-busy="true" aria-label="Carregando sua jornada">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-marca-gelo" />
        ))}
      </main>
    );
  }
  if (inicio.status === "erro") {
    return (
      <main className="mx-auto max-w-md px-4 py-6">
        <div role="alert" className="rounded-2xl bg-estado-erro-fundo p-5 text-lg text-estado-erro">
          <p>{inicio.mensagem}</p>
          <button type="button" onClick={inicio.recarregar} className="mt-3 min-h-12 font-semibold underline">
            Tentar de novo
          </button>
        </div>
      </main>
    );
  }

  const { nome_exibicao, assistente_nome, proximo_compromisso, jornada } = inicio.dados;
  return (
    <div className="min-h-screen bg-white text-lg">
      <header className="bg-marca-azul px-5 pb-6 pt-5 text-white">
        <p className="text-base font-semibold">OncoFlow</p>
        <h1 className="mt-3 text-2xl font-semibold">
          {saudacao()}, {nome_exibicao}
        </h1>
        <p className="mt-1">Você tem apoio em cada etapa.</p>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-4 py-6">
        <ProximaConsulta compromisso={proximo_compromisso} />
        <MinhaJornada jornada={jornada} />

        <nav aria-label="Outras áreas" className="grid gap-3">
          {/* Ainda não construídas: aparecem desabilitadas, sem fingir que funcionam */}
          {["Como estou?", "Minha agenda", "Meus documentos"].map((area) => (
            <button
              key={area}
              type="button"
              disabled
              className="flex min-h-14 items-center justify-between rounded-2xl border border-texto-suave/30 px-5 text-left text-texto-suave"
            >
              <span className="font-semibold">{area}</span>
              <span className="text-base">Em breve</span>
            </button>
          ))}
          <button
            type="button"
            disabled
            className="flex min-h-16 items-center gap-4 rounded-2xl bg-marca-azul px-5 text-left text-white disabled:opacity-80"
          >
            <span aria-hidden="true" className="h-9 w-9 rounded-full bg-gradient-to-br from-marca-turquesa to-marca-verde" />
            <span>
              <span className="block font-semibold">Falar com a {assistente_nome}</span>
              <span className="block text-base">Em breve</span>
            </span>
          </button>
        </nav>
      </main>
    </div>
  );
}

function ProximaConsulta({ compromisso }: { compromisso: InicioApi["proximo_compromisso"] }) {
  const [preparoAberto, setPreparoAberto] = useState(false);

  if (!compromisso) {
    return (
      <section aria-labelledby="titulo-proxima" className="rounded-2xl bg-marca-gelo p-5">
        <h2 id="titulo-proxima" className="text-base font-semibold text-texto-suave">Próxima consulta</h2>
        <p className="mt-2">Nenhum compromisso marcado no momento.</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="titulo-proxima" className="rounded-2xl bg-marca-gelo p-5">
      <h2 id="titulo-proxima" className="text-base font-semibold text-texto-suave">Próxima consulta</h2>
      <p className="mt-2 text-xl font-semibold">{compromisso.titulo}</p>
      <p className="mt-1 first-letter:uppercase">{formatarDataHora(compromisso.inicio)}</p>
      {compromisso.local && <p className="mt-1 text-texto-suave">{compromisso.local}</p>}
      {compromisso.preparo_texto && (
        <div className="mt-4">
          <button
            type="button"
            aria-expanded={preparoAberto}
            onClick={() => setPreparoAberto((v) => !v)}
            className="min-h-12 font-semibold text-marca-azul underline"
          >
            Como me preparar
          </button>
          {preparoAberto && <p className="mt-2 rounded-xl bg-white p-4">{compromisso.preparo_texto}</p>}
        </div>
      )}
    </section>
  );
}

function MinhaJornada({ jornada }: { jornada: InicioApi["jornada"] }) {
  return (
    <section aria-labelledby="titulo-jornada" className="rounded-2xl border border-marca-gelo p-5 shadow-sm">
      <h2 id="titulo-jornada" className="text-xl font-semibold">Minha jornada</h2>
      <p className="mt-2">
        <span className="text-2xl font-semibold tabular-nums">{jornada.percentual}%</span>
        <span className="text-texto-suave"> · Etapas cadastradas concluídas</span>
      </p>
      <div
        role="progressbar"
        aria-valuenow={jornada.percentual}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Etapas cadastradas concluídas"
        className="mt-2 h-3 rounded-full bg-marca-gelo"
      >
        <div className="h-3 rounded-full bg-marca-verde" style={{ width: `${jornada.percentual}%` }} />
      </div>

      <ol className="mt-5 space-y-3">
        {jornada.etapas.map((etapa) => {
          const estado = ESTADO_ETAPA[etapa.estado] ?? ESTADO_ETAPA.futura;
          return (
            <li key={etapa.id} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold ${estado.estilo}`}
              >
                {estado.icone}
              </span>
              <div>
                <p className="font-semibold">{etapa.titulo}</p>
                <p className="text-base text-texto-suave">{estado.rotulo}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
