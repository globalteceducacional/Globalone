import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx-js-style';
import { api } from '../services/api';
import { useAuthStore } from '../store/auth';
import { toast, formatApiError } from '../utils/toast';
import { btn } from '../utils/buttonStyles';
import { DataTable, DataTableColumn } from '../components/DataTable';
import { CollapsibleFilters } from '../components/filters/CollapsibleFilters';
import { AppSelect } from '../components/ui/AppSelect';
import { AppModal } from '../components/ui/AppModal';
import { FileDropInput } from '../components/FileDropInput';
import type { Category } from '../types/stock';
import type {
  LivroDisponivel,
  LivroReservado,
  LivroDisponivelPorFornecedor,
  OutrosItemAvaria,
  OutrosItemAlocado,
  OutrosItemDisponivel,
} from '../types/galpao';
import type { GalpaoProduto } from '../types/galpao';
import { userCanEditAlmoxarifado } from '../utils/almoxarifadoAccess';
import { renderSortableTableTh } from '../utils/sortableTableHeader';
import { useClientTableSort } from '../utils/useClientTableSort';
import { almoxarifadoMobileCardCls } from '../components/almoxarifado/almoxarifadoUi';

type TabKey = 'livros' | 'outros' | 'projeto';

type OutrosDispSortCol = 'item' | 'categoria' | 'qtd';

interface LivroReservadoAgrupado {
  isbn: string;
  nome: string;
  categoriaId: number | null;
  categoriaNome: string | null;
  quantidade: number;
  fornecedoresTexto: string;
  reservas: LivroReservado[];
}

