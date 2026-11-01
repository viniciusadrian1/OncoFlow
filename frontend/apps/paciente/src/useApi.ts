import { chamarApi } from "@oncoflow/shared";
import { useCallback, useEffect, useState } from "react";

type Estado<T> = { status: "carregando" } | { status: "erro"; mensagem: string } | { status: "ok"; dados: T };

/** Busca leve para o app do paciente (sem biblioteca de cache: bundle pequeno em rede móvel). */
export function useApi<T>(caminho: string): Estado<T> & { recarregar: () => void } {
  const [estado, setEstado] = useState<Estado<T>>({ status: "carregando" });

  const recarregar = useCallback(() => {
    setEstado({ status: "carregando" });
    chamarApi<T>("paciente", caminho)
      .then((dados) => setEstado({ status: "ok", dados }))
      .catch((e: Error) => setEstado({ status: "erro", mensagem: e.message }));
  }, [caminho]);

  useEffect(() => {
    recarregar();
    window.addEventListener("oncoflow:reset", recarregar);
    window.addEventListener("oncoflow:sessao", recarregar);
    return () => {
      window.removeEventListener("oncoflow:reset", recarregar);
      window.removeEventListener("oncoflow:sessao", recarregar);
    };
  }, [recarregar]);

  return { ...estado, recarregar };
}
