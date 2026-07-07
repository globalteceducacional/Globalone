import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { btn } from '../utils/buttonStyles';
import { TERMO_CONFIDENCIALIDADE } from '../constants/documentosLabels';

interface UserOption {
  id: number;
  nome: string;
}

interface ConviteModal {
  tipo: 'fornecedor' | 'estagiario';
  titulo: string;
  estado: 'config' | 'gerando' | 'pronto' | 'erro';
  link: string;
  erro: string;
  usuarioId: number | '';
}

type TipoDocumento = 'certificado' | 'fornecedor' | 'estagiario';

interface DocumentoItem {
  id: number;
  tipo: TipoDocumento;
  nomeExibicao: string;
  url: string;
  criadoEm: string;
  criadoPor: { id: number; nome: string };
}

const TIPO_LABEL: Record<TipoDocumento, string> = {
  certificado: 'Certificado de Programa',
  fornecedor: 'Termo Fornecedor',
  estagiario: TERMO_CONFIDENCIALIDADE.tituloCurto,
};

const TIPO_BADGE: Record<TipoDocumento, string> = {
  certificado: 'bg-blue-500/20 text-blue-300',
  fornecedor: 'bg-green-500/20 text-green-300',
  estagiario: 'bg-purple-500/20 text-purple-300',
};

const TIPO_ICON: Record<TipoDocumento, string> = {
  certificado: '📜',
  fornecedor: '🤝',
  estagiario: TERMO_CONFIDENCIALIDADE.icone,
};

const FILTROS = [
  { value: '', label: 'Todos' },
  { value: 'certificado', label: 'Certificados' },
  { value: 'fornecedor', label: 'Termos Fornecedor' },
  { value: 'estagiario', label: 'Termos Confidencialidade' },
] as const;

