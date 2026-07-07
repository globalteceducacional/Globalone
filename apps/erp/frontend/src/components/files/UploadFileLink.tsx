import type { ReactNode } from 'react';
import { fileDisplayName } from '../../utils/filePreview';
import { FilePreviewTrigger } from './FilePreviewTrigger';

type Props = {
  src: string;
  name?: string;
  children?: ReactNode;
  className?: string;
};

/** Abre upload, data URL ou caminho protegido no visualizador global (evita `<a href="/uploads">`). */
export function UploadFileLink({ src, name, children, className }: Props) {
  const trimmed = src?.trim();
  if (!trimmed) return null;
  const label = children ?? name ?? fileDisplayName(trimmed, 0);
  return (
    <FilePreviewTrigger
      src={trimmed}
      name={name}
      className={className ?? 'text-sm text-primary hover:underline text-left'}
    >
      {label}
    </FilePreviewTrigger>
  );
}
