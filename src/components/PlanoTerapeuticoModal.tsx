import React from 'react';
import { FileText, Clock, Download, X, Stethoscope, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Paciente } from '../types';

interface PlanoTerapeuticoModalProps {
  paciente: Paciente;
  onFechar: () => void;
}

export const PlanoTerapeuticoModal: React.FC<PlanoTerapeuticoModalProps> = ({
  paciente,
  onFechar,
}) => {
  // Utility to download current plan as .txt for easy testing of upload feature
  const handleDownloadTxt = () => {
    const element = document.createElement('a');
    const file = new Blob([paciente.planoTerapeuticoTexto], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `Treatment_Plan_${paciente.nome.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl border border-linha overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-fundo border-b border-linha flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gelo text-azul flex items-center justify-center border border-verde/30">
              <FileText className="w-5 h-5 text-verde" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-azul">
                  Current Treatment Plan
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gelo text-azul border border-verde/20">
                  {paciente.nome}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-tinta-suave mt-0.5">
                <Clock className="w-3 h-3 text-verde" />
                <span className="font-medium text-azul">
                  {paciente.planoAtualizadoEm ? `Plan updated on ${paciente.planoAtualizadoEm}` : 'Plan not attached yet'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            id="btn-fechar-modal-plano"
            onClick={onFechar}
            className="p-1.5 rounded-lg text-tinta-suave hover:text-azul hover:bg-gelo transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Patient Quick Context Strip */}
        <div className="px-5 py-3 bg-gelo/40 border-b border-verde/20 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-tinta-suave">
              Age: <strong className="text-azul">{paciente.idade} years</strong>
            </span>
            <span className="text-tinta-suave">•</span>
            <span className="text-tinta-suave">
              Cycle: <strong className="text-azul">{paciente.cicloAtual}</strong>
            </span>
            <span className="text-tinta-suave">•</span>
            <span className="text-tinta-suave">
              Performance: <strong className="text-azul">{paciente.ecog}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={handleDownloadTxt}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-azul bg-white hover:bg-gelo border border-linha rounded-md transition-colors cursor-pointer shadow-2xs"
            title="Download a text file with the current plan to test re-uploading"
          >
            <Download className="w-3 h-3 text-verde" />
            <span>Download as .txt</span>
          </button>
        </div>

        {/* Full Text Display Body */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 text-xs sm:text-sm leading-relaxed text-azul bg-white">
          <div className="p-4 bg-fundo rounded-xl border border-linha/80 shadow-2xs font-mono text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap selection:bg-gelo selection:text-azul">
            {paciente.planoTerapeuticoTexto}
          </div>

          {/* Clinical Future Pipeline Notice */}
          <div className="p-3 bg-gelo border border-verde/30 rounded-lg text-xs text-azul flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-verde shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Team document</span>
              This plan is consulted by the team and is not used by Lia to answer the patient. A future AI extraction (warning signs, expected toxicities) would only take effect after being reviewed and approved by a clinician.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-fundo border-t border-linha flex items-center justify-end">
          <button
            type="button"
            onClick={onFechar}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-verde hover:bg-azul rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