export default function Documentos() {
  const navigate = useNavigate();
  const [documentos, setDocumentos] = useState<DocumentoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('');
  const [deletandoId, setDeletandoId] = useState<number | null>(null);
  const [convite, setConvite] = useState<ConviteModal | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [usuarios, setUsuarios] = useState<UserOption[]>([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const params = filtro ? `?tipo=${filtro}` : '';
      const { data } = await api.get<DocumentoItem[]>(`/documentos${params}`);
      setDocumentos(data);
    } catch {
      setErro('Erro ao carregar documentos.');
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleDeletar = async (id: number) => {
    if (!confirm('Deseja remover este documento permanentemente?')) return;
    setDeletandoId(id);
    try {
      await api.delete(`/documentos/${id}`);
      setDocumentos((prev) => prev.filter((d) => d.id !== id));
    } catch {
      alert('Erro ao remover o documento.');
    } finally {
      setDeletandoId(null);
    }
  };

  const baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/api\/?$/, '') ?? '';

  const abrirModalLink = async (tipo: 'fornecedor' | 'estagiario', titulo: string) => {
    setCopiado(false);
    if (tipo === 'estagiario' && usuarios.length === 0) {
      try {
        const { data } = await api.get<UserOption[]>('/users/options');
        setUsuarios(Array.isArray(data) ? data : []);
      } catch {
        setUsuarios([]);
      }
    }
    setConvite({ tipo, titulo, estado: 'config', link: '', erro: '', usuarioId: '' });
  };

  const confirmarGerarLink = async () => {
    if (!convite) return;
    setConvite({ ...convite, estado: 'gerando', erro: '' });
    try {
      const body: { tipo: string; titulo: string; usuarioId?: number } = {
        tipo: convite.tipo,
        titulo: convite.titulo,
      };
      if (convite.tipo === 'estagiario' && convite.usuarioId !== '') {
        body.usuarioId = convite.usuarioId;
      }
      const { data } = await api.post<{ token: string }>('/documentos/convite', body);
      const link = `${window.location.origin}/doc/${data.token}`;
      setConvite({ ...convite, estado: 'pronto', link, erro: '' });
    } catch {
      setConvite((prev) =>
        prev ? { ...prev, estado: 'erro', erro: 'Falha ao gerar o link. Tente novamente.' } : null,
      );
    }
  };

  const copiarLink = async () => {
    if (!convite?.link) return;
    await navigator.clipboard.writeText(convite.link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Modal de link público */}
      {convite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-neutral p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white">
                  {convite.tipo === 'estagiario'
                    ? `${TERMO_CONFIDENCIALIDADE.icone} Link — ${TERMO_CONFIDENCIALIDADE.tituloCurto}`
                    : '🤝 Link de Preenchimento — Fornecedor'}
                </p>
                <p className="mt-0.5 text-xs text-white/50">
                  Envie este link para o signatário preencher e assinar sem precisar de login.
                </p>
              </div>
              <button onClick={() => setConvite(null)} className="shrink-0 text-white/40 hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>

            {convite.estado === 'config' && (
              <div className="flex flex-col gap-3">
                {convite.tipo === 'estagiario' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-white/60">
                      Vincular ao colaborador (recomendado)
                    </label>
                    <select
                      className="w-full rounded-md border border-white/20 bg-neutral/90 px-3 py-2 text-sm text-white"
                      value={convite.usuarioId === '' ? '' : String(convite.usuarioId)}
                      onChange={(e) =>
                        setConvite((prev) =>
                          prev
                            ? {
                                ...prev,
                                usuarioId: e.target.value ? Number(e.target.value) : '',
                              }
                            : null,
                        )
                      }
                    >
                      <option value="">Sem vínculo (link genérico)</option>
                      {usuarios.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nome}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-white/40">
                      Ao vincular, o PDF assinado aparece automaticamente no perfil do colaborador.
                    </p>
                  </div>
                )}
                <button type="button" onClick={confirmarGerarLink} className={`${btn.primary} w-full`}>
                  Gerar link
                </button>
              </div>
            )}

            {convite.estado === 'gerando' && (
              <div className="flex items-center gap-2 py-4 text-sm text-white/60">
                <span className="animate-spin">⟳</span> Gerando link seguro...
              </div>
            )}

            {convite.estado === 'erro' && (
              <p className="py-4 text-sm text-red-400">{convite.erro}</p>
            )}

            {convite.estado === 'pronto' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2">
                  <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-xs text-primary font-mono">
                    {convite.link}
                  </span>
                  <button
                    onClick={copiarLink}
                    className={`shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      copiado ? 'bg-green-500/20 text-green-300' : 'bg-primary/20 text-primary hover:bg-primary/30'
                    }`}
                  >
                    {copiado ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
                <p className="text-xs text-white/40">
                  ⏳ Válido por 30 dias · Uso único — expira após o primeiro envio.
                </p>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button onClick={() => setConvite(null)} className={btn.secondary}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Cards de ação */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(
          [
            {
              tipo: 'certificado' as const,
              titulo: 'Certificado de Programa',
              descricao: 'Gera certificado de autoria de software para registro de propriedade intelectual.',
              cor: 'border-blue-500/30 hover:border-blue-400/60',
              iconBg: 'bg-blue-500/10',
              publico: false,
            },
            {
              tipo: 'fornecedor' as const,
              titulo: 'Termo de Fornecedor',
              descricao: 'Acordo de confidencialidade, proteção de dados e não concorrência com fornecedores.',
              cor: 'border-green-500/30 hover:border-green-400/60',
              iconBg: 'bg-green-500/10',
              publico: true,
            },
            {
              tipo: 'estagiario' as const,
              titulo: TERMO_CONFIDENCIALIDADE.titulo,
              descricao: TERMO_CONFIDENCIALIDADE.descricao,
              cor: 'border-purple-500/30 hover:border-purple-400/60',
              iconBg: 'bg-purple-500/10',
              publico: true,
            },
          ] as const
        ).map((card) => (
          <div
            key={card.tipo}
            className={`flex flex-col gap-3 rounded-xl border bg-white/5 p-5 transition-all ${card.cor}`}
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-2xl ${card.iconBg}`}>
              {TIPO_ICON[card.tipo]}
            </div>
            <div>
              <p className="font-semibold text-white">{card.titulo}</p>
              <p className="mt-1 text-xs text-white/50">{card.descricao}</p>
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <button
                onClick={() => navigate(`/documentos/novo/${card.tipo}`)}
                className={btn.primarySm}
              >
                + Novo
              </button>
              {card.publico && (
                <button
                  onClick={() => abrirModalLink(card.tipo as 'fornecedor' | 'estagiario', card.titulo)}
                  className={btn.editSm}
                  title="Gerar link para preenchimento externo sem login"
                >
                  🔗 Gerar Link
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lista de documentos */}
      <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Documentos Gerados</h2>
          <div className="flex gap-2">
            {FILTROS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFiltro(f.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filtro === f.value
                    ? 'bg-primary text-white'
                    : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="py-8 text-center text-sm text-white/40">Carregando...</div>
        )}

        {!loading && erro && (
          <div className="py-4 text-center text-sm text-red-400">{erro}</div>
        )}

        {!loading && !erro && documentos.length === 0 && (
          <div className="py-8 text-center text-sm text-white/40">
            Nenhum documento encontrado.
          </div>
        )}

        {!loading && !erro && documentos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-white/40">
                  <th className="pb-2 text-left font-medium">Nome</th>
                  <th className="pb-2 text-left font-medium">Tipo</th>
                  <th className="pb-2 text-left font-medium">Criado por</th>
                  <th className="pb-2 text-left font-medium">Data</th>
                  <th className="pb-2 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {documentos.map((doc) => (
                  <tr key={doc.id} className="border-b border-white/5 hover:bg-white/3">
                    <td className="py-2.5 pr-4 text-white/90">{doc.nomeExibicao}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_BADGE[doc.tipo]}`}>
                        {TIPO_LABEL[doc.tipo]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-white/60">{doc.criadoPor?.nome ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-white/50 whitespace-nowrap">
                      {new Date(doc.criadoEm).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`${baseUrl}${doc.url}`}
                          target="_blank"
                          rel="noreferrer"
                          className={btn.editSm}
                          download
                        >
                          Baixar
                        </a>
                        <button
                          className={btn.dangerSm}
                          onClick={() => handleDeletar(doc.id)}
                          disabled={deletandoId === doc.id}
                        >
                          {deletandoId === doc.id ? '...' : 'Remover'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
