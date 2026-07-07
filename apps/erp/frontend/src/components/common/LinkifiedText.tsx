import type { MouseEvent } from 'react';
import { isErpMobileWebView, openUrlInErpMobile } from '../../utils/erpMobile';
import { hrefForLinkifiedPart, parseLinkifiedParts } from '../../utils/linkifyText';

type Props = {
  text: string;
  className?: string;
  linkClassName?: string;
};

export function LinkifiedText({ text, className = '', linkClassName = '' }: Props) {
  if (!text) return null;

  const parts = parseLinkifiedParts(text);

  const handleLinkClick = (e: MouseEvent<HTMLAnchorElement>, href: string, isEmail: boolean) => {
    if (isEmail || !isErpMobileWebView()) return;
    e.preventDefault();
    openUrlInErpMobile(href);
  };

  return (
    <span
      className={`min-w-0 max-w-full break-words [overflow-wrap:anywhere] ${className}`}
    >
      {parts.map((part, index) => {
        if (part.type === 'link') {
          const { href, isEmail } = hrefForLinkifiedPart(part.value);

          return (
            <a
              key={`${part.value}-${index}`}
              href={href}
              target={isEmail ? '_self' : '_blank'}
              rel={isEmail ? undefined : 'noopener noreferrer'}
              onClick={(e) => handleLinkClick(e, href, isEmail)}
              className={`text-primary hover:underline break-all [overflow-wrap:anywhere] ${linkClassName}`}
            >
              {part.value}
            </a>
          );
        }

        return <span key={`text-${index}`}>{part.value}</span>;
      })}
    </span>
  );
}
