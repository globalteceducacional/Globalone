import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = {
  content: string;
  className?: string;
};

/** Renderiza Markdown com aparência próxima ao GitHub (GFM: tabelas, listas, etc.). */
export function MarkdownFileViewer({ content, className = '' }: Props) {
  return (
    <article
      className={`markdown-body file-markdown-github ${className}`}
      data-color-mode="dark"
      data-dark-theme="dark"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...rest }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
