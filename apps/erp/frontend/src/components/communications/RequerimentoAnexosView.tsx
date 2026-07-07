import { AttachmentList } from '../files/AttachmentList';

type Props = {
  raw: string | null | undefined;
  title?: string;
};

/** Anexos de requerimento com visualizador interno. */
export function RequerimentoAnexosView({ raw, title = 'Anexos' }: Props) {
  return <AttachmentList raw={raw} title={title} variant="grid" />;
}
