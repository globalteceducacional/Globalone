import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { FileViewerModal } from '../components/files/FileViewerModal';
import { fileDisplayName } from '../utils/filePreview';

export type FileViewerItem = {
  /** Caminho relativo, URL absoluta ou data URL */
  src: string;
  name?: string;
};

type FileViewerContextValue = {
  openViewer: (items: FileViewerItem[], startIndex?: number) => void;
  closeViewer: () => void;
};

const FileViewerContext = createContext<FileViewerContextValue | null>(null);

export function urlsToViewerItems(
  urls: string[],
  nameForIndex?: (url: string, index: number) => string,
): FileViewerItem[] {
  return urls.map((src, i) => ({
    src,
    name: nameForIndex ? nameForIndex(src, i) : fileDisplayName(src, i),
  }));
}

export function FileViewerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ items: FileViewerItem[]; index: number } | null>(null);

  const closeViewer = useCallback(() => setSession(null), []);

  const openViewer = useCallback((items: FileViewerItem[], startIndex = 0) => {
    const list = items.filter((it) => it.src?.trim());
    if (list.length === 0) return;
    const idx = Math.max(0, Math.min(startIndex, list.length - 1));
    setSession({ items: list, index: idx });
  }, []);

  const value = useMemo(
    () => ({ openViewer, closeViewer }),
    [openViewer, closeViewer],
  );

  return (
    <FileViewerContext.Provider value={value}>
      {children}
      {session && (
        <FileViewerModal
          items={session.items}
          initialIndex={session.index}
          onClose={closeViewer}
        />
      )}
    </FileViewerContext.Provider>
  );
}

export function useFileViewer(): FileViewerContextValue {
  const ctx = useContext(FileViewerContext);
  if (!ctx) {
    throw new Error('useFileViewer deve ser usado dentro de FileViewerProvider');
  }
  return ctx;
}

/** Abre o visualizador a partir de URLs (quando o hook não está disponível). */
export function useFileViewerOptional(): FileViewerContextValue | null {
  return useContext(FileViewerContext);
}
