import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiPublico } from '../services/api';
import { TermoColaboradorWizard } from '../components/documentos/wizard/TermoColaboradorWizard';
import { TermoFornecedorWizard } from '../components/documentos/wizard/TermoFornecedorWizard';
import { TERMO_CONFIDENCIALIDADE } from '../constants/documentosLabels';

type Estado = 'validando' | 'pronto' | 'invalido' | 'expirado' | 'usado' | 'enviado';

interface ConviteInfo {
  tipo: 'estagiario' | 'fornecedor';
  titulo: string | null;
  criadoPor: string;
  signatario: string | null;
  expiresAt: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  estagiario: TERMO_CONFIDENCIALIDADE.titulo,
  fornecedor: 'Termo de Fornecedor',
};

export default function DocumentosPublico() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<Estado>('validando');
  const [info, setInfo] = useState<ConviteInfo | null>(null);
  const [erroMsg, setErroMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setEstado('invalido');
      return;
    }
    apiPublico
      .get<ConviteInfo>(`/documentos-publicos/convite/${token}`)
      .then(({ data }) => {
        setInfo(data);
        setEstado('pronto');
      })
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 410) {
          const msg: string = err?.response?.data?.message ?? '';
          setEstado(msg.toLowerCase().includes('utilizado') ? 'usado' : 'expirado');
        } else {
          setEstado('invalido');
          setErroMsg(err?.response?.data?.message ?? 'Link inválido ou inexistente.');
        }
      });
  }, [token]);

  const uploadFn = async (fd: FormData) => {
    await apiPublico.post(`/documentos-publicos/convite/${token}/upload`, fd);
  };

  const onSalvo = () => setEstado('enviado');

  return (
    <div className="min-h-screen bg-[#0f1117] text-white">
      {/* Header público */}
      <header className="border-b border-white/10 bg-white/3 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-sm font-bold text-primary">
            G
          </div>
          <span className="text-sm font-semibold text-white/80">Globaltec — Documentos</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        {/* Validando */}
        {estado === 'validando' && (
          <div className="flex flex-col items-center gap-4 py-20 text-white/50">
            <span className="animate-spin text-3xl">⟳</span>
            <p className="text-sm">Validando link...</p>
          </div>
        )}

        {/* Link inválido */}
        {estado === 'invalido' && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
            <p className="text-4xl mb-3">🚫</p>
            <p className="font-semibold text-red-300">Link inválido</p>
            <p className="mt-2 text-sm text-red-400/80">{erroMsg || 'Este link não existe ou foi revogado.'}</p>
          </div>
        )}

        {/* Link expirado */}
        {estado === 'expirado' && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-8 text-center">
            <p className="text-4xl mb-3">⏳</p>
            <p className="font-semibold text-yellow-300">Link expirado</p>
            <p className="mt-2 text-sm text-yellow-400/80">
              Este link de preenchimento expirou. Solicite um novo ao responsável da Globaltec.
            </p>
          </div>
        )}

        {/* Já utilizado */}
        {estado === 'usado' && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-8 text-center">
            <p className="text-4xl mb-3">✅</p>
            <p className="font-semibold text-blue-300">Documento já enviado</p>
            <p className="mt-2 text-sm text-blue-400/80">
              Este link já foi utilizado e o documento foi registrado com sucesso. Obrigado!
            </p>
          </div>
        )}

        {/* Enviado com sucesso agora */}
        {estado === 'enviado' && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-8 text-center">
            <p className="text-4xl mb-3">🎉</p>
            <p className="font-semibold text-green-300">Documento enviado com sucesso!</p>
            <p className="mt-2 text-sm text-green-400/80">
              Seu documento foi assinado e registrado na Globaltec. Pode fechar esta página.
            </p>
          </div>
        )}

        {/* Formulário pronto */}
        {estado === 'pronto' && info && (
          <div className="flex flex-col gap-5">
            {/* Cabeçalho informativo */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs font-medium text-white/40 uppercase tracking-wide mb-1">Solicitado por</p>
              <p className="font-semibold text-white">{info.criadoPor} · Globaltec</p>
              {info.signatario && (
                <p className="mt-1 text-sm text-white/70">
                  Colaborador: <span className="font-medium text-white">{info.signatario}</span>
                </p>
              )}
              <p className="mt-2 text-sm text-white/60">
                Preencha os dados abaixo e assine o{' '}
                <span className="font-medium text-white">
                  {info.titulo ?? TIPO_LABEL[info.tipo] ?? 'documento'}
                </span>
                . O documento será enviado automaticamente ao sistema da empresa.
              </p>
              {info.expiresAt && (
                <p className="mt-2 text-xs text-white/40">
                  Válido até {new Date(info.expiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>

            {/* Wizard */}
            <div className="rounded-xl border border-white/15 bg-[#181b23] p-6 shadow-xl">
              {info.tipo === 'estagiario' && (
                <TermoColaboradorWizard
                  onClose={() => {}}
                  onSalvo={onSalvo}
                  uploadFn={uploadFn}
                />
              )}
              {info.tipo === 'fornecedor' && (
                <TermoFornecedorWizard
                  onClose={() => {}}
                  onSalvo={onSalvo}
                  uploadFn={uploadFn}
                />
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-white/20">
        Globaltec Tecnologias Educacionais · Documento oficial
      </footer>
    </div>
  );
}
