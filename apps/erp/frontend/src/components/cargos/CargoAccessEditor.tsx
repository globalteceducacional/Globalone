import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CargoPermission } from '../../types';

type PaginaOption = { value: string; label: string };

const MODULO_LABELS: Record<string, string> = {
  financeiro: 'Financeiro',
  projetos: 'Projetos',
  trabalhos: 'Trabalhos',
  compras: 'Compras',
  estoque: 'Estoque',
  almoxarifado: 'Almoxarifado',
  curadoria: 'Curadoria',
  setores: 'Setores',
  usuarios: 'Usuários',
  notificacoes: 'Notificações',
  dashboard: 'Dashboard',
  calendario: 'Calendário',
  sistema: 'Sistema',
  ponto: 'Ponto',
  jornada: 'Jornada',
  espelho: 'Espelho de ponto',
  solicitacoes_ponto: 'Solicitações de ponto',
  banco_horas: 'Banco de horas',
  ferias: 'Férias',
  afastamentos: 'Afastamentos',
  documentos_rh: 'Documentos RH',
  avaliacoes: 'Avaliações',
  treinamentos: 'Treinamentos',
  rh_dashboard: 'Dashboard RH',
  folha: 'Folha',
  rh: 'RH',
};

const MODULO_ORDEM = [
  'financeiro',
  'projetos',
  'trabalhos',
  'compras',
  'estoque',
  'almoxarifado',
  'curadoria',
  'calendario',
  'ponto',
  'jornada',
  'espelho',
  'solicitacoes_ponto',
  'banco_horas',
  'rh',
  'ferias',
  'afastamentos',
  'documentos_rh',
  'avaliacoes',
  'treinamentos',
  'rh_dashboard',
  'folha',
  'setores',
  'usuarios',
  'notificacoes',
  'dashboard',
  'sistema',
];

const inputCls =
  'w-full bg-neutral/80 border border-white/20 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary';

interface CargoAccessEditorProps {
  paginasPermitidas: string[];
  permissions: string[];
  todasPaginas: PaginaOption[];
  permissionsByModule: Record<string, CargoPermission[]>;
  onTogglePagina: (value: string) => void;
  onTogglePermissao: (value: string) => void;
  onSetPaginas: (values: string[]) => void;
  onSetModuloPermissoes: (chaves: string[], ativar: boolean) => void;
}

type AbaAcesso = 'paginas' | 'permissoes';

function labelModulo(modulo: string) {
  return MODULO_LABELS[modulo] ?? modulo.replace(/_/g, ' ');
}

function filtrarPermissoes(lista: CargoPermission[], termo: string) {
  const t = termo.trim().toLowerCase();
  if (!t) return lista;
  return lista.filter(
    (p) =>
      p.chave.toLowerCase().includes(t) ||
      (p.descricao ?? '').toLowerCase().includes(t) ||
      p.acao.toLowerCase().includes(t),
  );
}

interface AccordionRowProps {
  aberto: boolean;
  onToggle: () => void;
  titulo: string;
  subtitulo?: string;
  badge?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
}

function AccordionRow({ aberto, onToggle, titulo, subtitulo, badge, acoes, children }: AccordionRowProps) {
  return (
    <div
      className={`rounded-lg border overflow-hidden transition-colors ${
        aberto ? 'border-primary/30 bg-primary/[0.04]' : 'border-white/10 bg-neutral/30'
      }`}
    >
      <div className="flex items-stretch min-h-[44px]">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors min-w-0"
        >
          <span
            className={`shrink-0 text-white/45 text-xs transition-transform duration-200 ${
              aberto ? 'rotate-90' : ''
            }`}
            aria-hidden
          >
            ▶
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-white truncate">{titulo}</span>
            {subtitulo ? (
              <span className="block text-xs text-white/45 truncate">{subtitulo}</span>
            ) : null}
          </span>
          {badge}
        </button>
        {acoes ? (
          <div className="flex items-center shrink-0 border-l border-white/10 px-2">{acoes}</div>
        ) : null}
      </div>
      {aberto ? (
        <div className="border-t border-white/10 bg-neutral/50 px-3 py-2">{children}</div>
      ) : null}
    </div>
  );
}

