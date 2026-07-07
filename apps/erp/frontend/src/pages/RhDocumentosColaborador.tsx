import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { listarDocumentosUsuario, removerDocumento, type DocumentoColaborador } from '../services/rh';
import { useAuthStore } from '../store/auth';
import { userHasPermission } from '../utils/projectAccess';
import { toast, formatApiError } from '../utils/toast';
import { NovoDocModal, RhDocumentosTabela, type UserOption } from '../components/rh/TabDocumentos';
import { Card } from '../components/rh/rhUi';

export default function RhDocumentosColaborador() {
  const { usuarioId: param } = useParams();
  const usuarioId = Number(param);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const podeGerenciar = userHasPermission(user, 'documentos_rh:gerenciar');

  const [usuarios, setUsuarios] = useState<UserOption[]>([]);
  const [docs, setDocs] = useState<DocumentoColaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);

  const nome = usuarios.find((u) => u.id === usuarioId)?.nome ?? docs[0]?.usuario?.nome;

  const carregarListaColaboradores = useCallback(async () => {
    if (!podeGerenciar) return;
    try {
      const { data } = await api.get<UserOption[]>('/users/options');
      setUsuarios(Array.isArray(data) ? data : []);
    } catch {
      /* noop */
    }
  }, [podeGerenciar]);

  const carregarDocumentos = useCallback(async () => {
    if (!podeGerenciar || !Number.isFinite(usuarioId) || usuarioId < 1) return;
    setLoading(true);
    try {
      const d = await listarDocumentosUsuario(usuarioId);
      setDocs(d);
    } catch {
      setDocs([]);
      toast.error('Não foi possível carregar os documentos.');
    } finally {
      setLoading(false);
    }
  }, [podeGerenciar, usuarioId]);

  useEffect(() => {
    void carregarListaColaboradores();
  }, [carregarListaColaboradores]);

  useEffect(() => {
    void carregarDocumentos();
  }, [carregarDocumentos]);

  if (!Number.isFinite(usuarioId) || usuarioId < 1 || param?.trim() === '') {
    return <Navigate to="/rh?aba=documentos" replace />;
  }

  if (!podeGerenciar) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
        <Card title="Documentos">
          <p className="text-white/65 text-sm leading-relaxed">
            Você não tem permissão para gerenciar documentos de colaboradores. Fale com o RH se precisar de
            acesso.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/rh?aba=documentos')}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/15 bg-white/5 text-sm text-white/85 hover:bg-white/10 transition-colors"
        >
          ← Voltar ao RH
        </button>
      </div>

      <header className="border-b border-white/10 pb-3">
        <h1 className="text-xl sm:text-2xl font-bold text-white">
          Documentos — {nome ?? `Colaborador #${usuarioId}`}
        </h1>
        <p className="text-sm text-white/55 mt-1">
          Envie, abra arquivos ou remova registros para este colaborador.
        </p>
      </header>

      <Card
        title="Arquivos"
        actions={
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="px-3 py-1.5 rounded-md bg-primary text-neutral text-sm font-semibold hover:opacity-95"
          >
            Novo documento
          </button>
        }
      >
        <RhDocumentosTabela
          docs={docs}
          loading={loading}
          mostrarUsuario={false}
          onRemover={async (id) => {
            try {
              await removerDocumento(id);
              toast.success('Removido.');
              void carregarDocumentos();
            } catch (err) {
              toast.error(formatApiError(err));
            }
          }}
        />
      </Card>

      {criando ? (
        <NovoDocModal
          usuarios={usuarios}
          usuarioIdInicial={usuarioId}
          fixarColaborador
          onClose={() => setCriando(false)}
          onSaved={() => {
            setCriando(false);
            void carregarDocumentos();
          }}
        />
      ) : null}
    </div>
  );
}
