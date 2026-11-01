/** Cliente HTTP da API do OncoFlow. Cada app guarda o próprio token (chave separada por app). */

export type AppOncoFlow = "pro" | "paciente";

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

const chaveToken = (app: AppOncoFlow) => `oncoflow.${app}.token`;

// sessionStorage pode falhar (aba privada, armazenamento bloqueado): sem token, a pessoa entra de novo
export function lerToken(app: AppOncoFlow): string | null {
  try {
    return sessionStorage.getItem(chaveToken(app));
  } catch {
    return null;
  }
}

export function salvarToken(app: AppOncoFlow, token: string | null): void {
  try {
    if (token) sessionStorage.setItem(chaveToken(app), token);
    else sessionStorage.removeItem(chaveToken(app));
  } catch {
    /* segue sem persistir */
  }
  window.dispatchEvent(new CustomEvent("oncoflow:sessao", { detail: app }));
}

export async function chamarApi<T>(app: AppOncoFlow, caminho: string, init: RequestInit = {}): Promise<T> {
  const token = lerToken(app);
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ErroApi(0, "sem_conexao", "Não conseguimos conectar agora. Verifique a conexão e tente de novo.");
  }
  if (resposta.status === 401) salvarToken(app, null);
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new ErroApi(
      resposta.status,
      corpo?.erro ?? "erro",
      corpo?.mensagem ?? "Não conseguimos carregar agora. Tente de novo em instantes.",
    );
  }
  return resposta.json() as Promise<T>;
}