export default function GalpaoProdutoDetails({
  produtoIdOverride,
  showBackButton = true,
  initialFiltersOpen = false,
  showLivroValorTotal = false,
  forcedTab,
  showSubTabs = true,
}: {
  produtoIdOverride?: number | null;
  showBackButton?: boolean;
  initialFiltersOpen?: boolean;
  showLivroValorTotal?: boolean;
  forcedTab?: TabKey;
  showSubTabs?: boolean;
}) {
  const { id } = useParams();

  const produtoId = useMemo(() => {
    if (produtoIdOverride != null) {
      const n = Number(produtoIdOverride);
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(id);
    return Number.isFinite(n) ? n : null;
  }, [id, produtoIdOverride]);

  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [produto, setProduto] = useState<GalpaoProduto | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(forcedTab ?? 'livros');
  const isForcedTab = forcedTab != null;
  const [showLivrosFilters, setShowLivrosFilters] = useState(initialFiltersOpen);
  const [showOutrosFilters, setShowOutrosFilters] = useState(initialFiltersOpen);
  const shouldShowProdutoName = !isForcedTab || forcedTab === 'projeto';
  const showLivroValorTotalColumn = showLivroValorTotal && !isForcedTab;
  const headerTitle =
    forcedTab === 'livros'
      ? 'Estoque de livros'
      : forcedTab === 'outros'
        ? 'Estoque de itens'
        : 'Produto do galpão';

  useEffect(() => {
    if (forcedTab) {
      setActiveTab(forcedTab);
    }
  }, [forcedTab]);

  // Filtro usado na aba "Projeto" (apenas para itens/Outros)
  const [projetoFilter, setProjetoFilter] = useState<string>('all');

  const permissionKeys = useMemo(() => {
    if (!user?.cargo || typeof user.cargo === 'string') return new Set<string>();
    const permissions = Array.isArray(user.cargo.permissions) ? user.cargo.permissions : [];
    return new Set(permissions.map((p) => p.chave ?? `${p.modulo}:${p.acao}`));
  }, [user]);
  const canEdit = userCanEditAlmoxarifado(permissionKeys);

  useEffect(() => {
    async function loadProdutosOptions() {
      setProdutosOptionsLoading(true);
      try {
        const { data } = await api.get<GalpaoProduto[]>('/galpao/produtos');
        setProdutosOptions(Array.isArray(data) ? data : []);
      } catch {
        setProdutosOptions([]);
      } finally {
        setProdutosOptionsLoading(false);
      }
    }

    if (canEdit) {
      void loadProdutosOptions();
    } else {
      setProdutosOptions([]);
    }
  }, [canEdit]);

  // Para a aba "Estoque de itens", o galpão pode permitir alocar/avariar
  // para um "produto do galpão" diferente do selecionado na tela.
  const [outrosProdutoIdQuery, setOutrosProdutoIdQuery] = useState<number | null>(produtoId);
  useEffect(() => {
    setOutrosProdutoIdQuery(produtoId);
  }, [produtoId]);

  const [produtosOptions, setProdutosOptions] = useState<GalpaoProduto[]>([]);
  const [produtosOptionsLoading, setProdutosOptionsLoading] = useState(false);

  // Modais de movimentação para "outros itens"
  const [outrosAllocateModalOpen, setOutrosAllocateModalOpen] = useState(false);
  const [outrosAllocateItem, setOutrosAllocateItem] = useState<OutrosItemDisponivel | null>(null);
  const [outrosAllocateProdutoId, setOutrosAllocateProdutoId] = useState<number | null>(null);
  const [outrosAllocateQuantidade, setOutrosAllocateQuantidade] = useState<number>(1);
  const [outrosAllocateLoading, setOutrosAllocateLoading] = useState(false);

  const [outrosAvariaModalOpen, setOutrosAvariaModalOpen] = useState(false);
  const [outrosAvariaItem, setOutrosAvariaItem] = useState<OutrosItemDisponivel | null>(null);
  const [outrosAvariaProdutoId, setOutrosAvariaProdutoId] = useState<number | null>(null);
  const [outrosAvariaQuantidade, setOutrosAvariaQuantidade] = useState<number>(1);
  const [outrosAvariaJustificativa, setOutrosAvariaJustificativa] = useState('');
  const [outrosAvariaLoading, setOutrosAvariaLoading] = useState(false);

  const [outrosAvariasLoading, setOutrosAvariasLoading] = useState(false);
  const [outrosAvarias, setOutrosAvarias] = useState<OutrosItemAvaria[]>([]);
  const [outrosAvariaEditRow, setOutrosAvariaEditRow] = useState<OutrosItemAvaria | null>(null);
  const [outrosAvariaEditJustificativa, setOutrosAvariaEditJustificativa] = useState('');
  const [outrosAvariaSavingJustificativa, setOutrosAvariaSavingJustificativa] = useState(false);
  const [outrosAvariaDeleteRow, setOutrosAvariaDeleteRow] = useState<OutrosItemAvaria | null>(null);
  const [outrosAvariaDeleting, setOutrosAvariaDeleting] = useState(false);

  // Livros (compartilhados)
  const [categoriesLivros, setCategoriesLivros] = useState<Category[]>([]);
  const [livrosSearch, setLivrosSearch] = useState('');
  const [livrosCategoriaId, setLivrosCategoriaId] = useState<number | 'all'>('all');

  const [livrosDisponiveis, setLivrosDisponiveis] = useState<LivroDisponivel[]>([]);
  const [livrosReservados, setLivrosReservados] = useState<LivroReservado[]>([]);
  const [livrosLoading, setLivrosLoading] = useState(false);
  const [livrosBaixaLoading, setLivrosBaixaLoading] = useState(false);

  const [livrosAllocateQty, setLivrosAllocateQty] = useState<Record<string, number>>({});
  const [livrosBaixaQty, setLivrosBaixaQty] = useState<Record<string, number>>({});
  const [livroReservaToEdit, setLivroReservaToEdit] = useState<LivroReservadoAgrupado | null>(null);
  const [livroReservaEditQuantidades, setLivroReservaEditQuantidades] = useState<Record<string, number>>({});
  const [livroReservaEditModalOpen, setLivroReservaEditModalOpen] = useState(false);
  const [livroReservaSaving, setLivroReservaSaving] = useState(false);
  const [livroReservaToDelete, setLivroReservaToDelete] = useState<LivroReservadoAgrupado | null>(null);
  const [livroReservaDeleting, setLivroReservaDeleting] = useState(false);

  const [livrosAlocarModalOpen, setLivrosAlocarModalOpen] = useState(false);
  const [livroToAlocarModal, setLivroToAlocarModal] = useState<LivroDisponivel | null>(null);
  const [livroAlocarModalFornecedorId, setLivroAlocarModalFornecedorId] = useState<number | null>(null);
  const [livroAlocarModalFornecedorOptions, setLivroAlocarModalFornecedorOptions] = useState<
    Array<{ value: number; label: string; quantidadeDisponivel: number }>
  >([]);
  const [livroAlocarModalFornecedorLoading, setLivroAlocarModalFornecedorLoading] = useState(false);
  const [livroAlocarModalQuantidade, setLivroAlocarModalQuantidade] = useState(1);
  const [livrosAlocando, setLivrosAlocando] = useState(false);

  const [showBookImportModal, setShowBookImportModal] = useState(false);
  const [bookImportFile, setBookImportFile] = useState<File | null>(null);
  const [bookImportSubmitting, setBookImportSubmitting] = useState(false);

  // Outros itens
  const [categoriesItens, setCategoriesItens] = useState<Category[]>([]);
  const [showAddOutroModal, setShowAddOutroModal] = useState(false);
  const [addingOutro, setAddingOutro] = useState(false);
  const [addOutroForm, setAddOutroForm] = useState({
    produtoId: undefined as number | undefined,
    item: '',
    descricao: '',
    categoriaId: undefined as number | undefined,
    quantidade: 1,
    valorUnitario: 0,
  });
  const [outrosSearch, setOutrosSearch] = useState('');

  // Aplica filtros automaticamente ao mudar os campos de busca/filtro,
  // evitando a necessidade de um botão "Aplicar filtros".
  useEffect(() => {
    if (activeTab !== 'livros') return;
    const timeoutId = window.setTimeout(() => {
      void loadLivros();
    }, 300);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, livrosSearch, livrosCategoriaId, produtoId]);

  useEffect(() => {
    if (activeTab !== 'outros') return;
    const timeoutId = window.setTimeout(() => {
      void loadOutros();
    }, 300);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, outrosSearch, produtoId]);

  const [outrosDisponiveis, setOutrosDisponiveis] = useState<OutrosItemDisponivel[]>([]);
  const [outrosAlocados, setOutrosAlocados] = useState<OutrosItemAlocado[]>([]);
  const [outrosLoading, setOutrosLoading] = useState(false);
  const { sortColumn: outrosDispSortCol, sortDirection: outrosDispSortDir, handleSort: handleOutrosDispSort } =
    useClientTableSort<OutrosDispSortCol>('item');

  const [outrosBaixaQty, setOutrosBaixaQty] = useState<Record<number, number>>({});

  const livroKey = (row: { isbn: string; categoriaId: number | null | undefined }) =>
    `${row.isbn}::${row.categoriaId ?? 'null'}`;

  const livroReservaKey = (row: LivroReservado) =>
    `${row.isbn}::${row.categoriaId ?? 'null'}::${row.fornecedorId ?? 'null'}`;

  const livroAgrupadoKey = (row: { isbn: string; categoriaId: number | null }) =>
    `${row.isbn}::${row.categoriaId ?? 'null'}`;

  const livrosReservadosAgrupados = useMemo<LivroReservadoAgrupado[]>(() => {
    const map = new Map<string, LivroReservadoAgrupado>();

    for (const r of livrosReservados) {
      const key = livroAgrupadoKey(r);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          isbn: r.isbn,
          nome: r.nome,
          categoriaId: r.categoriaId ?? null,
          categoriaNome: r.categoriaNome ?? null,
          quantidade: r.quantidade,
          fornecedoresTexto: '',
          reservas: [r],
        });
      } else {
        existing.quantidade += r.quantidade;
        existing.reservas.push(r);
      }
    }

    for (const grouped of map.values()) {
      grouped.fornecedoresTexto = grouped.reservas
        .map((r) => `${r.fornecedorNome ?? 'Fornecedor'} (${r.quantidade})`)
        .join(' | ');
    }

    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [livrosReservados]);

  async function loadProdutos() {
    if (!produtoId) return;
    setLoading(true);
    try {
      const { data } = await api.get<GalpaoProduto[]>('/galpao/produtos');
      const found = Array.isArray(data) ? data.find((p) => p.id === produtoId) : undefined;
      setProduto(found ?? null);
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadLivros() {
    setLivrosLoading(true);
    try {
      const params: Record<string, any> = {};
      if (livrosSearch.trim()) params.search = livrosSearch.trim();
      if (livrosCategoriaId !== 'all') params.categoriaId = livrosCategoriaId;

      const dispRes = await api.get<LivroDisponivel[]>('/galpao/livros-disponiveis', { params });
      let reservResData: LivroReservado[] = [];
      if (produtoId != null) {
        const reservRes = await api.get<LivroReservado[]>(`/galpao/produtos/${produtoId}/livros-reservados`);
        reservResData = Array.isArray(reservRes.data) ? reservRes.data : [];
      }

      setLivrosDisponiveis(Array.isArray(dispRes.data) ? dispRes.data : []);
      setLivrosReservados(reservResData);

      // Reseta o valor de baixa baseado nas reservas atuais (se não existir produto, vira vazio).
      setLivrosBaixaQty(() => {
        const next: Record<string, number> = {};
        reservResData.forEach((r) => {
          const k = livroReservaKey(r);
          next[k] = r.quantidade;
        });
        return next;
      });
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setLivrosLoading(false);
    }
  }

  async function loadOutros(targetProdutoId: number | null = outrosProdutoIdQuery) {
    setOutrosLoading(true);
    try {
      const params: Record<string, any> = {};
      if (outrosSearch.trim()) params.search = outrosSearch.trim();

      const dispRes = await api.get<OutrosItemDisponivel[]>('/galpao/outros-itens-disponiveis', { params });
      let reservResData: OutrosItemAlocado[] = [];
      if (targetProdutoId != null) {
        const reservRes = await api.get<OutrosItemAlocado[]>(`/galpao/produtos/${targetProdutoId}/outros-itens-alocados`);
        reservResData = Array.isArray(reservRes.data) ? reservRes.data : [];
      }

      setOutrosDisponiveis(Array.isArray(dispRes.data) ? dispRes.data : []);
      setOutrosAlocados(reservResData);

      setOutrosBaixaQty(() => {
        const next: Record<number, number> = {};
        reservResData.forEach((r) => {
          next[r.id] = r.quantidade;
        });
        return next;
      });
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setOutrosLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const [livrosRes, itensRes] = await Promise.all([
        api.get<Category[]>('/categories/all?tipo=LIVRO'),
        api.get<Category[]>('/categories?tipo=ITEM'),
      ]);
      setCategoriesLivros(Array.isArray(livrosRes.data) ? livrosRes.data : []);
      setCategoriesItens(Array.isArray(itensRes.data) ? itensRes.data : []);
    } catch {
      // Se falhar, mantém arrays vazios
      setCategoriesLivros([]);
      setCategoriesItens([]);
    }
  }

  useEffect(() => {
    setProjetoFilter('all');
    if (produtoId != null) {
      void loadProdutos();
    } else {
      setProduto(null);
    }
    void loadCategories();
    // Carregar tudo uma vez para o usuário não ver "telas vazias"
    void loadLivros();
    void loadOutros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId]);

  function parseNumberFromCell(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = String(value ?? '').trim();
    if (!raw) return fallback;
    const normalized = raw.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeHeader(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .trim();
  }

  function downloadBooksImportTemplate() {
    const workbook = XLSX.utils.book_new();
    const sampleRows = [
      {
        'N°': 1,
        ISBN: '9788591622510',
        TITULO: 'Exemplo de Livro',
        AUTOR: 'Autor Exemplo',
        EDITORA: 'Editora Exemplo',
        FORNECEDOR: 'Fornecedor Exemplo (15) | Outro Fornecedor (15)',
        QTD: 30,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const borderStyle = {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } },
    } as const;
    const ref = ws['!ref'];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      for (let row = range.s.r; row <= range.e.r; row++) {
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = ws[cellRef];
          if (!cell) continue;
          const isHeader = row === range.s.r;
          cell.s = {
            border: borderStyle,
            alignment: { vertical: 'center', horizontal: isHeader ? 'center' : 'left', wrapText: true },
            fill: isHeader ? { patternType: 'solid', fgColor: { rgb: '8BC34A' } } : undefined,
            font: isHeader ? { bold: true, color: { rgb: 'FFFFFF' } } : undefined,
          };
        }
      }
    }
    ws['!cols'] = [
      { wch: 6 },
      { wch: 18 },
      { wch: 34 },
      { wch: 24 },
      { wch: 20 },
      { wch: 42 },
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(workbook, ws, 'ModeloImportacao');
    XLSX.writeFile(
      workbook,
      `modelo-importacao-livros-galpao-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }

  async function handleImportBooksFromTemplate() {
    if (!canEdit) return;
    if (!produtoId) {
      toast.error('Produto do galpão inválido para importação.');
      return;
    }
    if (!bookImportFile) {
      toast.error('Selecione um arquivo .xlsx para importar.');
      return;
    }

    setBookImportSubmitting(true);
    try {
      const buffer = await bookImportFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) {
        toast.error('Planilha sem abas válidas.');
        return;
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
        defval: '',
        raw: true,
      });
      if (!rows.length) {
        toast.error('Planilha sem registros para importar.');
        return;
      }

      const normalizeText = (value: unknown) =>
        String(value ?? '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();

      const fornecedoresResp = await api.get<any[]>('/suppliers/all');
      const fornecedoresList = Array.isArray(fornecedoresResp.data) ? fornecedoresResp.data : [];
      const fornecedoresByName = new Map<string, number>();
      fornecedoresList.forEach((f) => {
        const nomeFantasia = normalizeText(f?.nomeFantasia);
        const razaoSocial = normalizeText(f?.razaoSocial);
        if (nomeFantasia) fornecedoresByName.set(nomeFantasia, Number(f.id));
        if (razaoSocial) fornecedoresByName.set(razaoSocial, Number(f.id));
      });

      let successCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowMap = new Map<string, unknown>();
        Object.entries(row).forEach(([key, value]) => {
          rowMap.set(normalizeHeader(key), value);
        });

        const isbn = String(rowMap.get('isbn') ?? '').trim();
        const titulo = String(rowMap.get('titulo') ?? '').trim();
        const fornecedorRaw = String(rowMap.get('fornecedor') ?? '').trim();
        const qtd = Math.floor(parseNumberFromCell(rowMap.get('qtd'), 0));

        if (!isbn || !fornecedorRaw || qtd <= 0) {
          errors.push(
            `Linha ${i + 2}: preencha ISBN, FORNECEDOR e QTD.`,
          );
          continue;
        }

        try {
          const { data: livrosData } = await api.get<LivroDisponivel[]>('/galpao/livros-disponiveis', {
            params: { search: isbn },
          });
          const livros = Array.isArray(livrosData) ? livrosData : [];
          const livroTarget =
            livros.find((l) => l.isbn === isbn && (!titulo || l.nome.toLowerCase() === titulo.toLowerCase())) ??
            livros.find((l) => l.isbn === isbn);

          if (!livroTarget) {
            errors.push(`Linha ${i + 2}: livro não encontrado no estoque disponível para alocação.`);
            continue;
          }

          const { data: fornecedoresDispData } = await api.get<LivroDisponivelPorFornecedor[]>(
            '/galpao/livros-disponiveis-por-fornecedor',
            {
              params: {
                isbn,
                ...(livroTarget.categoriaId != null ? { categoriaId: livroTarget.categoriaId } : {}),
              },
            },
          );
          const fornecedoresDisp = Array.isArray(fornecedoresDispData) ? fornecedoresDispData : [];
          const fornecedoresDispByName = new Map<string, { fornecedorId: number; quantidadeDisponivel: number }>();
          fornecedoresDisp.forEach((f) => {
            fornecedoresDispByName.set(normalizeText(f.fornecedorNome), {
              fornecedorId: f.fornecedorId,
              quantidadeDisponivel: f.quantidadeDisponivel,
            });
          });

          const parts = fornecedorRaw
            .split('|')
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p) => {
              const match = p.match(/^(.*?)(?:\((\d+)\))?$/);
              const nome = normalizeText(match?.[1] ?? p);
              const qtdFromText = Number(match?.[2] ?? 0);
              return { nome, qtdFromText: Number.isFinite(qtdFromText) ? qtdFromText : 0 };
            });

          let remaining = qtd;

          for (const part of parts) {
            if (remaining <= 0) break;

            const fromDisp = fornecedoresDispByName.get(part.nome);
            const fornecedorId =
              fromDisp?.fornecedorId ??
              fornecedoresByName.get(part.nome) ??
              null;

            if (!fornecedorId) {
              continue;
            }

            const maxPorParte = part.qtdFromText > 0 ? part.qtdFromText : remaining;
            const maxDisponivel = fromDisp?.quantidadeDisponivel ?? remaining;
            const qtdAlocar = Math.min(remaining, maxPorParte, maxDisponivel);
            if (qtdAlocar <= 0) continue;

            await api.post(`/galpao/produtos/${produtoId}/livros/alocar`, {
              isbn,
              categoriaId: livroTarget.categoriaId ?? undefined,
              fornecedorId,
              quantidade: qtdAlocar,
            });

            remaining -= qtdAlocar;
          }

          if (remaining > 0) {
            errors.push(`Linha ${i + 2}: não foi possível alocar toda a quantidade (${remaining} pendente).`);
            continue;
          }

          successCount++;
        } catch (err: any) {
          errors.push(`Linha ${i + 2}: ${formatApiError(err)}`);
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} livro(s) importado(s) com sucesso.`);
        await loadLivros();
      }

      if (errors.length) {
        toast.error(`Importação concluída com pendências (${errors.length}).`);
        // Mantém feedback sem debug print em produção.
        const preview = errors.slice(0, 3).join(' | ');
        if (preview) toast.warning(preview);
      } else {
        setShowBookImportModal(false);
        setBookImportFile(null);
      }
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setBookImportSubmitting(false);
    }
  }

  async function handleAllocateBook(row: LivroDisponivel, fornecedorId: number, quantidade: number) {
    if (!produtoId) return;
    if (!canEdit) return;
    if (quantidade < 1) {
      toast.error('Quantidade inválida.');
      return false;
    }

    if (fornecedorId == null) {
      toast.error('Selecione o fornecedor.');
      return false;
    }

    setLivrosAlocando(true);
    try {
      await api.post(`/galpao/produtos/${produtoId}/livros/alocar`, {
        isbn: row.isbn,
        categoriaId: row.categoriaId ?? undefined,
        quantidade,
        fornecedorId,
      });
      toast.success('Livro alocado com sucesso!');
      await loadLivros();
      return true;
    } catch (err: any) {
      toast.error(formatApiError(err));
      return false;
    } finally {
      setLivrosAlocando(false);
    }
  }

  async function loadLivroAlocarFornecedorOptions(livro: LivroDisponivel) {
    setLivroAlocarModalFornecedorLoading(true);
    try {
      const params: Record<string, string | number> = {
        isbn: livro.isbn,
      };
      if (livro.categoriaId != null) params.categoriaId = livro.categoriaId;

      const { data } = await api.get<LivroDisponivelPorFornecedor[]>(
        '/galpao/livros-disponiveis-por-fornecedor',
        { params },
      );

      const options = Array.isArray(data) ? data : [];

      setLivroAlocarModalFornecedorOptions(
        options.map((s) => ({
          value: s.fornecedorId,
          label: `${s.fornecedorNome} (disponível: ${s.quantidadeDisponivel})`,
          quantidadeDisponivel: s.quantidadeDisponivel,
        })),
      );

      setLivroAlocarModalFornecedorId(options.length === 1 ? options[0].fornecedorId : null);
    } catch (err: any) {
      toast.error(formatApiError(err));
      setLivroAlocarModalFornecedorOptions([]);
      setLivroAlocarModalFornecedorId(null);
    } finally {
      setLivroAlocarModalFornecedorLoading(false);
    }
  }

  async function handleBaixaBook(row: LivroReservado) {
    if (!produtoId) return;
    if (!canEdit) return;
    setLivrosBaixaLoading(true);
    try {
      const k = livroReservaKey(row);
      const qty = livrosBaixaQty[k] ?? row.quantidade;
      if (qty < 1) {
        toast.error('Quantidade inválida.');
        return;
      }
      if (qty > row.quantidade) {
        toast.error('Quantidade excede a reservada.');
        return;
      }

      await api.post(`/galpao/produtos/${produtoId}/livros/baixa`, {
        isbn: row.isbn,
        categoriaId: row.categoriaId ?? undefined,
        quantidade: qty,
        fornecedorId: row.fornecedorId ?? undefined,
      });
      toast.success('Baixa do livro registrada com sucesso!');
      setLivrosBaixaQty((prev) => ({ ...prev, [k]: row.quantidade }));
      await loadLivros();
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setLivrosBaixaLoading(false);
    }
  }

  async function handleEditarReservaLivro() {
    if (!produtoId || !livroReservaToEdit) return;
    if (!canEdit) return;

    setLivroReservaSaving(true);
    try {
      for (const reserva of livroReservaToEdit.reservas) {
        if (reserva.fornecedorId == null) {
          throw new Error('Não foi possível editar: fornecedor não identificado.');
        }

        const key = livroReservaKey(reserva);
        const quantidadeNova = Math.floor(livroReservaEditQuantidades[key] ?? reserva.quantidade);
        if (!Number.isFinite(quantidadeNova) || quantidadeNova < 0) {
          throw new Error('Quantidade inválida.');
        }
        if (quantidadeNova === reserva.quantidade) {
          continue;
        }

        if (quantidadeNova > reserva.quantidade) {
          const incremento = quantidadeNova - reserva.quantidade;
          await api.post(`/galpao/produtos/${produtoId}/livros/alocar`, {
            isbn: reserva.isbn,
            categoriaId: reserva.categoriaId ?? undefined,
            quantidade: incremento,
            fornecedorId: reserva.fornecedorId,
          });
        } else {
          const baixa = reserva.quantidade - quantidadeNova;
          await api.post(`/galpao/produtos/${produtoId}/livros/baixa`, {
            isbn: reserva.isbn,
            categoriaId: reserva.categoriaId ?? undefined,
            quantidade: baixa,
            fornecedorId: reserva.fornecedorId,
          });
        }
      }

      toast.success('Quantidade reservada atualizada com sucesso!');
      setLivroReservaEditModalOpen(false);
      setLivroReservaToEdit(null);
      setLivroReservaEditQuantidades({});
      await loadLivros();
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setLivroReservaSaving(false);
    }
  }

  async function handleExcluirReservaLivro(row: LivroReservadoAgrupado) {
    if (!produtoId) return;
    if (!canEdit) return;
    setLivroReservaToDelete(row);
  }

  async function confirmExcluirReservaLivro() {
    if (!produtoId) return;
    if (!canEdit) return;
    if (!livroReservaToDelete) return;

    setLivroReservaDeleting(true);
    try {
      for (const reserva of livroReservaToDelete.reservas) {
        if (reserva.fornecedorId == null) {
          throw new Error('Não foi possível excluir: fornecedor não identificado.');
        }
        await api.post(`/galpao/produtos/${produtoId}/livros/baixa`, {
          isbn: reserva.isbn,
          categoriaId: reserva.categoriaId ?? undefined,
          quantidade: reserva.quantidade,
          fornecedorId: reserva.fornecedorId,
        });
      }
      toast.success('Reserva excluída com sucesso!');
      setLivroReservaToDelete(null);
      await loadLivros();
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setLivroReservaDeleting(false);
    }
  }

  async function handleDeleteOutroItemCadastro(row: OutrosItemDisponivel) {
    if (!canEdit) return;
    const ok = window.confirm(`Excluir o cadastro do item "${row.item}" do estoque?`);
    if (!ok) return;
    try {
      await api.delete(`/galpao/outros-itens/${row.id}`);
      toast.success('Cadastro de item removido do estoque.');
      await loadOutros(outrosProdutoIdQuery);
    } catch (err: any) {
      toast.error(formatApiError(err));
    }
  }

  async function handleAddOutroItem() {
    if (!canEdit) return;
    if (!addOutroForm.produtoId) {
      toast.error('Selecione o produto para registrar a entrada.');
      return;
    }
    if (!addOutroForm.item.trim()) {
      toast.error('Informe o item.');
      return;
    }
    if (addOutroForm.quantidade < 1) {
      toast.error('Quantidade inválida.');
      return;
    }
    if (addOutroForm.valorUnitario < 0) {
      toast.error('Valor unitário inválido.');
      return;
    }

    setAddingOutro(true);
    try {
      await api.post(`/galpao/produtos/${addOutroForm.produtoId}/outros-itens/entrada`, {
        item: addOutroForm.item.trim(),
        descricao: addOutroForm.descricao?.trim() || undefined,
        categoriaId: addOutroForm.categoriaId ?? undefined,
        quantidade: addOutroForm.quantidade,
        valorUnitario: addOutroForm.valorUnitario,
      });
      toast.success('Item adicionado ao estoque.');
      setShowAddOutroModal(false);
      setAddOutroForm({
        produtoId: undefined,
        item: '',
        descricao: '',
        categoriaId: undefined,
        quantidade: 1,
        valorUnitario: 0,
      });
      await loadOutros();
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setAddingOutro(false);
    }
  }

  async function handleAllocateOther(row: OutrosItemDisponivel, targetProdutoId: number, quantidade: number) {
    if (!canEdit) return;
    if (!targetProdutoId) return;
    if (quantidade < 1) {
      toast.error('Quantidade inválida.');
      return;
    }
    if (quantidade > row.quantidadeDisponivel) {
      toast.error('Quantidade excede o disponível.');
      return;
    }

    setOutrosAllocateLoading(true);
    try {
      await api.post(`/galpao/produtos/${targetProdutoId}/outros-itens/alocar`, {
        estoqueId: row.id,
        quantidade,
      });
      toast.success('Item alocado com sucesso!');
      setOutrosProdutoIdQuery(targetProdutoId);
      await loadOutros(targetProdutoId);
      return true;
    } catch (err: any) {
      toast.error(formatApiError(err));
      return false;
    } finally {
      setOutrosAllocateLoading(false);
    }
  }

  async function handleBaixaOther(row: OutrosItemAlocado) {
    if (!outrosProdutoIdQuery) return;
    if (!canEdit) return;
    const qty = outrosBaixaQty[row.id] ?? row.quantidade;
    if (qty < 1) {
      toast.error('Quantidade inválida.');
      return;
    }
    if (qty > row.quantidade) {
      toast.error('Quantidade excede a reservada.');
      return;
    }

    try {
      await api.post(`/galpao/produtos/${outrosProdutoIdQuery}/outros-itens/baixa`, {
        estoqueAlocacaoId: row.id,
        quantidade: qty,
      });
      toast.success('Baixa do item registrada com sucesso!');
      await loadOutros();
    } catch (err: any) {
      toast.error(formatApiError(err));
    }
  }

  async function loadOutrosAvarias(estoqueId: number) {
    setOutrosAvariasLoading(true);
    try {
      const { data } = await api.get<OutrosItemAvaria[]>(`/galpao/outros-itens/${estoqueId}/avarias`);
      setOutrosAvarias(Array.isArray(data) ? data : []);
    } catch {
      setOutrosAvarias([]);
    } finally {
      setOutrosAvariasLoading(false);
    }
  }

  async function handleSaveOutrosAvariaJustificativa() {
    if (!outrosAvariaEditRow || !outrosAvariaItem) return;
    const t = outrosAvariaEditJustificativa.trim();
    if (!t) {
      toast.error('Informe a justificativa.');
      return;
    }
    setOutrosAvariaSavingJustificativa(true);
    try {
      await api.patch(`/galpao/outros-itens/avarias/${outrosAvariaEditRow.id}`, { justificativa: t });
      toast.success('Justificativa atualizada.');
      setOutrosAvariaEditRow(null);
      await loadOutrosAvarias(outrosAvariaItem.id);
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setOutrosAvariaSavingJustificativa(false);
    }
  }

  async function handleDeleteOutrosAvaria() {
    if (!outrosAvariaDeleteRow || !outrosAvariaItem) return;
    setOutrosAvariaDeleting(true);
    try {
      await api.delete(`/galpao/outros-itens/avarias/${outrosAvariaDeleteRow.id}`);
      toast.success('Avaria removida e quantidade devolvida ao estoque.');
      setOutrosAvariaDeleteRow(null);
      await loadOutrosAvarias(outrosAvariaItem.id);
      await loadOutros();
    } catch (err: any) {
      toast.error(formatApiError(err));
    } finally {
      setOutrosAvariaDeleting(false);
    }
  }

  useEffect(() => {
    if (!outrosAvariaModalOpen || !outrosAvariaItem) return;
    void loadOutrosAvarias(outrosAvariaItem.id);
  }, [outrosAvariaModalOpen, outrosAvariaItem]);

  const livroDisponivelColumns: DataTableColumn<LivroDisponivel>[] = [
    { key: 'isbn', label: 'ISBN', render: (r) => <span className="font-mono text-xs">{r.isbn}</span> },
    {
      key: 'nome',
      label: 'Título',
      render: (r) => (
        <span className="font-medium block max-w-[200px] line-clamp-2" title={r.nome}>
          {r.nome}
        </span>
      ),
    },
    { key: 'categoria', label: 'Gênero', render: (r) => <span>{r.categoriaNome ?? '-'}</span> },
    { key: 'autor', label: 'Autor', render: (r) => <span className="text-xs text-white/80">{r.autor ?? '-'}</span> },
    {
      key: 'qtd',
      label: 'Qtd disponível',
      align: 'right',
      tdClassName: 'text-right',
      render: (r) => <span className="font-semibold">{r.quantidadeDisponivel}</span>,
    },
    ...(showLivroValorTotalColumn
      ? [
          {
            key: 'valor',
            label: 'Valor total',
            align: 'right' as const,
            tdClassName: 'text-right',
            render: (r) => (
              <span className="text-xs text-emerald-300">
                {r.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            ),
          } satisfies DataTableColumn<LivroDisponivel>,
        ]
      : []),
    {
      key: 'acoes',
      label: 'Ações',
      stopRowClick: true,
      align: 'right',
      render: (r) => {
        return (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className={btn.primarySm}
              onClick={() => {
                setLivroToAlocarModal(r);
                setLivroAlocarModalQuantidade(1);
                setLivroAlocarModalFornecedorId(null);
                setLivroAlocarModalFornecedorOptions([]);
                setLivrosAlocarModalOpen(true);
                void loadLivroAlocarFornecedorOptions(r);
              }}
              disabled={!canEdit || livrosLoading || produtoId == null}
            >
              Alocar
            </button>
          </div>
        );
      },
    },
  ];

  const livroReservadoColumns: DataTableColumn<LivroReservadoAgrupado>[] = [
    { key: 'isbn', label: 'ISBN', render: (r) => <span className="font-mono text-xs">{r.isbn}</span> },
    {
      key: 'nome',
      label: 'Título',
      render: (r) => (
        <span className="font-medium block max-w-[200px] line-clamp-2" title={r.nome}>
          {r.nome}
        </span>
      ),
    },
    { key: 'categoria', label: 'Gênero', render: (r) => <span>{r.categoriaNome ?? '-'}</span> },
    {
      key: 'fornecedor',
      label: 'Fornecedor',
      render: (r) => <span className="text-xs text-white/80">{r.fornecedoresTexto}</span>,
    },
    { key: 'qtd', label: 'Qtd reservada', align: 'right', tdClassName: 'text-right', render: (r) => <span className="font-semibold">{r.quantidade}</span> },
    {
      key: 'acoes',
      label: 'Ações',
      stopRowClick: true,
      align: 'right',
      render: (r) => {
        return (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className={btn.editSm}
              onClick={() => {
                setLivroReservaToEdit(r);
                const next: Record<string, number> = {};
                r.reservas.forEach((reserva) => {
                  next[livroReservaKey(reserva)] = reserva.quantidade;
                });
                setLivroReservaEditQuantidades(next);
                setLivroReservaEditModalOpen(true);
              }}
              disabled={!canEdit || livrosBaixaLoading || produtoId == null}
            >
              Editar
            </button>
            <button
              type="button"
              className={btn.dangerSm}
              onClick={() => {
                void handleExcluirReservaLivro(r);
              }}
              disabled={!canEdit || livrosBaixaLoading || produtoId == null}
            >
              Excluir
            </button>
          </div>
        );
      },
    },
  ];

  const sortedOutrosDisponiveis = useMemo(() => {
    const rows = [...outrosDisponiveis];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (outrosDispSortCol) {
        case 'item':
          cmp = a.item.localeCompare(b.item);
          break;
        case 'categoria':
          cmp = (a.categoria?.nome ?? '').localeCompare(b.categoria?.nome ?? '');
          break;
        case 'qtd':
          cmp = a.quantidadeDisponivel - b.quantidadeDisponivel;
          break;
        default:
          cmp = 0;
      }
      return outrosDispSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [outrosDisponiveis, outrosDispSortCol, outrosDispSortDir]);

  const renderOutrosDispTh = useCallback(
    (col: OutrosDispSortCol, label: string, align: 'left' | 'right' = 'left') =>
      renderSortableTableTh({
        columnKey: col,
        label,
        activeColumn: outrosDispSortCol,
        sortDirection: outrosDispSortDir,
        onSort: handleOutrosDispSort,
        align,
      }),
    [outrosDispSortCol, outrosDispSortDir, handleOutrosDispSort],
  );

  const outrosDisponiveisColumns: DataTableColumn<OutrosItemDisponivel>[] = useMemo(
    () => [
      {
        key: 'item',
        label: '',
        renderTh: () => renderOutrosDispTh('item', 'Item'),
        render: (r) => (
          <span className="font-medium block max-w-[240px] line-clamp-2" title={r.item}>
            {r.item}
          </span>
        ),
      },
      {
        key: 'categoria',
        label: '',
        renderTh: () => renderOutrosDispTh('categoria', 'Categoria'),
        render: (r) => <span className="text-xs text-white/70">{r.categoria?.nome ?? '-'}</span>,
      },
      {
        key: 'qtd',
        label: '',
        align: 'right',
        renderTh: () => renderOutrosDispTh('qtd', 'Qtd disponível', 'right'),
        tdClassName: 'text-right',
        render: (r) => <span className="font-semibold">{r.quantidadeDisponivel}</span>,
      },
      {
        key: 'acoes',
        label: 'Ações',
        stopRowClick: true,
        align: 'right',
        render: (r) => {
          return (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className={btn.primarySm}
                onClick={() => {
                  setOutrosAllocateItem(r);
                  setOutrosAllocateModalOpen(true);
                  const defaultProdutoId = outrosProdutoIdQuery ?? produtosOptions[0]?.id ?? null;
                  setOutrosAllocateProdutoId(defaultProdutoId);
                  setOutrosAllocateQuantidade(1);
                }}
                disabled={!canEdit}
              >
                Alocar
              </button>
              <button
                type="button"
                className={btn.warningSm}
                onClick={() => {
                  setOutrosAvariaItem(r);
                  setOutrosAvariaModalOpen(true);
                  const defaultProdutoId = outrosProdutoIdQuery ?? produtosOptions[0]?.id ?? null;
                  setOutrosAvariaProdutoId(defaultProdutoId);
                  setOutrosAvariaQuantidade(1);
                  setOutrosAvariaJustificativa('');
                }}
                disabled={!canEdit}
              >
                Avarias
              </button>
              <button
                type="button"
                className={btn.dangerSm}
                onClick={() => void handleDeleteOutroItemCadastro(r)}
                disabled={!canEdit}
              >
                Excluir
              </button>
            </div>
          );
        },
      },
    ],
    [renderOutrosDispTh, canEdit, outrosProdutoIdQuery, produtosOptions],
  );

  const outrosAlocadosColumns: DataTableColumn<OutrosItemAlocado>[] = [
    { key: 'item', label: 'Item', render: (r) => <span className="font-medium">{r.estoque.item}</span> },
    { key: 'categoria', label: 'Categoria', render: (r) => <span className="text-xs text-white/70">{r.estoque.categoria?.nome ?? '-'}</span> },
    { key: 'qtd', label: 'Qtd reservada', align: 'right', tdClassName: 'text-right', render: (r) => <span className="font-semibold">{r.quantidade}</span> },
    {
      key: 'acoes',
      label: 'Ações',
      stopRowClick: true,
      align: 'right',
      render: (r) => {
        const qty = outrosBaixaQty[r.id] ?? r.quantidade;
        return (
          <div className="flex items-center justify-end gap-2">
            <input
              type="number"
              min={1}
              max={r.quantidade}
              value={qty}
              onChange={(e) => {
                const n = Number(e.target.value);
                setOutrosBaixaQty((prev) => ({ ...prev, [r.id]: Number.isFinite(n) ? n : r.quantidade }));
              }}
              className="w-20 bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              disabled={!canEdit || outrosProdutoIdQuery == null}
            />
            <button
              type="button"
              className={btn.dangerSm}
              onClick={() => void handleBaixaOther(r)}
              disabled={!canEdit || outrosLoading || outrosProdutoIdQuery == null}
            >
              Baixar
            </button>
          </div>
        );
      },
    },
  ];

  if (loading) {
    return <div className="py-8 text-center text-white/60">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          {showBackButton && (
            <button type="button" className={btn.secondary} onClick={() => navigate('/galpao')}>
              ← Voltar
            </button>
          )}
          <h2 className="text-xl font-semibold mt-2">{headerTitle}</h2>
          {shouldShowProdutoName && (
            <p className="text-sm text-white/60">{produto?.nome ?? (produtoId != null ? `#${produtoId}` : '')}</p>
          )}
        </div>

        {showSubTabs && !isForcedTab && (
          <div className="inline-flex w-full sm:w-auto overflow-x-auto sm:overflow-x-hidden rounded-lg bg-black/40 border border-white/10 p-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setActiveTab('livros')}
              className={`shrink-0 sm:flex-1 whitespace-nowrap px-3 sm:px-4 py-2 text-sm rounded-md transition min-h-[40px] text-center ${
                activeTab === 'livros'
                  ? 'bg-primary text-white shadow-md'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="sm:hidden">Livros</span>
              <span className="hidden sm:inline">Estoque de livros</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('outros')}
              className={`shrink-0 sm:flex-1 whitespace-nowrap px-3 sm:px-4 py-2 text-sm rounded-md transition min-h-[40px] text-center ${
                activeTab === 'outros'
                  ? 'bg-primary text-white shadow-md'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="sm:hidden">Itens</span>
              <span className="hidden sm:inline">Estoque de itens</span>
            </button>
          </div>
        )}
      </div>

      {activeTab === 'livros' && (
        <div className="space-y-6">
          {canEdit && produtoId != null && (
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.secondary} onClick={downloadBooksImportTemplate}>
                Baixar modelo
              </button>
              <button
                type="button"
                className={btn.primary}
                onClick={() => setShowBookImportModal(true)}
              >
                Importar modelo
              </button>
            </div>
          )}

          <CollapsibleFilters
            show={showLivrosFilters}
            setShow={setShowLivrosFilters}
            hasActiveFilters={livrosSearch.trim().length > 0 || livrosCategoriaId !== 'all'}
            title="Busca e filtros"
            badgeText="Ativo"
            onClear={() => {
              setLivrosSearch('');
              setLivrosCategoriaId('all');
              void loadLivros();
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-white/90 mb-1">Buscar</label>
                <input
                  value={livrosSearch}
                  onChange={(e) => setLivrosSearch(e.target.value)}
                  placeholder="ISBN, título, gênero, autor..."
                  className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/90 mb-1">Gênero</label>
                <AppSelect
                  value={livrosCategoriaId === 'all' ? '' : livrosCategoriaId}
                  onChange={(value) => setLivrosCategoriaId(value ? Number(value) : 'all')}
                  placeholder="Todos"
                  options={categoriesLivros.map((c) => ({ value: c.id, label: c.nome }))}
                  selectClassName="w-full"
                />
              </div>
            </div>
          </CollapsibleFilters>

          <div className="space-y-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <h3 className="text-lg font-semibold">Livros reservados</h3>
            </div>
            <DataTable<LivroReservadoAgrupado>
              data={livrosReservadosAgrupados}
              columns={livroReservadoColumns}
              keyExtractor={(r) => livroAgrupadoKey(r)}
              loading={livrosLoading}
              emptyMessage="Nenhum livro reservado para baixa."
              paginate
              initialPageSize={20}
              responsiveFrom="md"
              renderMobileCard={(r) => (
                <div className={almoxarifadoMobileCardCls}>
                  <div>
                    <p className="font-semibold text-white line-clamp-2">{r.nome}</p>
                    <p className="text-xs text-white/60 mt-0.5 font-mono">{r.isbn}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-white/50">Gênero:</span>{' '}
                      <span className="text-white/80">{r.categoriaNome ?? '-'}</span>
                    </div>
                    <div>
                      <span className="text-white/50">Reservado:</span>{' '}
                      <span className="font-semibold text-white">{r.quantidade}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-white/50">Fornecedor:</span>{' '}
                      <span className="text-white/80">{r.fornecedoresTexto || '—'}</span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      className={btn.editSm}
                      onClick={() => {
                        setLivroReservaToEdit(r);
                        const next: Record<string, number> = {};
                        r.reservas.forEach((reserva) => {
                          next[livroReservaKey(reserva)] = reserva.quantidade;
                        });
                        setLivroReservaEditQuantidades(next);
                        setLivroReservaEditModalOpen(true);
                      }}
                      disabled={!canEdit || livrosBaixaLoading || produtoId == null}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={btn.dangerSm}
                      onClick={() => void handleExcluirReservaLivro(r)}
                      disabled={!canEdit || livrosBaixaLoading || produtoId == null}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              )}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <h3 className="text-lg font-semibold">Livros disponíveis</h3>
            </div>
            <DataTable<LivroDisponivel>
              data={livrosDisponiveis}
              columns={livroDisponivelColumns}
              keyExtractor={(r) => livroKey(r)}
              loading={livrosLoading}
              emptyMessage="Nenhum livro disponível para alocar."
              paginate
              initialPageSize={20}
              responsiveFrom="md"
              renderMobileCard={(r) => (
                <div className={almoxarifadoMobileCardCls}>
                  <div>
                    <p className="font-semibold text-white line-clamp-2">{r.nome}</p>
                    <p className="text-xs text-white/60 mt-0.5 font-mono">{r.isbn}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-white/50">Gênero:</span>{' '}
                      <span className="text-white/80">{r.categoriaNome ?? '-'}</span>
                    </div>
                    <div>
                      <span className="text-white/50">Autor:</span>{' '}
                      <span className="text-white/80">{r.autor ?? '-'}</span>
                    </div>
                    <div>
                      <span className="text-white/50">Disponível:</span>{' '}
                      <span className="font-semibold text-white">{r.quantidadeDisponivel}</span>
                    </div>
                    {showLivroValorTotalColumn && (
                      <div>
                        <span className="text-white/50">Valor:</span>{' '}
                        <span className="text-emerald-300">
                          {r.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end pt-2 border-t border-white/10">
                    <button
                      type="button"
                      className={btn.primarySm}
                      onClick={() => {
                        setLivroToAlocarModal(r);
                        setLivroAlocarModalQuantidade(1);
                        setLivroAlocarModalFornecedorId(null);
                        setLivroAlocarModalFornecedorOptions([]);
                        setLivrosAlocarModalOpen(true);
                        void loadLivroAlocarFornecedorOptions(r);
                      }}
                      disabled={!canEdit || livrosLoading || produtoId == null}
                    >
                      Alocar
                    </button>
                  </div>
                </div>
              )}
            />
          </div>
        </div>
      )}

      {activeTab === 'projeto' && (
        <div className="space-y-6">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Itens alocados por projeto</h3>
              <p className="text-sm text-white/60">
                Visualize e dê baixa nos itens alocados, filtrando por projeto.
              </p>
            </div>

            <div className="w-full sm:w-72">
              <AppSelect
                label="Projeto"
                value={projetoFilter}
                onChange={(value) => setProjetoFilter(value)}
                placeholder="Todos"
                options={[
                  { value: 'all', label: 'Todos' },
                  ...Array.from(
                    new Set(
                      (outrosAlocados ?? [])
                        .map((a) => a.projetoId)
                        .filter((id): id is number => typeof id === 'number'),
                    ),
                  )
                    .sort((a, b) => a - b)
                    .map((id) => ({ value: id, label: `#${id}` })),
                ]}
                selectClassName="w-full"
              />
            </div>
          </div>

          {(() => {
            const projetoIdNumber =
              projetoFilter === 'all' ? null : Number(projetoFilter);

            const data =
              projetoIdNumber == null
                ? outrosAlocados
                : outrosAlocados.filter((r) => r.projetoId === projetoIdNumber);

            const outrosAlocadosPorProjetoColumns: DataTableColumn<OutrosItemAlocado>[] = [
              {
                key: 'item',
                label: 'Item',
                render: (r) => <span className="font-medium">{r.estoque.item}</span>,
              },
              {
                key: 'categoria',
                label: 'Categoria',
                render: (r) => (
                  <span className="text-xs text-white/70">{r.estoque.categoria?.nome ?? '-'}</span>
                ),
              },
              {
                key: 'qtd',
                label: 'Qtd reservada',
                align: 'right',
                tdClassName: 'text-right',
                render: (r) => <span className="font-semibold">{r.quantidade}</span>,
              },
              {
                key: 'projeto',
                label: 'Projeto',
                render: (r) => <span className="text-sm">{r.projetoId ?? '-'}</span>,
              },
              {
                key: 'etapa',
                label: 'Etapa',
                render: (r) => <span className="text-sm">{r.etapaId ?? '-'}</span>,
              },
              {
                key: 'acoes',
                label: 'Ações',
                stopRowClick: true,
                align: 'right',
                render: (r) => {
                  const qty = outrosBaixaQty[r.id] ?? r.quantidade;
                  return (
                    <div className="flex items-center justify-end gap-2">
                      <input
                        type="number"
                        min={1}
                        max={r.quantidade}
                        value={qty}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setOutrosBaixaQty((prev) => ({
                            ...prev,
                            [r.id]: Number.isFinite(n) ? n : r.quantidade,
                          }));
                        }}
                        className="w-20 bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        disabled={!canEdit}
                      />
                      <button
                        type="button"
                        className={btn.dangerSm}
                        onClick={() => void handleBaixaOther(r)}
                        disabled={!canEdit || outrosLoading}
                      >
                        Baixar
                      </button>
                    </div>
                  );
                },
              },
            ];

            return (
              <DataTable<OutrosItemAlocado>
                data={data}
                columns={outrosAlocadosPorProjetoColumns}
                keyExtractor={(r) => String(r.id)}
                loading={outrosLoading}
                emptyMessage="Nenhum item alocado para este projeto."
                paginate
                initialPageSize={20}
                responsiveFrom="md"
                renderMobileCard={(r) => {
                  const qty = outrosBaixaQty[r.id] ?? r.quantidade;
                  return (
                    <div className={almoxarifadoMobileCardCls}>
                      <div>
                        <p className="font-semibold text-white line-clamp-2">{r.estoque.item}</p>
                        <p className="text-xs text-white/60 mt-0.5">{r.estoque.categoria?.nome ?? 'Sem categoria'}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-white/50">Reservado:</span>{' '}
                          <span className="font-semibold text-white">{r.quantidade}</span>
                        </div>
                        <div>
                          <span className="text-white/50">Projeto:</span>{' '}
                          <span className="text-white/80">{r.projetoId ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-white/50">Etapa:</span>{' '}
                          <span className="text-white/80">{r.etapaId ?? '—'}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                        <input
                          type="number"
                          min={1}
                          max={r.quantidade}
                          value={qty}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setOutrosBaixaQty((prev) => ({
                              ...prev,
                              [r.id]: Number.isFinite(n) ? n : r.quantidade,
                            }));
                          }}
                          className="w-20 bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                          disabled={!canEdit}
                        />
                        <button
                          type="button"
                          className={btn.dangerSm}
                          onClick={() => void handleBaixaOther(r)}
                          disabled={!canEdit || outrosLoading}
                        >
                          Baixar
                        </button>
                      </div>
                    </div>
                  );
                }}
              />
            );
          })()}
        </div>
      )}

      {activeTab === 'outros' && (
        <div className="space-y-6">
          {canEdit && (
            <div className="flex justify-end">
              <button
                type="button"
                className={btn.primary}
                onClick={() => {
                  setAddOutroForm((prev) => ({
                    ...prev,
                    produtoId: prev.produtoId ?? produtosOptions[0]?.id,
                  }));
                  setShowAddOutroModal(true);
                }}
              >
                Adicionar item
              </button>
            </div>
          )}

          <CollapsibleFilters
            show={showOutrosFilters}
            setShow={setShowOutrosFilters}
            hasActiveFilters={outrosSearch.trim().length > 0}
            title="Filtros"
            badgeText="Ativo"
            onClear={() => {
              setOutrosSearch('');
              void loadOutros();
            }}
          >
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Buscar item</label>
              <input
                value={outrosSearch}
                onChange={(e) => setOutrosSearch(e.target.value)}
                placeholder="Item..."
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </CollapsibleFilters>

          <DataTable<OutrosItemDisponivel>
            data={sortedOutrosDisponiveis}
            columns={outrosDisponiveisColumns}
            keyExtractor={(r) => String(r.id)}
            loading={outrosLoading}
            emptyMessage="Nenhum item disponível."
            paginate
            initialPageSize={20}
            responsiveFrom="md"
            renderMobileCard={(r) => (
              <div className={almoxarifadoMobileCardCls}>
                <div>
                  <p className="font-semibold text-white line-clamp-2" title={r.item}>
                    {r.item}
                  </p>
                  <p className="text-xs text-white/60 mt-0.5">{r.categoria?.nome ?? 'Sem categoria'}</p>
                </div>
                <div className="text-xs">
                  <span className="text-white/50">Qtd disponível:</span>{' '}
                  <span className="font-semibold text-white">{r.quantidadeDisponivel}</span>
                </div>
                <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    className={btn.primarySm}
                    onClick={() => {
                      setOutrosAllocateItem(r);
                      setOutrosAllocateModalOpen(true);
                      const defaultProdutoId = outrosProdutoIdQuery ?? produtosOptions[0]?.id ?? null;
                      setOutrosAllocateProdutoId(defaultProdutoId);
                      setOutrosAllocateQuantidade(1);
                    }}
                    disabled={!canEdit}
                  >
                    Alocar
                  </button>
                  <button
                    type="button"
                    className={btn.warningSm}
                    onClick={() => {
                      setOutrosAvariaItem(r);
                      setOutrosAvariaModalOpen(true);
                      const defaultProdutoId = outrosProdutoIdQuery ?? produtosOptions[0]?.id ?? null;
                      setOutrosAvariaProdutoId(defaultProdutoId);
                      setOutrosAvariaQuantidade(1);
                      setOutrosAvariaJustificativa('');
                    }}
                    disabled={!canEdit}
                  >
                    Avarias
                  </button>
                  <button
                    type="button"
                    className={btn.dangerSm}
                    onClick={() => void handleDeleteOutroItemCadastro(r)}
                    disabled={!canEdit}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            )}
          />

        </div>
      )}

      <AppModal
        open={showBookImportModal}
        onClose={() => {
          setShowBookImportModal(false);
          setBookImportFile(null);
        }}
        title="Importar livros por modelo"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/75">
            Use o modelo do relatório de livros disponíveis para importar e alocar em lote no produto atual.
          </p>
          <p className="text-xs text-white/60">
            Colunas esperadas: N°, ISBN, TITULO, AUTOR, EDITORA, FORNECEDOR, QTD.
          </p>

          <FileDropInput
            accept=".xlsx"
            multiple={false}
            disabled={bookImportSubmitting}
            onFilesSelected={(files) => {
              const first = files[0];
              if (!first) return;
              if (!first.name.toLowerCase().endsWith('.xlsx')) {
                toast.error('Selecione um arquivo .xlsx válido.');
                return;
              }
              setBookImportFile(first);
            }}
            className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold"
          />

          {bookImportFile && (
            <p className="text-xs text-white/70">
              Arquivo selecionado: <span className="text-white">{bookImportFile.name}</span>
            </p>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              className={btn.secondaryLg}
              onClick={() => {
                setShowBookImportModal(false);
                setBookImportFile(null);
              }}
              disabled={bookImportSubmitting}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={btn.primaryLg}
              onClick={() => void handleImportBooksFromTemplate()}
              disabled={bookImportSubmitting || !bookImportFile}
            >
              {bookImportSubmitting ? 'Importando...' : 'Importar'}
            </button>
          </div>
        </div>
      </AppModal>

      {/* Modal: Alocar livro (por fornecedor) */}
      <AppModal
        open={showAddOutroModal}
        onClose={() => {
          setShowAddOutroModal(false);
          setAddOutroForm({
            produtoId: undefined,
            item: '',
            descricao: '',
            categoriaId: undefined,
            quantidade: 1,
            valorUnitario: 0,
          });
        }}
        title="Adicionar item ao estoque"
        size="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAddOutroItem();
          }}
          className="space-y-4"
        >
          <AppSelect
            label="Produto do galpão (registro de entrada)"
            value={addOutroForm.produtoId ?? ''}
            onChange={(value) => setAddOutroForm((prev) => ({ ...prev, produtoId: value ? Number(value) : undefined }))}
            placeholder="Selecionar"
            options={produtosOptions.map((p) => ({ value: p.id, label: p.nome }))}
            selectClassName="w-full"
            disabled={produtosOptionsLoading || addingOutro}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Item</label>
              <input
                value={addOutroForm.item}
                onChange={(e) => setAddOutroForm((prev) => ({ ...prev, item: e.target.value }))}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Nome do item"
                disabled={addingOutro}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Categoria (opcional)</label>
              <AppSelect
                value={addOutroForm.categoriaId ?? ''}
                onChange={(value) => setAddOutroForm((prev) => ({ ...prev, categoriaId: value ? Number(value) : undefined }))}
                placeholder="Sem categoria"
                options={categoriesItens.map((c) => ({ value: c.id, label: c.nome }))}
                selectClassName="w-full"
                disabled={addingOutro}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Quantidade</label>
              <input
                type="number"
                min={1}
                value={addOutroForm.quantidade}
                onChange={(e) => setAddOutroForm((prev) => ({ ...prev, quantidade: Number(e.target.value) || 1 }))}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                disabled={addingOutro}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Valor unitário (R$)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={addOutroForm.valorUnitario}
                onChange={(e) => setAddOutroForm((prev) => ({ ...prev, valorUnitario: Number(e.target.value) || 0 }))}
                className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                disabled={addingOutro}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Descrição (opcional)</label>
            <textarea
              rows={3}
              value={addOutroForm.descricao}
              onChange={(e) => setAddOutroForm((prev) => ({ ...prev, descricao: e.target.value }))}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              disabled={addingOutro}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
            <button type="button" className={btn.secondaryLg} disabled={addingOutro} onClick={() => setShowAddOutroModal(false)}>
              Cancelar
            </button>
            <button type="submit" className={btn.primaryLg} disabled={addingOutro}>
              {addingOutro ? 'Salvando...' : 'Adicionar item'}
            </button>
          </div>
        </form>
      </AppModal>

      <AppModal
        open={!!livroReservaToDelete}
        onClose={() => setLivroReservaToDelete(null)}
        title="Excluir reserva de livro"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/80">
            Tem certeza que deseja excluir a reserva do livro{' '}
            <span className="font-semibold text-white">{livroReservaToDelete?.nome}</span>?
          </p>
          <p className="text-xs text-white/60">
            Essa ação removerá toda a quantidade reservada deste livro para o produto atual.
          </p>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              className={btn.secondaryLg}
              onClick={() => setLivroReservaToDelete(null)}
              disabled={livroReservaDeleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={btn.dangerLg}
              onClick={() => void confirmExcluirReservaLivro()}
              disabled={livroReservaDeleting || !livroReservaToDelete}
            >
              {livroReservaDeleting ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={livroReservaEditModalOpen}
        onClose={() => {
          setLivroReservaEditModalOpen(false);
          setLivroReservaToEdit(null);
          setLivroReservaEditQuantidades({});
        }}
        title="Editar quantidade reservada"
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleEditarReservaLivro();
          }}
          className="space-y-4"
        >
          <div className="text-sm text-white/70">
            {livroReservaToEdit ? (
              <>
                Livro: <span className="text-white">{livroReservaToEdit.nome}</span> ({livroReservaToEdit.isbn})
              </>
            ) : (
              'Selecione um livro reservado'
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-white/90 mb-2">Quantidades por fornecedor</label>
            <div className="space-y-2">
              {(livroReservaToEdit?.reservas ?? []).map((reserva) => {
                const key = livroReservaKey(reserva);
                const value = livroReservaEditQuantidades[key] ?? reserva.quantidade;
                return (
                  <div key={key} className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-2 items-center">
                    <span className="text-sm text-white/80">{reserva.fornecedorNome ?? 'Fornecedor'}</span>
                    <input
                      type="number"
                      min={0}
                      value={value}
                      onChange={(e) =>
                        setLivroReservaEditQuantidades((prev) => ({
                          ...prev,
                          [key]: Number(e.target.value) || 0,
                        }))
                      }
                      className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      disabled={livroReservaSaving}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              className={btn.secondaryLg}
              onClick={() => {
                setLivroReservaEditModalOpen(false);
                setLivroReservaToEdit(null);
                setLivroReservaEditQuantidades({});
              }}
              disabled={livroReservaSaving}
            >
              Cancelar
            </button>
            <button type="submit" className={btn.primaryLg} disabled={livroReservaSaving || !livroReservaToEdit}>
              {livroReservaSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </AppModal>

      <AppModal
        open={livrosAlocarModalOpen}
        onClose={() => {
          setLivrosAlocarModalOpen(false);
          setLivroToAlocarModal(null);
          setLivroAlocarModalFornecedorId(null);
          setLivroAlocarModalFornecedorOptions([]);
          setLivroAlocarModalQuantidade(1);
        }}
        title="Alocar livro"
        size="md"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!produtoId) return;
            if (!livroToAlocarModal) return;
            if (livroAlocarModalFornecedorId == null) return;
            if (livroAlocarModalQuantidade < 1) {
              toast.error('Quantidade inválida.');
              return;
            }

            const ok = await handleAllocateBook(livroToAlocarModal, livroAlocarModalFornecedorId, livroAlocarModalQuantidade);
            if (ok) {
              setLivrosAlocarModalOpen(false);
              setLivroToAlocarModal(null);
              setLivroAlocarModalFornecedorId(null);
              setLivroAlocarModalFornecedorOptions([]);
              setLivroAlocarModalQuantidade(1);
            }
          }}
          className="space-y-4"
        >
          <div className="text-sm text-white/70">
            {livroToAlocarModal ? (
              <>
                Livro: <span className="text-white">{livroToAlocarModal.nome}</span> ({livroToAlocarModal.isbn})
              </>
            ) : (
              'Selecione um livro'
            )}
          </div>

          <AppSelect
            label="Fornecedor (estoque disponível)"
            value={livroAlocarModalFornecedorId ?? ''}
            onChange={(value) => setLivroAlocarModalFornecedorId(value ? Number(value) : null)}
            placeholder={livroAlocarModalFornecedorOptions.length ? 'Selecionar' : 'Sem opções'}
            options={livroAlocarModalFornecedorOptions}
            disabled={livroAlocarModalFornecedorLoading || livrosAlocando}
            selectClassName="w-full"
          />

          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Quantidade</label>
            <input
              type="number"
              min={1}
              max={
                livroAlocarModalFornecedorId != null
                  ? livroAlocarModalFornecedorOptions.find((o) => o.value === livroAlocarModalFornecedorId)?.quantidadeDisponivel ??
                    undefined
                  : undefined
              }
              value={livroAlocarModalQuantidade}
              onChange={(e) => setLivroAlocarModalQuantidade(Number(e.target.value) || 1)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              disabled={livrosAlocando || livroAlocarModalFornecedorLoading}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              className={btn.secondaryLg}
              onClick={() => {
                setLivrosAlocarModalOpen(false);
                setLivroToAlocarModal(null);
                setLivroAlocarModalFornecedorId(null);
                setLivroAlocarModalFornecedorOptions([]);
                setLivroAlocarModalQuantidade(1);
              }}
              disabled={livrosAlocando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={btn.primaryLg}
              disabled={livrosAlocando || livroAlocarModalFornecedorId == null || livroToAlocarModal == null}
            >
              {livrosAlocando ? 'Alocando...' : 'Alocar'}
            </button>
          </div>
        </form>
      </AppModal>

      {/* Modal: Alocar item */}
      <AppModal
        open={outrosAllocateModalOpen}
        onClose={() => {
          setOutrosAllocateModalOpen(false);
          setOutrosAllocateItem(null);
          setOutrosAllocateProdutoId(null);
          setOutrosAllocateQuantidade(1);
        }}
        title="Alocar item do galpão"
        size="md"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!outrosAllocateItem || !outrosAllocateProdutoId) return;
            const ok = await handleAllocateOther(outrosAllocateItem, outrosAllocateProdutoId, outrosAllocateQuantidade);
            if (ok) {
              setOutrosAllocateModalOpen(false);
              setOutrosAllocateItem(null);
            }
          }}
          className="space-y-4"
        >
          <div className="text-sm text-white/70">
            {outrosAllocateItem ? (
              <>
                Item: <span className="text-white">{outrosAllocateItem.item}</span> (Disponível:{' '}
                <span className="text-white">{outrosAllocateItem.quantidadeDisponivel}</span>)
              </>
            ) : (
              'Selecione um item'
            )}
          </div>

          <AppSelect
            label="Produto do galpão (destino)"
            value={outrosAllocateProdutoId ?? ''}
            onChange={(value) => setOutrosAllocateProdutoId(value ? Number(value) : null)}
            placeholder="Selecionar"
            options={produtosOptions.map((p) => ({ value: p.id, label: p.nome }))}
            selectClassName="w-full"
            disabled={produtosOptionsLoading || !canEdit}
          />

          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Quantidade</label>
            <input
              type="number"
              min={1}
              max={outrosAllocateItem?.quantidadeDisponivel ?? undefined}
              value={outrosAllocateQuantidade}
              onChange={(e) => setOutrosAllocateQuantidade(Number(e.target.value) || 1)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              disabled={outrosAllocateLoading}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              className={btn.secondaryLg}
              onClick={() => {
                setOutrosAllocateModalOpen(false);
                setOutrosAllocateItem(null);
              }}
              disabled={outrosAllocateLoading}
            >
              Cancelar
            </button>
            <button type="submit" className={btn.primaryLg} disabled={outrosAllocateLoading || !outrosAllocateProdutoId || !outrosAllocateItem}>
              {outrosAllocateLoading ? 'Alocando...' : 'Alocar'}
            </button>
          </div>
        </form>
      </AppModal>

      {/* Modal: Avarias */}
      <AppModal
        open={outrosAvariaModalOpen}
        onClose={() => {
          setOutrosAvariaModalOpen(false);
          setOutrosAvariaItem(null);
          setOutrosAvariaProdutoId(null);
          setOutrosAvariaQuantidade(1);
          setOutrosAvariaJustificativa('');
          setOutrosAvarias([]);
          setOutrosAvariaEditRow(null);
          setOutrosAvariaEditJustificativa('');
          setOutrosAvariaDeleteRow(null);
        }}
        title="Avaria de item"
        size="md"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!outrosAvariaItem || !outrosAvariaProdutoId) return;
            const avariaItemId = outrosAvariaItem.id;
            if (!outrosAvariaJustificativa.trim()) {
              toast.error('Informe a justificativa da avaria.');
              return;
            }

            setOutrosAvariaLoading(true);
            try {
              await api.post(`/galpao/produtos/${outrosAvariaProdutoId}/outros-itens/avaria`, {
                estoqueId: outrosAvariaItem.id,
                quantidade: outrosAvariaQuantidade,
                justificativa: outrosAvariaJustificativa.trim(),
              });
              toast.success('Avaria registrada com sucesso.');
              setOutrosAvariaModalOpen(false);
              setOutrosAvariaItem(null);
              await loadOutros(outrosProdutoIdQuery);
              await loadOutrosAvarias(avariaItemId);
            } catch (err: any) {
              toast.error(formatApiError(err));
            } finally {
              setOutrosAvariaLoading(false);
            }
          }}
          className="space-y-4"
        >
          <div className="text-sm text-white/70">
            {outrosAvariaItem ? (
              <>
                Item: <span className="text-white">{outrosAvariaItem.item}</span> (Disponível:{' '}
                <span className="text-white">{outrosAvariaItem.quantidadeDisponivel}</span>)
              </>
            ) : (
              'Selecione um item'
            )}
          </div>

          <AppSelect
            label="Produto do galpão (registro)"
            value={outrosAvariaProdutoId ?? ''}
            onChange={(value) => setOutrosAvariaProdutoId(value ? Number(value) : null)}
            placeholder="Selecionar"
            options={produtosOptions.map((p) => ({ value: p.id, label: p.nome }))}
            selectClassName="w-full"
            disabled={produtosOptionsLoading || !canEdit}
          />

          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Quantidade (retira do estoque disponível)</label>
            <input
              type="number"
              min={1}
              max={outrosAvariaItem?.quantidadeDisponivel ?? undefined}
              value={outrosAvariaQuantidade}
              onChange={(e) => setOutrosAvariaQuantidade(Number(e.target.value) || 1)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              disabled={outrosAvariaLoading}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Justificativa da avaria</label>
            <textarea
              value={outrosAvariaJustificativa}
              onChange={(e) => setOutrosAvariaJustificativa(e.target.value)}
              rows={4}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              disabled={outrosAvariaLoading}
              placeholder="Ex.: item danificado / perda / prazo vencido..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              className={btn.secondaryLg}
              onClick={() => {
                setOutrosAvariaModalOpen(false);
                setOutrosAvariaItem(null);
              }}
              disabled={outrosAvariaLoading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={btn.primaryLg}
              disabled={outrosAvariaLoading || !outrosAvariaProdutoId || !outrosAvariaItem}
            >
              {outrosAvariaLoading ? 'Salvando...' : 'Registrar avaria'}
            </button>
          </div>

          {outrosAvariaItem && (
            <div className="space-y-3 pt-4 border-t border-white/10">
              <h4 className="text-sm font-semibold text-white/90">Histórico de avarias</h4>
              <DataTable<OutrosItemAvaria>
                data={outrosAvarias}
                keyExtractor={(a) => a.id}
                loading={outrosAvariasLoading}
                emptyMessage="Nenhuma avaria registrada para este item."
                paginate
                initialPageSize={10}
                responsiveFrom="md"
                renderMobileCard={(a) => (
                  <div className={`${almoxarifadoMobileCardCls} !p-3 space-y-2`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/70">{new Date(a.dataCriacao).toLocaleString('pt-BR')}</span>
                      <span className="font-semibold text-white">Qtd: {a.quantidade}</span>
                    </div>
                    <div className="text-xs text-white/80">Produto: {a.galpaoProduto?.nome ?? '-'}</div>
                    <div className="text-xs text-white/80 break-words">Justificativa: {a.justificativa}</div>
                    {canEdit && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                        <button
                          type="button"
                          className={btn.editSm}
                          onClick={() => {
                            setOutrosAvariaEditRow(a);
                            setOutrosAvariaEditJustificativa(a.justificativa);
                          }}
                        >
                          Editar motivo
                        </button>
                        <button type="button" className={btn.dangerSm} onClick={() => setOutrosAvariaDeleteRow(a)}>
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                )}
                columns={[
                  {
                    key: 'data',
                    label: 'Data',
                    render: (a) => (
                      <span className="text-xs text-white/70">
                        {new Date(a.dataCriacao).toLocaleString('pt-BR')}
                      </span>
                    ),
                  },
                  { key: 'qtd', label: 'Qtd', align: 'right', tdClassName: 'text-right', render: (a) => <span className="font-semibold">{a.quantidade}</span> },
                  {
                    key: 'produto',
                    label: 'Produto do galpão',
                    render: (a) => <span className="text-xs text-white/80">{a.galpaoProduto?.nome ?? '-'}</span>,
                  },
                  {
                    key: 'just',
                    label: 'Justificativa',
                    render: (a) => <span className="text-xs text-white/80 break-words">{a.justificativa}</span>,
                  },
                  {
                    key: 'acoes',
                    label: 'Ações',
                    render: (a) =>
                      canEdit ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={btn.editSm}
                            onClick={() => {
                              setOutrosAvariaEditRow(a);
                              setOutrosAvariaEditJustificativa(a.justificativa);
                            }}
                          >
                            Editar motivo
                          </button>
                          <button type="button" className={btn.dangerSm} onClick={() => setOutrosAvariaDeleteRow(a)}>
                            Excluir
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-white/40">—</span>
                      ),
                  },
                ]}
              />
            </div>
          )}
        </form>
      </AppModal>

      <AppModal
        open={!!outrosAvariaEditRow}
        onClose={() => {
          if (!outrosAvariaSavingJustificativa) {
            setOutrosAvariaEditRow(null);
            setOutrosAvariaEditJustificativa('');
          }
        }}
        title="Editar motivo da avaria"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Justificativa</label>
            <textarea
              rows={4}
              value={outrosAvariaEditJustificativa}
              onChange={(e) => setOutrosAvariaEditJustificativa(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              disabled={outrosAvariaSavingJustificativa}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={btn.secondary}
              disabled={outrosAvariaSavingJustificativa}
              onClick={() => {
                setOutrosAvariaEditRow(null);
                setOutrosAvariaEditJustificativa('');
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={btn.primary}
              disabled={outrosAvariaSavingJustificativa}
              onClick={() => void handleSaveOutrosAvariaJustificativa()}
            >
              {outrosAvariaSavingJustificativa ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={!!outrosAvariaDeleteRow}
        onClose={() => {
          if (!outrosAvariaDeleting) setOutrosAvariaDeleteRow(null);
        }}
        title="Excluir registro de avaria"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/85">
            Excluir esta avaria de <span className="font-semibold text-white">{outrosAvariaDeleteRow?.quantidade}</span>{' '}
            unidade(s)? A quantidade volta ao estoque disponível deste item.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={btn.secondary}
              disabled={outrosAvariaDeleting}
              onClick={() => setOutrosAvariaDeleteRow(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={btn.danger}
              disabled={outrosAvariaDeleting}
              onClick={() => void handleDeleteOutrosAvaria()}
            >
              {outrosAvariaDeleting ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </div>
      </AppModal>

      {/* Botão de dica e controle */}
      {!canEdit && (
        <p className="text-sm text-white/60">
          Seu perfil não possui permissão para movimentar estoque no Galpão.
        </p>
      )}
    </div>
  );
}