export function CargoAccessEditor({
  paginasPermitidas,
  permissions,
  todasPaginas,
  permissionsByModule,
  onTogglePagina,
  onTogglePermissao,
  onSetPaginas,
  onSetModuloPermissoes,
}: CargoAccessEditorProps) {
  const [aba, setAba] = useState<AbaAcesso>('paginas');
  const [buscaPaginas, setBuscaPaginas] = useState('');
  const [buscaPerm, setBuscaPerm] = useState('');
  const [modulosAbertos, setModulosAbertos] = useState<Set<string>>(new Set());

  const modulosOrdenados = useMemo(() => {
    const keys = Object.keys(permissionsByModule);
    return keys.sort((a, b) => {
      const ia = MODULO_ORDEM.indexOf(a);
      const ib = MODULO_ORDEM.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [permissionsByModule]);

  const modulosFiltrados = useMemo(() => {
    const t = buscaPerm.trim().toLowerCase();
    if (!t) return modulosOrdenados;
    return modulosOrdenados.filter((modulo) => {
      if (labelModulo(modulo).toLowerCase().includes(t)) return true;
      const lista = permissionsByModule[modulo] ?? [];
      return lista.some(
        (p) =>
          p.chave.toLowerCase().includes(t) ||
          (p.descricao ?? '').toLowerCase().includes(t) ||
          p.acao.toLowerCase().includes(t),
      );
    });
  }, [modulosOrdenados, permissionsByModule, buscaPerm]);

  useEffect(() => {
    const t = buscaPerm.trim();
    if (!t) return;
    setModulosAbertos((prev) => {
      const next = new Set(prev);
      for (const modulo of modulosFiltrados) next.add(modulo);
      return next;
    });
  }, [buscaPerm, modulosFiltrados]);

  const paginasFiltradas = useMemo(() => {
    const t = buscaPaginas.trim().toLowerCase();
    if (!t) return todasPaginas;
    return todasPaginas.filter(
      (p) => p.label.toLowerCase().includes(t) || p.value.toLowerCase().includes(t),
    );
  }, [todasPaginas, buscaPaginas]);

  const catalogKeys = useMemo(
    () => new Set(Object.values(permissionsByModule).flatMap((list) => list.map((p) => p.chave))),
    [permissionsByModule],
  );

  const totalPermissoes = catalogKeys.size;

  const permissoesMarcadas = useMemo(() => {
    const marcadas = new Set(permissions);
    let count = 0;
    for (const chave of catalogKeys) {
      if (marcadas.has(chave)) count += 1;
    }
    return count;
  }, [permissions, catalogKeys]);

  const contagemModulo = (modulo: string) => {
    const total = permissionsByModule[modulo]?.length ?? 0;
    const marcadas =
      permissionsByModule[modulo]?.filter((p) => permissions.includes(p.chave)).length ?? 0;
    return { marcadas, total };
  };

  function toggleModulo(modulo: string) {
    setModulosAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(modulo)) next.delete(modulo);
      else next.add(modulo);
      return next;
    });
  }

  function expandirTodosModulos() {
    setModulosAbertos(new Set(modulosFiltrados));
  }

  function recolherTodosModulos() {
    setModulosAbertos(new Set());
  }

  const btnAcaoCls =
    'text-xs px-2.5 py-1.5 rounded-md border border-white/15 text-white/70 hover:bg-white/10 whitespace-nowrap';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 bg-white/[0.03]">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setAba('paginas')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              aba === 'paginas'
                ? 'bg-primary/20 text-primary'
                : 'text-white/65 hover:bg-white/10 hover:text-white'
            }`}
          >
            Páginas
            <span className="ml-1.5 text-xs opacity-80">
              ({paginasPermitidas.length}/{todasPaginas.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAba('permissoes')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              aba === 'permissoes'
                ? 'bg-primary/20 text-primary'
                : 'text-white/65 hover:bg-white/10 hover:text-white'
            }`}
          >
            Permissões
            <span className="ml-1.5 text-xs opacity-80">
              ({permissoesMarcadas}/{totalPermissoes})
            </span>
          </button>
        </div>
        <p className="text-xs text-white/45 hidden sm:block">
          {aba === 'paginas'
            ? 'Menu lateral — rotas que o cargo enxerga'
            : 'Clique na linha do módulo para ver e marcar permissões'}
        </p>
      </div>

      {aba === 'paginas' ? (
        <div className="p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={buscaPaginas}
              onChange={(e) => setBuscaPaginas(e.target.value)}
              placeholder="Buscar página…"
              className={`${inputCls} flex-1 min-w-[180px]`}
            />
            <button
              type="button"
              className={btnAcaoCls}
              onClick={() => {
                const vals = paginasFiltradas.map((p) => p.value);
                const set = new Set([...paginasPermitidas, ...vals]);
                onSetPaginas(Array.from(set));
              }}
            >
              Marcar visíveis
            </button>
            <button
              type="button"
              className={btnAcaoCls}
              onClick={() => {
                const remover = new Set(paginasFiltradas.map((p) => p.value));
                onSetPaginas(paginasPermitidas.filter((v) => !remover.has(v)));
              }}
            >
              Desmarcar visíveis
            </button>
            <button
              type="button"
              className={btnAcaoCls}
              onClick={() => onSetPaginas(todasPaginas.map((p) => p.value))}
            >
              Todas
            </button>
            <button
              type="button"
              className={btnAcaoCls}
              onClick={() => onSetPaginas([])}
            >
              Limpar
            </button>
          </div>

          <div className="max-h-[min(42vh,360px)] overflow-y-auto rounded-lg border border-white/10 bg-neutral/40 p-2">
            {paginasFiltradas.length === 0 ? (
              <p className="text-sm text-white/50 py-6 text-center">Nenhuma página encontrada.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                {paginasFiltradas.map((pagina) => {
                  const checked = paginasPermitidas.includes(pagina.value);
                  return (
                    <label
                      key={pagina.value}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors ${
                        checked ? 'bg-primary/10 text-white' : 'text-white/80 hover:bg-white/5'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onTogglePagina(pagina.value)}
                        className="w-4 h-4 shrink-0 rounded border-white/20 bg-neutral text-primary focus:ring-primary"
                      />
                      <span className="truncate" title={pagina.label}>
                        {pagina.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={buscaPerm}
              onChange={(e) => setBuscaPerm(e.target.value)}
              placeholder="Buscar módulo ou permissão…"
              className={`${inputCls} flex-1 min-w-[180px]`}
            />
            <button type="button" className={btnAcaoCls} onClick={expandirTodosModulos}>
              Expandir todos
            </button>
            <button type="button" className={btnAcaoCls} onClick={recolherTodosModulos}>
              Recolher todos
            </button>
          </div>

          <div className="max-h-[min(48vh,420px)] overflow-y-auto space-y-2 pr-0.5">
            {modulosFiltrados.length === 0 ? (
              <p className="text-sm text-white/50 py-8 text-center rounded-lg border border-white/10 bg-neutral/40">
                Nenhum módulo ou permissão encontrada.
              </p>
            ) : (
              modulosFiltrados.map((modulo) => {
                const { marcadas, total } = contagemModulo(modulo);
                const aberto = modulosAbertos.has(modulo);
                const listaModulo = permissionsByModule[modulo] ?? [];
                const listaVisivel = filtrarPermissoes(listaModulo, buscaPerm);
                const moduloTodoMarcado =
                  listaModulo.length > 0 &&
                  listaModulo.every((p) => permissions.includes(p.chave));
                const parcial = marcadas > 0 && marcadas < total;

                return (
                  <AccordionRow
                    key={modulo}
                    aberto={aberto}
                    onToggle={() => toggleModulo(modulo)}
                    titulo={labelModulo(modulo)}
                    subtitulo={`${marcadas} de ${total} permissões marcadas`}
                    badge={
                      <span
                        className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                          marcadas === total && total > 0
                            ? 'bg-primary/20 text-primary'
                            : parcial
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-white/10 text-white/50'
                        }`}
                      >
                        {marcadas}/{total}
                      </span>
                    }
                    acoes={
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded border border-white/15 text-white/65 hover:bg-white/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          const chaves = listaModulo.map((p) => p.chave);
                          onSetModuloPermissoes(chaves, !moduloTodoMarcado);
                        }}
                      >
                        {moduloTodoMarcado ? 'Limpar' : 'Todas'}
                      </button>
                    }
                  >
                    {listaVisivel.length === 0 ? (
                      <p className="text-sm text-white/50 py-3 text-center">
                        Nenhuma permissão neste filtro.
                      </p>
                    ) : (
                      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-1">
                        {listaVisivel.map((permission) => {
                          const checked = permissions.includes(permission.chave);
                          return (
                            <li key={permission.chave}>
                              <label
                                className={`flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
                                  checked ? 'bg-primary/10' : 'hover:bg-white/5'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => onTogglePermissao(permission.chave)}
                                  className="mt-0.5 w-4 h-4 shrink-0 rounded border-white/20 bg-neutral text-primary focus:ring-primary"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm text-white/90 leading-snug">
                                    {permission.descricao || permission.acao}
                                  </span>
                                  <span className="block text-[11px] text-white/40 font-mono truncate">
                                    {permission.chave}
                                  </span>
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </AccordionRow>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

