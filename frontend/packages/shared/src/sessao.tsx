import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { chamarApi, lerToken, salvarToken, type AppOncoFlow } from "./api";

interface Saude {
  status: string;
  demo: boolean;
}

interface UsuarioDemo {
  id: string;
  nome: string;
  papel: string;
  app: AppOncoFlow;
}

interface Token {
  token: string;
}

const ROTULO_PAPEL: Record<string, string> = {
  medico: "Médica(o)",
  enfermagem: "Enfermagem",
  navegacao: "Navegação",
  gestao: "Gestão",
  paciente: "Paciente",
};

function useToken(app: AppOncoFlow): string | null {
  const [token, setToken] = useState(() => lerToken(app));
  useEffect(() => {
    const atualizar = () => setToken(lerToken(app));
    window.addEventListener("oncoflow:sessao", atualizar);
    return () => window.removeEventListener("oncoflow:sessao", atualizar);
  }, [app]);
  return token;
}

/**
 * Garante uma sessão antes de mostrar o app. No modo demo, mostra a barra de troca de usuário e entra
 * automaticamente com o primeiro usuário do app; fora dele, mostra o formulário de login.
 */
export function Sessao({ app, children }: { app: AppOncoFlow; children: ReactNode }) {
  const token = useToken(app);
  const [demo, setDemo] = useState<boolean | null>(null);

  useEffect(() => {
    chamarApi<Saude>(app, "/api/saude")
      .then((s) => setDemo(s.demo))
      .catch(() => setDemo(false));
  }, [app]);

  if (demo === null) return null;
  return (
    <>
      {demo && <BarraDemo app={app} entrarAutomaticamente={!token} />}
      {token ? children : demo ? null : <FormularioLogin app={app} />}
    </>
  );
}

function BarraDemo({ app, entrarAutomaticamente }: { app: AppOncoFlow; entrarAutomaticamente: boolean }) {
  const [usuarios, setUsuarios] = useState<UsuarioDemo[]>([]);
  const [atual, setAtual] = useState<string>("");
  const [ocupado, setOcupado] = useState(false);

  const entrar = async (id: string) => {
    const { token } = await chamarApi<Token>(app, `/api/demo/entrar/${id}`, { method: "POST" });
    setAtual(id);
    salvarToken(app, token);
  };

  const carregar = async () => {
    const lista = (await chamarApi<UsuarioDemo[]>(app, "/api/demo/usuarios")).filter((u) => u.app === app);
    setUsuarios(lista);
    return lista;
  };

  useEffect(() => {
    carregar().then(async (lista) => {
      if (entrarAutomaticamente) {
        if (lista[0]) await entrar(lista[0].id);
        return;
      }
      // Sessão já existente (recarregou a página): marca no seletor quem está logado
      const eu = await chamarApi<{ nome: string }>(app, "/api/auth/eu").catch(() => null);
      const logado = lista.find((u) => u.nome === eu?.nome);
      if (logado) setAtual(logado.id);
    });
  }, [app]);

  const resetar = async () => {
    setOcupado(true);
    try {
      await chamarApi(app, "/api/demo/reset", { method: "POST" });
      const lista = await carregar();
      const mesmo = lista.find((u) => u.nome === usuarios.find((x) => x.id === atual)?.nome) ?? lista[0];
      if (mesmo) await entrar(mesmo.id); // ids mudam no reset: reentra pelo nome
      window.dispatchEvent(new CustomEvent("oncoflow:reset"));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-estado-atencao/30 bg-estado-atencao-fundo px-4 py-2 text-sm text-estado-atencao">
      <span className="font-semibold">Modo demonstração · dados fictícios</span>
      <label className="flex items-center gap-2">
        <span>Entrar como</span>
        <select
          className="rounded border border-estado-atencao/40 bg-white px-2 py-1 text-texto"
          value={atual}
          onChange={(e) => void entrar(e.target.value)}
        >
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome} · {ROTULO_PAPEL[u.papel] ?? u.papel}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => void resetar()}
        disabled={ocupado}
        className="rounded border border-estado-atencao/40 bg-white px-3 py-1 font-medium text-texto disabled:opacity-60"
      >
        {ocupado ? "Restaurando…" : "Restaurar dados da demo"}
      </button>
    </div>
  );
}

function FormularioLogin({ app }: { app: AppOncoFlow }) {
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    try {
      const { token } = await chamarApi<Token>(app, "/api/auth/entrar", {
        method: "POST",
        body: JSON.stringify({ email: dados.get("email"), senha: dados.get("senha") }),
      });
      salvarToken(app, token);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível entrar.");
    }
  };

  return (
    <main className="mx-auto mt-16 max-w-sm px-4">
      <h1 className="mb-6 text-2xl font-semibold">Entrar no OncoFlow</h1>
      <form onSubmit={enviar} className="space-y-4">
        <label className="block">
          <span className="mb-1 block font-medium">E-mail</span>
          <input name="email" type="email" required autoComplete="username" className="w-full rounded-lg border border-texto-suave px-3 py-3" />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Senha</span>
          <input name="senha" type="password" required autoComplete="current-password" className="w-full rounded-lg border border-texto-suave px-3 py-3" />
        </label>
        {erro && (
          <p role="alert" className="rounded-lg bg-estado-erro-fundo px-3 py-2 text-estado-erro">
            {erro}
          </p>
        )}
        <button type="submit" className="w-full rounded-lg bg-marca-verde px-4 py-3 font-semibold text-white">
          Entrar
        </button>
      </form>
    </main>
  );
}
