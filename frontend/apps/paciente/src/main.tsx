import "@oncoflow/shared/estilos.css";

import { Sessao } from "@oncoflow/shared";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Inicio } from "./Inicio";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <Sessao app="paciente">
      <Inicio />
    </Sessao>
  </StrictMode>,
);
