import type { ReactNode } from 'react';
import { resolvePublicAssetUrl } from '../../utils/assetUrl';
import { toast } from '../../utils/toast';

/** Copia texto puro (sem HTML) para a área de transferência. */
export async function copyPlainTextToClipboard(text: string): Promise<boolean> {
  const value = text.trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyPlainTextButton({
  text,
  title = 'Copiar texto',
  className = '',
}: {
  text: string;
  title?: string;
  className?: string;
}) {
  const canCopy = Boolean(text.trim());

  if (!canCopy) return null;

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={() => {
        void (async () => {
          const ok = await copyPlainTextToClipboard(text);
          if (ok) toast.success('Copiado para a área de transferência.');
          else toast.error('Não foi possível copiar.');
        })();
      }}
      className={`shrink-0 rounded-md border border-white/15 bg-white/5 p-1.5 text-white/70 transition-colors hover:bg-white/15 hover:text-white ${className}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-3.5 w-3.5"
        aria-hidden
      >
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
    </button>
  );
}

/** Campo do perfil em cartão (modal / setor) com botão de copiar ao lado do rótulo. */
export function ProfileInfoBox({
  label,
  copyText,
  children,
  className = '',
}: {
  label: string;
  /** Texto puro enviado ao copiar; se omitido, não exibe botão. */
  copyText?: string | null;
  children?: ReactNode;
  className?: string;
}) {
  const plain = copyText?.trim() ?? '';
  const empty = !plain && !children;

  return (
    <div className={`rounded-lg border border-white/10 bg-white/5 p-3 ${className}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs text-white/45">{label}</p>
        <CopyPlainTextButton text={plain} title={`Copiar ${label}`} />
      </div>
      <div className={`text-sm leading-snug ${empty ? 'text-white/35 italic' : 'text-white'}`}>
        {children ?? (plain || '[Não informado]')}
      </div>
    </div>
  );
}

/** Inicial para avatar (primeira letra do nome). */
export function userInitial(nome: string): string {
  const t = nome?.trim();
  if (!t) return '?';
  return t.charAt(0).toUpperCase();
}

const avatarSizes = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-12 w-12 text-base',
  lg: 'h-16 w-16 text-xl',
  xl: 'h-20 w-20 text-2xl',
} as const;

export function UserAvatar({
  nome,
  fotoUrl,
  size = 'md',
  className = '',
}: {
  nome: string;
  fotoUrl?: string | null;
  size?: keyof typeof avatarSizes;
  className?: string;
}) {
  const src = resolvePublicAssetUrl(fotoUrl);
  return (
    <div
      className={`${avatarSizes[size]} shrink-0 rounded-full bg-primary overflow-hidden flex items-center justify-center font-semibold text-white shadow-lg shadow-primary/20 border-2 border-primary/50 ${className}`}
      aria-hidden={src ? undefined : true}
    >
      {src ? (
        <img
          src={src}
          alt={`Foto de ${nome}`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        userInitial(nome)
      )}
    </div>
  );
}

/** Título de seção (estilo referência: caixa alta, tracking). */
export function ProfileSectionTitle({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`text-[11px] font-semibold tracking-[0.12em] text-white/40 uppercase border-b border-white/10 pb-2.5 mb-4 ${className}`}
    >
      {children}
    </h3>
  );
}

/** Cartão base (perfil e lista). */
export const userProfileCardClass =
  'rounded-2xl border border-white/10 bg-[rgb(15_23_42_/_0.55)] backdrop-blur-sm shadow-xl shadow-black/20 overflow-hidden';

/** Nível de acesso legível a partir do nome do cargo. */
export function accessLevelLabel(cargoNome: string | undefined): string {
  return cargoNome?.trim() || 'Colaborador';
}

export function ProfileField({
  label,
  children,
  empty,
  className = '',
  copyText,
}: {
  label: string;
  children: ReactNode;
  empty?: boolean;
  /** Ex.: `sm:col-span-2` quando o campo fica dentro de uma `<dl>` em grid. */
  className?: string;
  /** Texto puro copiado (sem formatação HTML). */
  copyText?: string | null;
}) {
  const plain = copyText?.trim() ?? '';

  return (
    <div className={className}>
      <dt className="flex items-center justify-between gap-2 text-xs text-white/45 font-medium">
        <span>{label}</span>
        <CopyPlainTextButton text={plain} title={`Copiar ${label}`} />
      </dt>
      <dd className={`text-sm mt-1.5 leading-snug ${empty ? 'text-white/35 italic' : 'text-white'}`}>
        {children}
      </dd>
    </div>
  );
}
