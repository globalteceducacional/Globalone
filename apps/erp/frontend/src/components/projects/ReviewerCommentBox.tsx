import { LinkifiedText } from '../common/LinkifiedText';

type Variant = 'amber' | 'warning' | 'inline';

type Props = {
  text: string;
  label?: string;
  variant?: Variant;
  className?: string;
};

const VARIANT_STYLES: Record<
  Variant,
  { box: string; label: string; text: string; link: string }
> = {
  amber: {
    box: 'rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 min-w-0 max-w-full overflow-hidden',
    label: 'text-[10px] uppercase text-amber-300/70 mb-1',
    text: 'text-xs text-amber-100/90 whitespace-pre-wrap',
    link: 'text-amber-200 hover:text-amber-100',
  },
  warning: {
    box: 'w-full min-w-0 max-w-full overflow-hidden rounded-md border border-warning/30 bg-warning/10 px-4 py-3',
    label: 'block text-sm font-medium text-white/90 mb-2',
    text: 'text-warning whitespace-pre-wrap',
    link: 'text-warning underline decoration-warning/50',
  },
  inline: {
    box: 'rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning min-w-0 max-w-full overflow-hidden',
    label: 'font-semibold block mb-1',
    text: 'text-white/80 whitespace-pre-wrap',
    link: 'text-primary hover:underline',
  },
};

export function ReviewerCommentBox({
  text,
  label = 'Comentário do avaliador',
  variant = 'amber',
  className = '',
}: Props) {
  const styles = VARIANT_STYLES[variant];

  if (variant === 'inline') {
    return (
      <div className={`${styles.box} ${className}`}>
        <p className={styles.label}>{label}</p>
        <LinkifiedText text={text} className={styles.text} linkClassName={styles.link} />
      </div>
    );
  }

  if (variant === 'warning') {
    return (
      <div className={`min-w-0 max-w-full ${className}`}>
        <p className={styles.label}>{label}</p>
        <div className={styles.box}>
          <LinkifiedText text={text} className={styles.text} linkClassName={styles.link} />
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.box} ${className}`}>
      <p className={styles.label}>{label}</p>
      <LinkifiedText text={text} className={styles.text} linkClassName={styles.link} />
    </div>
  );
}
