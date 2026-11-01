import { chamarApi, formatarRelativo } from "@oncoflow/shared";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

interface PacienteResumo {
  id: string;
  nome_exibicao: string;
  linha_cuidado: string;
  etapa_atual: string | null;
  tarefas_abertas: number;
  tarefas_vencidas: number;
  revisoes_aguardando: number;
  revisoes_atrasadas: number;
  ultimo_checkin: { escala: string; enviado_em: string } | null;
}

interface VisaoGeralApi {
  pacientes: PacienteResumo[];
  dados_ficticios: boolean;
}

const ESCALA: Record<string, string> = {
  muito_bem: "Muito bem",
  bem: "Bem",
  mais_ou_menos: "Mais ou menos",
  mal: "Mal",
  muito_mal: "Muito mal",
};

export function VisaoGeral() {
  const consulta = useQuery({
    queryKey: ["pro", "pacientes"],
    queryFn: () => chamarApi<VisaoGeralApi>("pro", "/api/pro/pacientes"),
  });

  return (
    <div className="min-h-screen bg-marca-gelo">
      <header className="bg-marca-azul px-6 py-4 text-white">
        <p className="text-lg font-semibold">
          OncoFlow <span className="font-normal">Pro</span>
        </p>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold">Visão geral</h1>
          {consulta.isSuccess && consulta.data.dados_ficticios && (
            <span className="rounded-full border border-texto-suave/40 bg-white px-3 py-1 text-sm text-texto-suave">
              Dados fictícios
            </span>
          )}
        </div>

        {consulta.isPending && <Esqueleto />}
        {consulta.isError && (
          <div role="alert" className="rounded-lg bg-estado-erro-fundo p-4 text-estado-erro">
            <p>{consulta.error.message}</p>
            <button type="button" onClick={() => void consulta.refetch()} className="mt-2 font-semibold underline">
              Tentar de novo
            </button>
          </div>
        )}
        {/* Com erro, nunca mostra dados antigos que possam estar no cache */}
        {consulta.isSuccess && consulta.data.pacientes.length === 0 && (
          <p className="rounded-lg bg-white p-6 text-texto-suave">Nenhum paciente acompanhado por você ainda.</p>
        )}
        {consulta.isSuccess && consulta.data.pacientes.length > 0 && <Tabela pacientes={consulta.data.pacientes} />}
      </main>
    </div>
  );
}

function Tabela({ pacientes }: { pacientes: PacienteResumo[] }) {
  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
      <table className="w-full text-left text-[15px]">
        <caption className="sr-only">Pacientes acompanhados, com etapa atual, tarefas e check-ins</caption>
        <thead className="border-b border-marca-gelo text-sm text-texto-suave">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Paciente</th>
            <th scope="col" className="px-4 py-3 font-medium">Etapa atual</th>
            <th scope="col" className="px-4 py-3 font-medium">Tarefas</th>
            <th scope="col" className="px-4 py-3 font-medium">Check-ins aguardando revisão</th>
            <th scope="col" className="px-4 py-3 font-medium">Último check-in</th>
          </tr>
        </thead>
        <tbody>
          {pacientes.map((p) => (
            <tr key={p.id} className="border-b border-marca-gelo last:border-0">
              <th scope="row" className="px-4 py-3 font-semibold">
                {p.nome_exibicao}
                <span className="block text-sm font-normal capitalize text-texto-suave">{p.linha_cuidado}</span>
              </th>
              <td className="px-4 py-3">{p.etapa_atual ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums">
                <span>{p.tarefas_abertas} {p.tarefas_abertas === 1 ? "aberta" : "abertas"}</span>
                {p.tarefas_vencidas > 0 && (
                  <Sinal tipo="erro">
                    {p.tarefas_vencidas} {p.tarefas_vencidas === 1 ? "vencida" : "vencidas"}
                  </Sinal>
                )}
              </td>
              <td className="px-4 py-3 tabular-nums">
                {p.revisoes_aguardando === 0 ? (
                  <span className="text-texto-suave">Nenhum</span>
                ) : (
                  <>
                    <span>{p.revisoes_aguardando} aguardando</span>
                    {p.revisoes_atrasadas > 0 && <Sinal tipo="atencao">{p.revisoes_atrasadas} fora do prazo</Sinal>}
                  </>
                )}
              </td>
              <td className="px-4 py-3">
                {p.ultimo_checkin ? (
                  <>
                    {ESCALA[p.ultimo_checkin.escala] ?? p.ultimo_checkin.escala}
                    <span className="block text-sm text-texto-suave">{formatarRelativo(p.ultimo_checkin.enviado_em)}</span>
                  </>
                ) : (
                  <span className="text-texto-suave">Sem registro</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Estado sempre com ícone + texto, nunca só cor. */
function Sinal({ tipo, children }: { tipo: "erro" | "atencao"; children: ReactNode }) {
  const estilo = tipo === "erro" ? "bg-estado-erro-fundo text-estado-erro" : "bg-estado-atencao-fundo text-estado-atencao";
  return (
    <span className={`ml-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm font-medium ${estilo}`}>
      <span aria-hidden="true">{tipo === "erro" ? "⚠" : "⏱"}</span>
      {children}
    </span>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Carregando pacientes">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-white" />
      ))}
    </div>
  );
}
