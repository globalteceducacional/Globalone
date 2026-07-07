import { useCallback, useEffect, useId, useState } from 'react';
import {
  atualizarItemQuestaoTreinamento,
  criarItemQuestaoTreinamento,
  criarItemVideoTreinamento,
  listarItensTreinamento,
  removerItemTreinamento,
  removerVideoItemTreinamento,
  reordenarItensTreinamento,
  uploadVideoItemTreinamento,
  TREINAMENTO_QUESTAO_QTD_ALTERNATIVAS,
  type TreinamentoItem,
  type TreinamentoQuestaoJson,
} from '../../services/rh';
import { toast, formatApiError } from '../../utils/toast';
import { UPLOAD_LIMITS, formatMb, validateTreinamentoVideoFileSize } from '../../utils/uploadLimits';
import { Field } from './rhUi';

function questaoVazia(): TreinamentoQuestaoJson {
  return {
    enunciado: '',
    alternativas: Array.from({ length: TREINAMENTO_QUESTAO_QTD_ALTERNATIVAS }, () => ({
      texto: '',
      correta: false,
    })),
  };
}

function questaoFromItem(item: TreinamentoItem): TreinamentoQuestaoJson {
  const q = item.questaoJson;
  if (q?.alternativas?.length === TREINAMENTO_QUESTAO_QTD_ALTERNATIVAS) {
    return {
      enunciado: q.enunciado ?? '',
      alternativas: q.alternativas.map((a) => ({
        texto: a.texto ?? '',
        correta: Boolean(a.correta),
      })),
    };
  }
  return questaoVazia();
}

function indiceCorreta(questao: TreinamentoQuestaoJson): number {
  const idx = questao.alternativas.findIndex((a) => a.correta);
  return idx >= 0 ? idx : 0;
}

function questaoComIndiceCorreto(questao: TreinamentoQuestaoJson, indiceCorreto: number): TreinamentoQuestaoJson {
  return {
    enunciado: questao.enunciado.trim(),
    alternativas: questao.alternativas.map((a, i) => ({
      texto: a.texto.trim(),
      correta: i === indiceCorreto,
    })),
  };
}

function validarQuestaoLocal(questao: TreinamentoQuestaoJson, indiceCorreto: number): string | null {
  if (!questao.enunciado.trim()) return 'Informe o enunciado da questão.';
  for (let i = 0; i < TREINAMENTO_QUESTAO_QTD_ALTERNATIVAS; i += 1) {
    if (!questao.alternativas[i]?.texto?.trim()) {
      return `Preencha o texto da alternativa ${i + 1}.`;
    }
  }
  if (indiceCorreto < 0 || indiceCorreto >= TREINAMENTO_QUESTAO_QTD_ALTERNATIVAS) {
    return 'Marque a alternativa correta.';
  }
  return null;
}

type Props = {
  treinamentoId: number;
  onChanged?: () => void;
};

