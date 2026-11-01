import "@oncoflow/shared/estilos.css";

import { ErroApi, Sessao } from "@oncoflow/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { VisaoGeral } from "./VisaoGeral";

const clienteConsultas = new QueryClient({
  defaultOptions: {
    queries: {
      // Repetir só falha de rede ou de servidor: 401/403/404 não mudam numa nova tentativa
      retry: (tentativas, erro) =>
        tentativas < 1 && (!(erro instanceof ErroApi) || erro.status === 0 || erro.status >= 500),
      refetchOnWindowFocus: false,
    },
  },
});

// Troca de usuário: zera os dados em cache e busca de novo — dados de um perfil nunca aparecem para outro.
// Reset da demo: mesmo usuário, só recarrega.
window.addEventListener("oncoflow:sessao", () => void clienteConsultas.resetQueries());
window.addEventListener("oncoflow:reset", () => void clienteConsultas.invalidateQueries());

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsultas}>
      <Sessao app="pro">
        <VisaoGeral />
      </Sessao>
    </QueryClientProvider>
  </StrictMode>,
);
