import { useEffect, useState } from 'react';
import axios from 'axios';
import { btn } from '../../utils/buttonStyles';
import type { PatentePastaItem } from '../../constants/patentesDocumentosLabels';
import {
  arquivarDocumentoGerado,
  listarPatentesPastas,
} from '../../services/patentesDocumentos';
import type { DocumentoSalvoInfo } from '../../types/documentoSalvo';

interface Props {
  documento: DocumentoSalvoInfo;
  onConcluido: () => void;
}

function mensagemErro(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return fallback;
}

const inputCls =
  'w-full rounded-md border border-white/20 bg-neutral/90 px-3 py-2 text-sm text-white placeholder:text-white/40';

export function ArquivarDocumentoPastaModal({ documento, onConcluido }: Props) {
  const [pastas, setPastas] = useState<PatentePastaItem[]>([]);
  const [loadingPastas, setLoadingPastas] = useState(true);
  const [modo, setModo] = useState<'existente' | 'nova'>('existente');
  const [pastaId, setPastaId] = useState<number | ''>('');
  const [nomeNovaPasta, setNomeNovaPasta] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    listarPatentesPastas()
      .then((lista) => {
        setPastas(lista);
        if (lista.length === 0) {
          setModo('nova');
        } else {
          setPastaId(lista[0].id);
        }
      })
      .catch(() => setErro('Não foi possível carregar as pastas.'))
      .finally(() => setLoadingPastas(false));
  }, []);

  const arquivar = async () => {
    setSalvando(true);
    setErro('');
    try {
      if (modo === 'existente') {
        if (pastaId === '') {
          setErro('Selecione uma pasta.');
          setSalvando(false);
          return;
        }
        await arquivarDocumentoGerado({
          documentoGlobaltecId: documento.id,
          pastaId: Number(pastaId),
        });
      } else {
        const nome = nomeNovaPasta.trim();
        if (!nome) {
          setErro('Informe o nome da nova pasta.');
          setSalvando(false);
          return;
        }
        await arquivarDocumentoGerado({
          documentoGlobaltecId: documento.id,
          novaPastaNome: nome,
        });
      }
      onConcluido();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível arquivar o documento.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-neutral p-6 shadow-2xl">
        <p className="font-semibold text-white">Arquivar em pasta?</p>
        <p className="mt-1 text-xs text-white/50">
          Envie <span className="text-white/80">{documento.nomeExibicao}</span> para uma pasta em
          Patentes e aplicações, ou pule esta etapa.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pastas.length === 0}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                modo === 'existente'
                  ? 'bg-primary text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              } ${pastas.length === 0 ? 'opacity-40' : ''}`}
              onClick={() => setModo('existente')}
            >
              Pasta existente
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                modo === 'nova'
                  ? 'bg-primary text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
              onClick={() => setModo('nova')}
            >
              Nova pasta
            </button>
          </div>

          {loadingPastas ? (
            <p className="text-xs text-white/40">Carregando pastas...</p>
          ) : modo === 'existente' ? (
            <select
              className={inputCls}
              value={pastaId === '' ? '' : String(pastaId)}
              onChange={(e) => setPastaId(e.target.value ? Number(e.target.value) : '')}
            >
              {pastas.length === 0 ? (
                <option value="">Nenhuma pasta — crie uma nova</option>
              ) : (
                pastas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))
              )}
            </select>
          ) : (
            <input
              className={inputCls}
              value={nomeNovaPasta}
              onChange={(e) => setNomeNovaPasta(e.target.value)}
              placeholder="Nome da pasta"
              maxLength={120}
            />
          )}

          {erro && <p className="text-xs text-red-400">{erro}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btn.secondary} onClick={onConcluido} disabled={salvando}>
              Agora não
            </button>
            <button type="button" className={btn.primary} onClick={arquivar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Arquivar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
