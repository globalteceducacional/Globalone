import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  atualizarMatricula,
  buscarTrilhaTreinamento,
  concluirVideoItemTreinamento,
  ingressarTreinamento,
  responderQuestaoItemTreinamento,
  urlVideoItemTreinamento,
  urlVideoTreinamento,
  type MatriculaTreinamentoStatus,
  type TreinamentoMatricula,
  type TreinamentoTrilhaItemParticipante,
  type TreinamentoTrilhaState,
} from '../../services/rh';
import { toast, formatApiError } from '../../utils/toast';
import { Modal, StatusBadge } from './rhUi';

type Props = {
  matriculaInicial: TreinamentoMatricula;
  onClose: () => void;
  onAtualizado?: (matricula: TreinamentoMatricula) => void;
};

export function TreinamentoPlayerModal({ matriculaInicial, onClose, onAtualizado }: Props) {
  const treinamentoId = matriculaInicial.treinamento?.id ?? matriculaInicial.treinamentoId;
  const titulo = matriculaInicial.treinamento?.titulo ?? 'Treinamento';

  const [carregando, setCarregando] = useState(true);
  const [trilha, setTrilha] = useState<TreinamentoTrilhaState | null>(null);
  const [matriculaId, setMatriculaId] = useState(matriculaInicial.id);
  const [status, setStatus] = useState<MatriculaTreinamentoStatus>(matriculaInicial.status);
  const [indiceAtual, setIndiceAtual] = useState(0);
  const [enviandoQuestao, setEnviandoQuestao] = useState(false);
  const [marcandoVideo, setMarcandoVideo] = useState(false);
  const [respostaSelecionada, setRespostaSelecionada] = useState<number | null>(null);
  const [feedbackQuestao, setFeedbackQuestao] = useState<'ok' | 'erro' | null>(null);

  const statusRef = useRef(matriculaInicial.status);
  const persistindoRef = useRef(false);
  const grupoRadio = useId();

  const notificarMatricula = useCallback(
    (m: TreinamentoMatricula, trilhaLocal?: TreinamentoTrilhaState | null) => {
      statusRef.current = m.status;
      setStatus(m.status);
      setMatriculaId(m.id);
      const treinoBase = matriculaInicial.treinamento;
      onAtualizado?.({
        ...matriculaInicial,
        ...m,
        id: m.id,
        treinamento: {
          id: treinamentoId,
          titulo: m.treinamento?.titulo ?? treinoBase?.titulo ?? titulo,
          cargaHoraria: m.treinamento?.cargaHoraria ?? treinoBase?.cargaHoraria,
          videoUrl: m.treinamento?.videoUrl ?? treinoBase?.videoUrl ?? null,
          videoNome: m.treinamento?.videoNome ?? treinoBase?.videoNome ?? null,
          videoTamanhoBytes:
            m.treinamento?.videoTamanhoBytes ?? treinoBase?.videoTamanhoBytes ?? null,
          videoMimeType: m.treinamento?.videoMimeType ?? treinoBase?.videoMimeType ?? null,
          descricao: m.treinamento?.descricao ?? treinoBase?.descricao ?? null,
        },
      });
      if (trilhaLocal) {
        setTrilha(trilhaLocal);
        setIndiceAtual(trilhaLocal.indiceAtual);
      }
    },
    [matriculaInicial, onAtualizado, titulo, treinamentoId],
  );

  const carregarTrilha = useCallback(async () => {
    setCarregando(true);
    try {
      if (!matriculaId) {
        const criada = await ingressarTreinamento(treinamentoId);
        setMatriculaId(criada.id);
        statusRef.current = criada.status;
        setStatus(criada.status);
      }
      const estado = await buscarTrilhaTreinamento(treinamentoId);
      setTrilha(estado);
      setIndiceAtual(estado.indiceAtual);
      statusRef.current = estado.matricula.status;
      setStatus(estado.matricula.status);
      setMatriculaId(estado.matricula.id);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setCarregando(false);
    }
  }, [matriculaId, treinamentoId]);

  useEffect(() => {
    void carregarTrilha();
  }, [carregarTrilha]);

  const mudarStatusLegado = useCallback(
    async (proximo: MatriculaTreinamentoStatus) => {
      if (proximo === statusRef.current) return;
      if (persistindoRef.current) return;
      if (statusRef.current === 'CONCLUIDO') return;

      persistindoRef.current = true;
      try {
        let id = matriculaId;
        if (!id) {
          const criada = await ingressarTreinamento(treinamentoId);
          id = criada.id;
          setMatriculaId(id);
        }
        const atualizada = await atualizarMatricula(id, { status: proximo });
        notificarMatricula(atualizada);
        if (proximo === 'CONCLUIDO') {
          toast.success('Treinamento concluído.');
        }
      } catch (err) {
        toast.error(formatApiError(err));
      } finally {
        persistindoRef.current = false;
      }
    },
    [matriculaId, notificarMatricula, treinamentoId],
  );

  const itemAtual: TreinamentoTrilhaItemParticipante | null =
    trilha && trilha.itens.length > 0 ? trilha.itens[indiceAtual] ?? null : null;

  async function aoTerminarVideo(itemId: number) {
    if (marcandoVideo) return;
    setMarcandoVideo(true);
    try {
      const matriculaAtualizada = await concluirVideoItemTreinamento(treinamentoId, itemId);
      const estado = await buscarTrilhaTreinamento(treinamentoId);
      notificarMatricula(matriculaAtualizada, estado);
      if (matriculaAtualizada.status === 'CONCLUIDO') {
        toast.success('Parabéns! Você concluiu o treinamento.');
      } else {
        toast.success('Etapa concluída. Avance para a próxima.');
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setMarcandoVideo(false);
    }
  }

  async function enviarResposta(itemId: number) {
    if (respostaSelecionada == null) {
      toast.error('Selecione uma alternativa.');
      return;
    }
    setEnviandoQuestao(true);
    setFeedbackQuestao(null);
    try {
      const resultado = await responderQuestaoItemTreinamento(
        treinamentoId,
        itemId,
        respostaSelecionada,
      );
      notificarMatricula(resultado.matricula);
      if (resultado.correta) {
        setFeedbackQuestao('ok');
        const estado = await buscarTrilhaTreinamento(treinamentoId);
        notificarMatricula(resultado.matricula, estado);
        if (resultado.matricula.status === 'CONCLUIDO') {
          toast.success('Parabéns! Você concluiu o treinamento.');
        } else {
          toast.success('Resposta correta!');
        }
        setRespostaSelecionada(null);
      } else {
        setFeedbackQuestao('erro');
        toast.error('Resposta incorreta. Tente novamente.');
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setEnviandoQuestao(false);
    }
  }

  useEffect(() => {
    setRespostaSelecionada(null);
    setFeedbackQuestao(null);
  }, [indiceAtual, itemAtual?.id]);

  const modoLegado = trilha?.modoLegado ?? false;
  const srcLegado = modoLegado ? urlVideoTreinamento(treinamentoId) : null;
  const descricao = trilha?.treinamento.descricao ?? matriculaInicial.treinamento?.descricao;

  return (
    <Modal
      title={titulo}
      onClose={onClose}
      size="lg"
      footer={
        <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">
          Fechar
        </button>
      }
    >
      {descricao ? (
        <p className="text-sm text-white/70 mb-3 whitespace-pre-wrap">{descricao}</p>
      ) : null}

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <StatusBadge status={status} />
        {trilha && trilha.itens.length > 0 ? (
          <span className="text-xs text-white/45">
            Etapa {indiceAtual + 1} de {trilha.itens.length}
          </span>
        ) : (
          <span className="text-xs text-white/45">
            {status === 'PENDENTE'
              ? 'Inicie o vídeo para começar'
              : status === 'EM_ANDAMENTO'
                ? 'Assista até o fim para concluir'
                : 'Treinamento concluído'}
          </span>
        )}
      </div>

      {carregando ? (
        <p className="text-sm text-white/60 py-8 text-center">Carregando trilha...</p>
      ) : modoLegado && srcLegado ? (
        <video
          key={srcLegado}
          src={srcLegado}
          controls
          playsInline
          controlsList="nodownload"
          className="w-full max-h-[70vh] rounded-lg bg-black border border-white/10"
          preload="metadata"
          onPlay={() => {
            if (statusRef.current === 'PENDENTE') {
              void mudarStatusLegado('EM_ANDAMENTO');
            }
          }}
          onEnded={() => {
            void mudarStatusLegado('CONCLUIDO');
          }}
        />
      ) : trilha && trilha.itens.length > 0 && itemAtual ? (
        <div className="space-y-4">
          <ul className="flex flex-wrap gap-2">
            {trilha.itens.map((item, idx) => {
              const feito = item.progresso.concluido;
              const atual = idx === indiceAtual;
              return (
                <li
                  key={item.id}
                  className={`text-xs px-2 py-1 rounded border ${
                    atual
                      ? 'border-violet-400/60 bg-violet-500/20 text-violet-100'
                      : feito
                        ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                        : 'border-white/15 bg-white/5 text-white/50'
                  }`}
                >
                  {item.ordem}. {item.tipo === 'VIDEO' ? 'Vídeo' : 'Questão'}
                  {feito ? ' ✓' : ''}
                </li>
              );
            })}
          </ul>

          {itemAtual.titulo ? (
            <p className="text-sm font-medium text-white/90">{itemAtual.titulo}</p>
          ) : null}

          {itemAtual.tipo === 'VIDEO' ? (
            <EtapaVideo
              treinamentoId={treinamentoId}
              item={itemAtual}
              marcando={marcandoVideo}
              onPlay={() => {
                if (statusRef.current === 'PENDENTE') {
                  void mudarStatusLegado('EM_ANDAMENTO');
                }
              }}
              onEnded={() => void aoTerminarVideo(itemAtual.id)}
            />
          ) : itemAtual.questao ? (
            <EtapaQuestao
              item={itemAtual}
              grupoRadio={grupoRadio}
              respostaSelecionada={respostaSelecionada}
              onSelecionar={setRespostaSelecionada}
              feedback={feedbackQuestao}
              enviando={enviandoQuestao}
              onEnviar={() => void enviarResposta(itemAtual.id)}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-red-300">
          Não foi possível carregar o conteúdo. O RH ainda pode estar montando a trilha.
        </p>
      )}
    </Modal>
  );
}

function EtapaVideo({
  treinamentoId,
  item,
  marcando,
  onPlay,
  onEnded,
}: {
  treinamentoId: number;
  item: TreinamentoTrilhaItemParticipante;
  marcando: boolean;
  onPlay: () => void;
  onEnded: () => void;
}) {
  const src = urlVideoItemTreinamento(treinamentoId, item.id);
  if (!src) {
    return <p className="text-sm text-red-300">Faça login novamente para assistir ao vídeo.</p>;
  }

  return (
    <div className="space-y-2">
      {item.videoNome ? (
        <p className="text-xs text-white/55">{item.videoNome}</p>
      ) : null}
      <video
        key={src}
        src={src}
        controls
        playsInline
        controlsList="nodownload"
        className="w-full max-h-[60vh] rounded-lg bg-black border border-white/10"
        preload="metadata"
        onPlay={onPlay}
        onEnded={onEnded}
      />
      <p className="text-xs text-white/45">
        Assista o vídeo até o fim para liberar a próxima etapa.
        {marcando ? ' Salvando progresso…' : ''}
      </p>
    </div>
  );
}

function EtapaQuestao({
  item,
  grupoRadio,
  respostaSelecionada,
  onSelecionar,
  feedback,
  enviando,
  onEnviar,
}: {
  item: TreinamentoTrilhaItemParticipante;
  grupoRadio: string;
  respostaSelecionada: number | null;
  onSelecionar: (idx: number) => void;
  feedback: 'ok' | 'erro' | null;
  enviando: boolean;
  onEnviar: () => void;
}) {
  const q = item.questao!;
  const jaConcluida = item.progresso.concluido;

  return (
    <div className="rounded-lg border border-white/15 bg-white/5 p-4 space-y-3">
      <p className="text-sm text-white/90 whitespace-pre-wrap">{q.enunciado}</p>
      <div className="space-y-2">
        {q.alternativas.map((alt, i) => (
          <label
            key={i}
            className={`flex items-start gap-2 text-sm rounded-md px-2 py-2 border ${
              jaConcluida && item.progresso.respostaIndice === i
                ? 'border-emerald-400/50 bg-emerald-500/10'
                : 'border-white/10 hover:border-white/25'
            }`}
          >
            <input
              type="radio"
              name={grupoRadio}
              disabled={jaConcluida || enviando}
              checked={respostaSelecionada === i}
              onChange={() => onSelecionar(i)}
              className="mt-1"
            />
            <span className="text-white/85">{alt.texto}</span>
          </label>
        ))}
      </div>
      {feedback === 'erro' ? (
        <p className="text-xs text-red-300">Resposta incorreta. Leia o enunciado e tente outra alternativa.</p>
      ) : null}
      {feedback === 'ok' ? (
        <p className="text-xs text-emerald-300">Resposta correta!</p>
      ) : null}
      {!jaConcluida ? (
        <button
          type="button"
          disabled={enviando}
          onClick={onEnviar}
          className="px-3 py-1.5 rounded bg-primary text-neutral text-sm font-semibold disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : 'Confirmar resposta'}
        </button>
      ) : (
        <p className="text-xs text-emerald-300/90">Questão concluída.</p>
      )}
    </div>
  );
}
