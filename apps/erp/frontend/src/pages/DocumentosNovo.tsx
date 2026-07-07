import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { CertificadoWizard } from '../components/documentos/wizard/CertificadoWizard';
import { TermoFornecedorWizard } from '../components/documentos/wizard/TermoFornecedorWizard';
import { TermoColaboradorWizard } from '../components/documentos/wizard/TermoColaboradorWizard';
import { ArquivarDocumentoPastaModal } from '../components/documentos/ArquivarDocumentoPastaModal';
import { btn } from '../utils/buttonStyles';
import { TERMO_CONFIDENCIALIDADE } from '../constants/documentosLabels';
import type { DocumentoSalvoInfo } from '../types/documentoSalvo';

type TipoDocumento = 'certificado' | 'fornecedor' | 'estagiario';

const TIPOS_VALIDOS: TipoDocumento[] = ['certificado', 'fornecedor', 'estagiario'];

const TIPO_LABEL: Record<TipoDocumento, string> = {
  certificado: 'Certificado de Programa',
  fornecedor: 'Termo de Fornecedor',
  estagiario: TERMO_CONFIDENCIALIDADE.titulo,
};

const TIPO_ICON: Record<TipoDocumento, string> = {
  certificado: '📜',
  fornecedor: '🤝',
  estagiario: TERMO_CONFIDENCIALIDADE.icone,
};

function isTipoValido(tipo: string | undefined): tipo is TipoDocumento {
  return !!tipo && TIPOS_VALIDOS.includes(tipo as TipoDocumento);
}

export default function DocumentosNovo() {
  const { tipo } = useParams<{ tipo: string }>();
  const navigate = useNavigate();
  const [arquivar, setArquivar] = useState<DocumentoSalvoInfo | null>(null);

  if (!isTipoValido(tipo)) {
    return <Navigate to="/documentos" replace />;
  }

  const voltar = () => navigate('/documentos');
  const irDocumentos = () => navigate('/documentos');

  const onSalvo = (doc?: DocumentoSalvoInfo) => {
    if (doc) setArquivar(doc);
    else irDocumentos();
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {arquivar && (
        <ArquivarDocumentoPastaModal documento={arquivar} onConcluido={irDocumentos} />
      )}

      <button type="button" onClick={voltar} className={`${btn.secondary} self-start`}>
        ← Voltar para Documentos
      </button>

      <div className="rounded-xl border border-white/20 bg-neutral p-6 shadow-xl">
        <h2 className="mb-6 text-lg font-semibold text-white">
          {TIPO_ICON[tipo]} Novo {TIPO_LABEL[tipo]}
        </h2>

        {tipo === 'certificado' && <CertificadoWizard onClose={voltar} onSalvo={onSalvo} />}
        {tipo === 'fornecedor' && <TermoFornecedorWizard onClose={voltar} onSalvo={onSalvo} />}
        {tipo === 'estagiario' && <TermoColaboradorWizard onClose={voltar} onSalvo={onSalvo} />}
      </div>
    </div>
  );
}
