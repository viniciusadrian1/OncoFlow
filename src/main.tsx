import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './visual-refresh.css';
import './lia-identity.css';
import './pro-connected.css';

// Duas experiências sobre a mesma plataforma: a equipe usa o OncoFlow Pro (base IRIS) e o
// paciente usa o OncoFlow Paciente em /paciente. Cada uma carrega só o próprio código.
const ProApp = lazy(() => import('./App.tsx'));
const PacienteApp = lazy(() => import('./paciente/PacienteApp.tsx'));

const ehPaciente = window.location.pathname.startsWith('/paciente');
document.title = ehPaciente ? 'OncoFlow Patient' : 'OncoFlow Pro';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{ehPaciente ? <PacienteApp /> : <ProApp />}</Suspense>
  </StrictMode>
);