export function TrilhaTreinamentoEditor({ treinamentoId, onChanged }: Props) {
  const [itens, setItens] = useState<TreinamentoItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [reordenando, setReordenando] = useState(false);
  const [novaQuestao, setNovaQuestao] = useState(false);
  const [editandoQuestaoId, setEditandoQuestaoId] = useState<number | null>(null);
  const [uploadItemId, setUploadItemId] = useState<number | null>(null);
  const [progressoUpload, setProgressoUpload] = useState<number | null>(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await listarItensTreinamento(treinamentoId);
      setItens(lista);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setCarregando(false);
    }
  }, [treinamentoId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function mover(itemId: number, direcao: 'cima' | 'baixo') {
    const idx = itens.findIndex((i) => i.id === itemId);
    if (idx < 0) return;
    const alvo = direcao === 'cima' ? idx - 1 : idx + 1;
    if (alvo < 0 || alvo >= itens.length) return;
    const ids = itens.map((i) => i.id);
    [ids[idx], ids[alvo]] = [ids[alvo], ids[idx]];
    setReordenando(true);
    try {
      const lista = await reordenarItensTreinamento(treinamentoId, ids);
      setItens(lista);
      onChanged?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setReordenando(false);
    }
  }

  async function adicionarVideo() {
    try {
      await criarItemVideoTreinamento(treinamentoId);
      await recarregar();
      onChanged?.();
      toast.success('Etapa de vídeo adicionada. Envie o arquivo abaixo.');
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }

  async function enviarVideo(itemId: number, file: File) {
    const err = validateTreinamentoVideoFileSize(file);
    if (err) {
      toast.error(err);
      return;
    }
    setUploadItemId(itemId);
    setProgressoUpload(0);
    try {
      await uploadVideoItemTreinamento(treinamentoId, itemId, file, setProgressoUpload);
      toast.success('Vídeo enviado.');
      await recarregar();
      onChanged?.();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setUploadItemId(null);
      setProgressoUpload(null);
    }
  }

  async function removerVideo(itemId: number) {
    if (!window.confirm('Remover o arquivo de vídeo desta etapa?')) return;
    try {
      await removerVideoItemTreinamento(treinamentoId, itemId);
      toast.success('Vídeo removido.');
      await recarregar();
      onChanged?.();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }

  async function excluirItem(itemId: number) {
    if (!window.confirm('Excluir esta etapa da trilha?')) return;
    try {
      await removerItemTreinamento(treinamentoId, itemId);
      toast.success('Etapa removida.');
      if (editandoQuestaoId === itemId) setEditandoQuestaoId(null);
      await recarregar();
      onChanged?.();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }

  async function salvarNovaQuestao(questao: TreinamentoQuestaoJson, indice: number) {
    const erro = validarQuestaoLocal(questao, indice);
    if (erro) {
      toast.error(erro);
      return;
    }
    try {
      await criarItemQuestaoTreinamento(treinamentoId, {
        questao: questaoComIndiceCorreto(questao, indice),
      });
      toast.success('Questão adicionada à trilha.');
      setNovaQuestao(false);
      await recarregar();
      onChanged?.();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }

  async function salvarQuestaoEditada(itemId: number, form: TreinamentoQuestaoJson, corretaIdx: number) {
    const erro = validarQuestaoLocal(form, corretaIdx);
    if (erro) {
      toast.error(erro);
      return;
    }
    try {
      await atualizarItemQuestaoTreinamento(treinamentoId, itemId, {
        questao: questaoComIndiceCorreto(form, corretaIdx),
      });
      toast.success('Questão atualizada.');
      setEditandoQuestaoId(null);
      await recarregar();
      onChanged?.();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }

  if (carregando) {
    return <p className="text-sm text-white/60 py-2">Carregando trilha...</p>;
  }

  return (
    <div className="space-y-4 border-t border-white/10 pt-4 mt-2">
      <div>
        <p className="text-sm font-medium text-white/90">Trilha do treinamento</p>
        <p className="text-xs text-white/55 mt-1">
          Ordene vídeos e questões na sequência em que o colaborador deve seguir. Cada questão tem 1 enunciado e{' '}
          {TREINAMENTO_QUESTAO_QTD_ALTERNATIVAS} alternativas.
        </p>
      </div>

      {itens.length === 0 ? (
        <p className="text-sm text-amber-200/90">Nenhuma etapa cadastrada. Adicione vídeos e/ou questões abaixo.</p>
      ) : (
        <ul className="space-y-3">
          {itens.map((item, idx) => (
            <li key={item.id} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-mono text-white/50">#{item.ordem}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    item.tipo === 'VIDEO' ? 'bg-violet-500/20 text-violet-200' : 'bg-amber-500/20 text-amber-200'
                  }`}
                >
                  {item.tipo === 'VIDEO' ? 'Vídeo' : 'Questão'}
                </span>
                <div className="ml-auto flex gap-1">
                  <button
                    type="button"
                    disabled={idx === 0 || reordenando}
                    onClick={() => void mover(item.id, 'cima')}
                    className="px-2 py-0.5 rounded bg-white/10 text-xs disabled:opacity-40"
                    title="Subir"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={idx === itens.length - 1 || reordenando}
                    onClick={() => void mover(item.id, 'baixo')}
                    className="px-2 py-0.5 rounded bg-white/10 text-xs disabled:opacity-40"
                    title="Descer"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => void excluirItem(item.id)}
                    className="px-2 py-0.5 rounded bg-red-600/30 text-red-200 text-xs"
                  >
                    Excluir
                  </button>
                </div>
              </div>

              {item.tipo === 'VIDEO' ? (
                <ItemVideo
                  item={item}
                  uploadItemId={uploadItemId}
                  progressoUpload={progressoUpload}
                  onEnviar={(f) => void enviarVideo(item.id, f)}
                  onRemover={() => void removerVideo(item.id)}
                />
              ) : editandoQuestaoId === item.id ? (
                <FormQuestao
                  inicial={questaoFromItem(item)}
                  onCancelar={() => setEditandoQuestaoId(null)}
                  onSalvar={(q, i) => void salvarQuestaoEditada(item.id, q, i)}
                />
              ) : (
                <div>
                  <p className="text-white/85 whitespace-pre-wrap">
                    {(item.questaoJson?.enunciado ?? '').slice(0, 200)}
                    {(item.questaoJson?.enunciado?.length ?? 0) > 200 ? '…' : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditandoQuestaoId(item.id)}
                    className="mt-2 text-amber-300 hover:text-amber-200 text-xs"
                  >
                    Editar questão
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void adicionarVideo()}
          className="px-3 py-1.5 rounded bg-violet-600/80 hover:bg-violet-600 text-sm font-medium"
        >
          + Vídeo
        </button>
        <button
          type="button"
          onClick={() => setNovaQuestao((v) => !v)}
          className="px-3 py-1.5 rounded bg-amber-600/80 hover:bg-amber-600 text-sm font-medium"
        >
          {novaQuestao ? 'Cancelar questão' : '+ Questão'}
        </button>
      </div>

      {novaQuestao ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-sm font-medium text-amber-200/90 mb-2">Nova questão</p>
          <FormQuestao
            inicial={questaoVazia()}
            onCancelar={() => setNovaQuestao(false)}
            onSalvar={(q, i) => void salvarNovaQuestao(q, i)}
          />
        </div>
      ) : null}

      <p className="text-xs text-white/45">
        Vídeos: MP4, WebM, MOV, AVI ou MKV. Máximo {UPLOAD_LIMITS.treinamento.maxMb} MB por arquivo.
      </p>
    </div>
  );
}

function ItemVideo({
  item,
  uploadItemId,
  progressoUpload,
  onEnviar,
  onRemover,
}: {
  item: TreinamentoItem;
  uploadItemId: number | null;
  progressoUpload: number | null;
  onEnviar: (file: File) => void;
  onRemover: () => void;
}) {
  const enviando = uploadItemId === item.id;
  return (
    <div className="space-y-2">
      {item.videoUrl ? (
        <p className="text-emerald-300/90 text-xs">
          Arquivo: {item.videoNome ?? 'vídeo'}{' '}
          {item.videoTamanhoBytes != null ? `(${formatMb(item.videoTamanhoBytes)})` : ''}
        </p>
      ) : (
        <p className="text-amber-200/80 text-xs">Sem arquivo — escolha um vídeo para enviar.</p>
      )}
      <input
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,video/ogg"
        disabled={enviando}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onEnviar(f);
          e.target.value = '';
        }}
        className="w-full text-xs text-white/80 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-primary file:text-neutral file:text-xs"
      />
      {enviando && progressoUpload != null ? (
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progressoUpload}%` }} />
        </div>
      ) : null}
      {item.videoUrl ? (
        <button type="button" onClick={onRemover} className="text-red-300 hover:text-red-200 text-xs">
          Remover arquivo
        </button>
      ) : null}
    </div>
  );
}

function FormQuestao({
  inicial,
  onCancelar,
  onSalvar,
}: {
  inicial: TreinamentoQuestaoJson;
  onCancelar: () => void;
  onSalvar: (questao: TreinamentoQuestaoJson, indiceCorreto: number) => void;
}) {
  const grupoRadio = useId();
  const [enunciado, setEnunciado] = useState(inicial.enunciado);
  const [alternativas, setAlternativas] = useState(() => inicial.alternativas.map((a) => a.texto));
  const [correta, setCorreta] = useState(() => indiceCorreta(inicial));

  function montarQuestao(): TreinamentoQuestaoJson {
    return {
      enunciado,
      alternativas: alternativas.map((texto, i) => ({
        texto,
        correta: i === correta,
      })),
    };
  }

  return (
    <div className="space-y-3">
      <Field label="Enunciado">
        <textarea
          rows={3}
          value={enunciado}
          onChange={(e) => setEnunciado(e.target.value)}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        />
      </Field>
      <p className="text-xs text-white/55">Alternativas (marque a correta):</p>
      {alternativas.map((texto, i) => (
        <label key={i} className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name={grupoRadio}
            checked={correta === i}
            onChange={() => setCorreta(i)}
            className="mt-1"
          />
          <input
            value={texto}
            onChange={(e) => {
              const next = [...alternativas];
              next[i] = e.target.value;
              setAlternativas(next);
            }}
            placeholder={`Alternativa ${i + 1}`}
            className="flex-1 bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          />
        </label>
      ))}
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className="px-2 py-1 rounded bg-white/10 text-xs">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onSalvar(montarQuestao(), correta)}
          className="px-2 py-1 rounded bg-primary text-neutral text-xs font-semibold"
        >
          Salvar questão
        </button>
      </div>
    </div>
  );
}
