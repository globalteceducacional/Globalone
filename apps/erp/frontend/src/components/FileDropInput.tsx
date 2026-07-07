import { InputHTMLAttributes, useRef, useState } from 'react';

interface FileDropInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  onFilesSelected: (files: File[]) => void;
  dropMessage?: string;
}

export function FileDropInput({
  onFilesSelected,
  className,
  multiple,
  disabled,
  dropMessage = 'Solte o arquivo aqui',
  ...rest
}: FileDropInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const mergedInputClassName = [
    className ?? '',
    'block w-full min-h-[2.5rem] text-sm text-white/90',
    'file:mr-4 file:inline-flex file:h-9 file:cursor-pointer file:items-center file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white file:hover:bg-primary/90',
  ].join(' ');

  /**
   * Arrastar e soltar não preenche o &lt;input type="file"&gt; sozinho; o nome some na UI.
   * Sincronizamos com DataTransfer para o navegador exibir o arquivo como no clique.
   */
  function assignFilesToInput(files: File[]) {
    const el = inputRef.current;
    if (!el || files.length === 0) return;
    try {
      const dt = new DataTransfer();
      for (const f of files) {
        dt.items.add(f);
      }
      el.files = dt.files;
    } catch {
      // Ambientes muito antigos sem DataTransfer no input
    }
  }

  function handleFiles(raw: File[], fromNativePicker: boolean) {
    if (!raw.length) return;
    const files = multiple ? raw : raw.slice(0, 1);
    if (!fromNativePicker) {
      assignFilesToInput(files);
    }
    onFilesSelected(files);
  }

  return (
    <div
      className={`relative rounded-md ${isDragging ? 'ring-2 ring-primary ring-offset-2 ring-offset-transparent' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (disabled) return;
        handleFiles(Array.from(event.dataTransfer.files || []), false);
      }}
    >
      <input
        {...rest}
        ref={inputRef}
        type="file"
        multiple={multiple}
        disabled={disabled}
        className={mergedInputClassName}
        onChange={(event) => {
          handleFiles(Array.from(event.target.files || []), true);
        }}
      />
      {isDragging && !disabled && (
        <div className="pointer-events-none absolute inset-0 rounded-md border border-dashed border-primary bg-primary/10 flex items-center justify-center text-xs text-primary font-medium">
          {dropMessage}
        </div>
      )}
    </div>
  );
}
