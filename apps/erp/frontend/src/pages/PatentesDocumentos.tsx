import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { btn } from '../utils/buttonStyles';
import {
  CATEGORIA_PATENTE_BADGE,
  CATEGORIA_PATENTE_LABEL,
  type PatenteDocumentoItem,
  type PatentePastaItem,
} from '../constants/patentesDocumentosLabels';
import {
  criarPatentePasta,
  deletarPatenteDocumento,
  deletarPatentePasta,
  listarDocumentosDaPasta,
  listarPatentesPastas,
  uploadDocumentoNaPasta,
} from '../services/patentesDocumentos';

function mensagemErro(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return fallback;
}

const inputCls =
  'w-full rounded-md border border-white/20 bg-neutral/90 px-3 py-2 text-sm text-white placeholder:text-white/40';

export default function PatentesDocumentos() {
  const [pastas, setPastas] = useState<PatentePastaItem[]>([]);
  const [pastaAtual, setPastaAtual] = useState<PatentePastaItem | null>(null);
  const [documentos, setDocumentos] = useState<PatenteDocumentoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [deletandoId, setDeletandoId] = useState<number | null>(null);

  const [modalPasta, setModalPasta] = useState(false);
  const [nomeNovaPasta, setNomeNovaPasta] = useState('');
  const [descNovaPasta, setDescNovaPasta] = useState('');
  const [criandoPasta, setCriandoPasta] = useState(false);
  const [pastaErro, setPastaErro] = useState('');

  const [modalUpload, setModalUpload] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [uploadErro, setUploadErro] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [formUpload, setFormUpload] = useState({
    nomeExibicao: '',
    descricao: '',
    numeroReferencia: '',
  });

  const baseUrl =
    (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/api\/?$/, '') ?? '';

  const carregarPastas = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const data = await listarPatentesPastas();
      setPastas(data);
    } catch {
      setErro('Erro ao carregar pastas.');
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarPasta = useCallback(async (pastaId: number) => {
    setLoading(true);
    setErro('');
    try {
      const [pasta, docs] = await Promise.all([
        listarPatentesPastas().then((lista) => lista.find((p) => p.id === pastaId) ?? null),
        listarDocumentosDaPasta(pastaId),
      ]);
      if (!pasta) {
        setErro('Pasta não encontrada.');
        setPastaAtual(null);
        setDocumentos([]);
        return;
      }
      setPastaAtual({ ...pasta, totalDocumentos: docs.length });
      setDocumentos(docs);
    } catch {
      setErro('Erro ao carregar a pasta.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pastaAtual) {
      carregarPasta(pastaAtual.id);
    } else {
      carregarPastas();
    }
  }, [pastaAtual?.id, carregarPastas, carregarPasta]);

  const voltarPastas = () => {
    setPastaAtual(null);
    setDocumentos([]);
    setErro('');
  };

  const abrirPasta = (pasta: PatentePastaItem) => {
    setPastaAtual(pasta);
  };

  const handleCriarPasta = async () => {
    if (!nomeNovaPasta.trim()) {
      setPastaErro('Informe o nome da pasta.');
      return;
    }
    setCriandoPasta(true);
    setPastaErro('');
    try {
      const pasta = await criarPatentePasta(nomeNovaPasta.trim(), descNovaPasta.trim() || undefined);
      setModalPasta(false);
      setNomeNovaPasta('');
      setDescNovaPasta('');
      if (pastaAtual) {
        await carregarPasta(pastaAtual.id);
      } else {
        setPastas((prev) => [...prev, pasta].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      }
      abrirPasta(pasta);
    } catch (err) {
      setPastaErro(mensagemErro(err, 'Não foi possível criar a pasta.'));
    } finally {
      setCriandoPasta(false);
    }
  };

  const handleExcluirPasta = async (pasta: PatentePastaItem) => {
    if (
      !confirm(
        `Excluir a pasta "${pasta.nome}" e todos os ${pasta.totalDocumentos} arquivo(s) dentro dela?`,
      )
    ) {
      return;
    }
    try {
      await deletarPatentePasta(pasta.id);
      if (pastaAtual?.id === pasta.id) voltarPastas();
      else setPastas((prev) => prev.filter((p) => p.id !== pasta.id));
    } catch (err) {
      alert(mensagemErro(err, 'Erro ao excluir a pasta.'));
    }
  };

  const abrirUpload = () => {
    if (!pastaAtual) return;
    setFormUpload({ nomeExibicao: '', descricao: '', numeroReferencia: '' });
    setArquivo(null);
    setUploadErro('');
    setModalUpload(true);
  };

  const handleUpload = async () => {
    if (!pastaAtual) return;
    if (!arquivo) {
      setUploadErro('Selecione um arquivo.');
      return;
    }
    if (!formUpload.nomeExibicao.trim()) {
      setUploadErro('Informe o nome do arquivo.');
      return;
    }

    setEnviando(true);
    setUploadErro('');
    try {
      const fd = new FormData();
      fd.append('file', arquivo);
      fd.append('nomeExibicao', formUpload.nomeExibicao.trim());
      if (formUpload.descricao.trim()) fd.append('descricao', formUpload.descricao.trim());
      if (formUpload.numeroReferencia.trim()) {
        fd.append('numeroReferencia', formUpload.numeroReferencia.trim());
      }

      await uploadDocumentoNaPasta(pastaAtual.id, fd);
      setModalUpload(false);
      await carregarPasta(pastaAtual.id);
    } catch (err) {
      setUploadErro(mensagemErro(err, 'Falha ao enviar o arquivo.'));
    } finally {
      setEnviando(false);
    }
  };

  const handleDeletarArquivo = async (doc: PatenteDocumentoItem) => {
    if (doc.origem === 'gerado') {
      alert('Para remover, exclua o documento em Documentos oficiais.');
      return;
    }
    if (!confirm('Remover este arquivo da pasta?')) return;

    setDeletandoId(doc.id);
    try {
      await deletarPatenteDocumento(doc.id);
      if (pastaAtual) await carregarPasta(pastaAtual.id);
    } catch {
      alert('Erro ao remover o arquivo.');
    } finally {
      setDeletandoId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Modal nova pasta */}
      {modalPasta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-neutral p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white">Nova pasta</p>
                <p className="mt-0.5 text-xs text-white/50">
                  Depois de criar, abra a pasta e envie os arquivos dentro dela.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalPasta(false)}
                className="text-lg leading-none text-white/40 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">Nome *</label>
                <input
                  className={inputCls}
                  value={nomeNovaPasta}
                  onChange={(e) => setNomeNovaPasta(e.target.value)}
                  placeholder="Ex.: Patentes 2024, App EduGame..."
                  maxLength={120}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">Descrição (opcional)</label>
                <textarea
                  rows={2}
                  className={inputCls}
                  value={descNovaPasta}
                  onChange={(e) => setDescNovaPasta(e.target.value)}
                  placeholder="Para que serve esta pasta"
                />
              </div>
              {pastaErro && <p className="text-xs text-red-400">{pastaErro}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className={btn.secondary} onClick={() => setModalPasta(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className={btn.primary}
                  onClick={handleCriarPasta}
                  disabled={criandoPasta}
                >
                  {criandoPasta ? 'Criando...' : 'Criar pasta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal upload */}
      {modalUpload && pastaAtual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-neutral p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white">Enviar arquivo</p>
                <p className="mt-0.5 text-xs text-white/50">Pasta: {pastaAtual.nome}</p>
              </div>
              <button
                type="button"
                onClick={() => setModalUpload(false)}
                className="text-lg leading-none text-white/40 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">Nome do arquivo *</label>
                <input
                  className={inputCls}
                  value={formUpload.nomeExibicao}
                  onChange={(e) => setFormUpload((p) => ({ ...p, nomeExibicao: e.target.value }))}
                  placeholder="Como o arquivo aparecerá na lista"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">Referência (opcional)</label>
                <input
                  className={inputCls}
                  value={formUpload.numeroReferencia}
                  onChange={(e) => setFormUpload((p) => ({ ...p, numeroReferencia: e.target.value }))}
                  placeholder="Protocolo, nº registro..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">Descrição (opcional)</label>
                <textarea
                  rows={2}
                  className={inputCls}
                  value={formUpload.descricao}
                  onChange={(e) => setFormUpload((p) => ({ ...p, descricao: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">Arquivo *</label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.odt,image/jpeg,image/png,image/webp"
                  className="text-sm text-white/70 file:mr-3 file:rounded file:border-0 file:bg-primary/20 file:px-3 file:py-1 file:text-xs file:text-primary"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                />
                {arquivo && <p className="mt-1 text-xs text-green-400">✓ {arquivo.name}</p>}
              </div>
              {uploadErro && <p className="text-xs text-red-400">{uploadErro}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className={btn.secondary} onClick={() => setModalUpload(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className={btn.primary}
                  onClick={handleUpload}
                  disabled={enviando || !arquivo}
                >
                  {enviando ? 'Enviando...' : 'Enviar para pasta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ações */}
      {!pastaAtual ? (
        <div className="flex justify-end">
          <button type="button" className={btn.primary} onClick={() => setModalPasta(true)}>
            + Nova pasta
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={voltarPastas}
              className="mb-1 text-xs text-primary hover:underline"
            >
              ← Voltar às pastas
            </button>
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <span className="text-xl">📁</span>
              {pastaAtual.nome}
            </h2>
            {pastaAtual.descricao && (
              <p className="mt-1 text-sm text-white/50">{pastaAtual.descricao}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.primary} onClick={abrirUpload}>
              + Enviar arquivo
            </button>
            <button
              type="button"
              className={btn.dangerSm}
              onClick={() => handleExcluirPasta(pastaAtual)}
            >
              Excluir pasta
            </button>
          </div>
        </div>
      )}

      {loading && <div className="py-12 text-center text-sm text-white/40">Carregando...</div>}

      {!loading && erro && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-400">
          {erro}
          {pastaAtual && (
            <button type="button" className={`${btn.secondary} mt-3`} onClick={voltarPastas}>
              Voltar
            </button>
          )}
        </div>
      )}

      {/* Grid de pastas */}
      {!loading && !erro && !pastaAtual && (
        <>
          {pastas.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 py-14 text-center">
              <p className="text-4xl">📁</p>
              <p className="mt-3 text-sm text-white/50">Nenhuma pasta ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pastas.map((pasta) => (
                <button
                  key={pasta.id}
                  type="button"
                  onClick={() => abrirPasta(pasta)}
                  className="group flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-5 text-left transition-all hover:border-primary/40 hover:bg-white/[0.07]"
                >
                  <span className="text-3xl">📁</span>
                  <div>
                    <p className="font-semibold text-white group-hover:text-primary">{pasta.nome}</p>
                    {pasta.descricao && (
                      <p className="mt-1 line-clamp-2 text-xs text-white/45">{pasta.descricao}</p>
                    )}
                  </div>
                  <p className="mt-auto text-xs text-white/40">
                    {pasta.totalDocumentos} arquivo{pasta.totalDocumentos !== 1 ? 's' : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Arquivos dentro da pasta */}
      {!loading && !erro && pastaAtual && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          {documentos.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-white/50">Esta pasta está vazia.</p>
              <button type="button" className={`${btn.primary} mt-4`} onClick={abrirUpload}>
                Enviar primeiro arquivo
              </button>
            </div>
          )}

          {documentos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-white/40">
                    <th className="pb-2 text-left font-medium">Nome</th>
                    <th className="pb-2 text-left font-medium">Tipo</th>
                    <th className="pb-2 text-left font-medium">Referência</th>
                    <th className="pb-2 text-left font-medium">Data</th>
                    <th className="pb-2 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {documentos.map((doc) => (
                    <tr key={doc.id} className="border-b border-white/5 hover:bg-white/3">
                      <td className="py-2.5 pr-4">
                        <div className="text-white/90">{doc.nomeExibicao}</div>
                        {doc.descricao && (
                          <div className="mt-0.5 max-w-xs truncate text-xs text-white/40">{doc.descricao}</div>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORIA_PATENTE_BADGE[doc.categoria]}`}
                        >
                          {CATEGORIA_PATENTE_LABEL[doc.categoria]}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-white/50">{doc.numeroReferencia ?? '—'}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-white/50">
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
                          {doc.origem === 'upload' && (
                            <button
                              type="button"
                              className={btn.dangerSm}
                              onClick={() => handleDeletarArquivo(doc)}
                              disabled={deletandoId === doc.id}
                            >
                              {deletandoId === doc.id ? '...' : 'Remover'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
