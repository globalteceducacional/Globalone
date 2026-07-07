import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getConfidencialidadeUsuario,
  type ConfidencialidadeUsuarioResponse,
} from '../../services/documentos';
import { btn } from '../../utils/buttonStyles';
import { ProfileSectionTitle } from '../users/UserDirectoryUi';
import { TERMO_CONFIDENCIALIDADE } from '../../constants/documentosLabels';

interface Props {
  usuarioId: number;
  isOwn: boolean;
  podeGerenciar: boolean;
}

export function ProfileConfidencialidade({ usuarioId, isOwn, podeGerenciar }: Props) {
  const [dados, setDados] = useState<ConfidencialidadeUsuarioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const res = await getConfidencialidadeUsuario(usuarioId);
      setDados(res);
    } catch {
      setErro('Não foi possível carregar o termo de confidencialidade.');
      setDados(null);
    } finally {
      setLoading(false);
    }
  }, [usuarioId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const baseUrl =
    (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/api\/?$/, '') ?? '';

  const assinado = Boolean(dados?.documento);
  const pendente = Boolean(dados?.convitePendente) && !assinado;

  return (
    <section>
      <ProfileSectionTitle>{TERMO_CONFIDENCIALIDADE.titulo}</ProfileSectionTitle>

      {loading && <p className="text-sm text-white/45">Carregando...</p>}

      {!loading && erro && <p className="text-sm text-red-400">{erro}</p>}

      {!loading && !erro && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white/90">
                Termo de Confidencialidade e Sigilo
              </p>
              <p className="mt-1 text-xs text-white/50 max-w-xl">
                Documento para {TERMO_CONFIDENCIALIDADE.publico.toLowerCase()}. Após assinar, o arquivo fica
                vinculado a este perfil.
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                assinado
                  ? 'bg-green-500/20 text-green-300'
                  : pendente
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-white/10 text-white/50'
              }`}
            >
              {assinado ? 'Assinado' : pendente ? 'Pendente' : 'Não assinado'}
            </span>
          </div>

          {assinado && dados?.documento && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-white/70">
                Assinado em{' '}
                {new Date(dados.documento.criadoEm).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              <a
                href={`${baseUrl}${dados.documento.url}`}
                target="_blank"
                rel="noreferrer"
                className={btn.editSm}
                download
              >
                Baixar PDF
              </a>
            </div>
          )}

          {!assinado && pendente && dados?.convitePendente && (
            <p className="text-xs text-amber-300/90">
              Há um link de assinatura pendente
              {dados.convitePendente.expiresAt
                ? ` (válido até ${new Date(dados.convitePendente.expiresAt).toLocaleDateString('pt-BR')})`
                : ''}
              .
            </p>
          )}

          {(isOwn || podeGerenciar) && !assinado && (
            <div className="flex flex-wrap gap-2 pt-1">
              {isOwn && (
                <Link
                  to={`/perfil/${usuarioId}/termo-confidencialidade`}
                  className={btn.primarySm}
                >
                  Assinar agora
                </Link>
              )}
              {pendente && dados?.convitePendente && (
                <Link
                  to={`/doc/${dados.convitePendente.token}`}
                  className={btn.editSm}
                  target={isOwn ? undefined : '_blank'}
                  rel={isOwn ? undefined : 'noreferrer'}
                >
                  Abrir link de assinatura
                </Link>
              )}
            </div>
          )}

          {!isOwn && !podeGerenciar && !assinado && (
            <p className="text-xs text-white/45">Aguardando assinatura do colaborador.</p>
          )}
        </div>
      )}
    </section>
  );
}
