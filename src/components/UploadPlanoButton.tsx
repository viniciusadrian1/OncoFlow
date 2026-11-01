import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, Check, AlertCircle } from 'lucide-react';

interface UploadPlanoButtonProps {
  pacienteId: string;
  pacienteNome: string;
  onPlanoAtualizado: (pacienteId: string, novoTexto: string, dataHoraAtualizada: string) => void;
  className?: string;
}

export const UploadPlanoButton: React.FC<UploadPlanoButtonProps> = ({
  pacienteId,
  pacienteNome,
  onPlanoAtualizado,
  className = '',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [carregando, setCarregando] = useState(false);
  const [sucessoTemporario, setSucessoTemporario] = useState(false);

  const formatarDataHoraAtual = () => {
    const agora = new Date();
    const dia = String(agora.getDate()).padStart(2, '0');
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const ano = agora.getFullYear();
    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');
    return `${mes}/${dia}/${ano} ${horas}:${minutos}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCarregando(true);

    // =========================================================================
    // [PONTO DE INTEGRAÇÃO COM IA E EXTRAÇÃO AUTOMÁTICA DE SINAIS DE ALARME]
    //
    // Na versão futura:
    // 1. O input aceitará arquivos de prontuário em .pdf e .docx além de .txt.
    // 2. O backend com Gemini AI fará a leitura e parsing estruturado:
    //    - Extração automática de sinais de alarme específicos daquele esquema
    //    - Definição das toxicidades esperadas por janela de dias (nadir D7-D10, etc.)
    //    - Extração de medicações de resgate e plano individualizado
    // 3. Uma tela intermediária de confirmação médica será apresentada ao
    //    oncologista antes que o novo plano e regras de triagem entrem em vigor.
    //
    // Por enquanto, nesta fase de esqueleto/protótipo, a leitura é feita com
    // FileReader e a substituição do campo planoTerapeuticoTexto é direta em memória.
    // =========================================================================

    const reader = new FileReader();

    reader.onload = (event) => {
      const conteudo = event.target?.result as string;
      if (conteudo && conteudo.trim()) {
        const timestamp = formatarDataHoraAtual();
        onPlanoAtualizado(pacienteId, conteudo.trim(), timestamp);
        setSucessoTemporario(true);
        setTimeout(() => setSucessoTemporario(false), 3000);
      }
      setCarregando(false);
      // Reset input value so same file can be selected again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      console.error('Failed to read the treatment plan file');
      setCarregando(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    reader.readAsText(file, 'UTF-8');
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="inline-block">
      {/* Hidden file input: currently accepting .txt (futuramente aceitará .pdf e .docx) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,text/plain"
        onChange={handleFileChange}
        className="hidden"
        id={`upload-plano-input-${pacienteId}`}
      />

      <button
        type="button"
        id={`btn-atualizar-plano-${pacienteId}`}
        onClick={handleClick}
        disabled={carregando}
        title="Attach a new treatment plan file (.txt)"
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-2xs ${
          sucessoTemporario
            ? 'bg-gelo text-azul border-verde'
            : 'bg-white hover:bg-gelo text-azul border-linha hover:border-verde/50'
        } ${className}`}
      >
        {sucessoTemporario ? (
          <>
            <Check className="w-3.5 h-3.5 text-verde" />
            <span>Plan updated!</span>
          </>
        ) : carregando ? (
          <>
            <span className="w-3 h-3 border-2 border-verde border-t-transparent rounded-full animate-spin" />
            <span>Reading file...</span>
          </>
        ) : (
          <>
            <UploadCloud className="w-3.5 h-3.5 text-verde" />
            <span>Update treatment plan</span>
          </>
        )}
      </button>
    </div>
  );
};
