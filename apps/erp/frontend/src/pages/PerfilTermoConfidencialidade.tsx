import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { getConfidencialidadeUsuario } from '../services/documentos';
import { TermoColaboradorWizard } from '../components/documentos/wizard/TermoColaboradorWizard';
import { ArquivarDocumentoPastaModal } from '../components/documentos/ArquivarDocumentoPastaModal';
import type { ColaboradorTermoData } from '../components/documentos/pdf/TermoColaboradorPDF';
import type { DocumentoSalvoInfo } from '../types/documentoSalvo';
import { useAuthStore } from '../store/auth';
import { btn } from '../utils/buttonStyles';
import { formatCpfDisplay } from '../utils/cpf';
import { Usuario } from '../types';
import { TERMO_CONFIDENCIALIDADE } from '../constants/documentosLabels';

export default function PerfilTermoConfidencialidade() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const usuarioId = id ? Number.parseInt(id, 10) : NaN;

  const [profile, setProfile] = useState<Usuario | null>(null);
  const [jaAssinado, setJaAssinado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [arquivar, setArquivar] = useState<DocumentoSalvoInfo | null>(null);

  const isOwn = authUser?.id === usuarioId;

  useEffect(() => {
    if (!Number.isFinite(usuarioId) || usuarioId < 1 || !isOwn) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [perfilRes, confRes] = await Promise.all([
          api.get<Usuario>(`/users/${usuarioId}`),
          getConfidencialidadeUsuario(usuarioId),
        ]);
        if (!cancelled) {
          setProfile(perfilRes.data);
          setJaAssinado(Boolean(confRes.documento));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [usuarioId, isOwn]);

  const initialData = useMemo((): Partial<ColaboradorTermoData> | undefined => {
    if (!profile) return undefined;
    return {
      nome: profile.nome ?? '',
      tipoVinculo: 'funcionario' as const,
      ies: profile.formacao ?? '',
      cpf: profile.cpf ? formatCpfDisplay(profile.cpf) : '',
      cidade: '',
      estado: '',
    };
  }, [profile]);

  if (!Number.isFinite(usuarioId) || usuarioId < 1) {
    return <Navigate to="/perfil" replace />;
  }

  if (!isOwn) {
    return <Navigate to={`/perfil/${usuarioId}`} replace />;
  }

  const voltar = () => navigate(`/perfil/${usuarioId}`);
  const onSalvo = (doc?: DocumentoSalvoInfo) => {
    if (doc) setArquivar(doc);
    else navigate(`/perfil/${usuarioId}`);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-sm text-white/50">
        Carregando...
      </div>
    );
  }

  if (jaAssinado) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <button type="button" onClick={voltar} className={`${btn.secondary} self-start`}>
          ← Voltar ao perfil
        </button>
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6 text-center">
          <p className="font-semibold text-green-300">Termo já assinado</p>
          <p className="mt-2 text-sm text-green-400/80">
            O termo de confidencialidade já está vinculado ao seu perfil.
          </p>
          <button type="button" onClick={voltar} className={`${btn.primary} mt-4`}>
            Ver perfil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {arquivar && (
        <ArquivarDocumentoPastaModal documento={arquivar} onConcluido={() => navigate(`/perfil/${usuarioId}`)} />
      )}

      <button type="button" onClick={voltar} className={`${btn.secondary} self-start`}>
        ← Voltar ao perfil
      </button>

      <div className="rounded-xl border border-white/20 bg-neutral p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold text-white">
          {TERMO_CONFIDENCIALIDADE.icone} {TERMO_CONFIDENCIALIDADE.titulo}
        </h2>
        <p className="mb-6 text-sm text-white/55">
          Para {TERMO_CONFIDENCIALIDADE.publico.toLowerCase()}. Preencha seus dados, revise as cláusulas
          e assine — o documento será salvo automaticamente no seu perfil.
        </p>

        <TermoColaboradorWizard
          onClose={voltar}
          onSalvo={onSalvo}
          initialData={initialData}
          usuarioId={usuarioId}
        />
      </div>
    </div>
  );
}
