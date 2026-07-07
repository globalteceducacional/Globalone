export type LinkifiedPart = { type: 'text' | 'link'; value: string };

const URL_REGEX =
  /((https?:\/\/|www\.)[^\s<]+)|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

/** Remove pontuação final comum colada em URLs (ex.: "https://...)."). */
function trimTrailingUrlPunctuation(value: string): string {
  return value.replace(/[),.;:!?\]]+$/g, '');
}

export function parseLinkifiedParts(text: string): LinkifiedPart[] {
  if (!text) return [];

  const parts: LinkifiedPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // eslint-disable-next-line no-cond-assign
  while ((match = URL_REGEX.exec(text)) !== null) {
    const matchText = trimTrailingUrlPunctuation(match[0]);
    const index = match.index;

    if (!matchText) continue;

    if (index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, index) });
    }

    parts.push({ type: 'link', value: matchText });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', value: text }];
}

export function hrefForLinkifiedPart(raw: string): { href: string; isEmail: boolean } {
  const isEmail = raw.includes('@') && !raw.startsWith('http') && !raw.startsWith('www.');
  if (isEmail) {
    return { href: `mailto:${raw}`, isEmail: true };
  }
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return { href: raw, isEmail: false };
  }
  if (raw.startsWith('www.')) {
    return { href: `https://${raw}`, isEmail: false };
  }
  return { href: `https://${raw}`, isEmail: false };
}
