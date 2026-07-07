import type { Cotacao, PurchaseLineItem, Supplier } from '../../types/stock';
import { btn } from '../../utils/buttonStyles';
import { FORMAS_PAGAMENTO } from '../../constants/stock';
import { calculateCotacaoTotal, getCotacaoValorMedioPorUnidade } from '../../utils/stockHelpers';
import { createEmptyCotacao } from '../../utils/purchaseRequest';
import { NumericInput } from '../ui/NumericInput';

type SimpleOption = { id: number; nome: string };

export type PurchaseRequestFieldsValue = PurchaseLineItem;

interface PurchaseRequestFieldsProps {
  value: PurchaseRequestFieldsValue;
  onChange: (next: PurchaseRequestFieldsValue) => void;
  /** Índice da linha (1-based na UI) quando há vários itens. */
  lineIndex?: number;
  lineCount?: number;
  onAddLineItem?: () => void;
  onRemoveLineItem?: () => void;
  /** Oculta frete (assinaturas). */
  hideFrete?: boolean;
  projects?: SimpleOption[];
  categories?: SimpleOption[];
  setores?: SimpleOption[];
  suppliers?: Supplier[];
  showProject?: boolean;
  showCategory?: boolean;
  showSetor?: boolean;
  showQuoteSelector?: boolean;
  showObservacao?: boolean;
  quoteOptionalText?: string;
  compact?: boolean;
}

export function PurchaseRequestFields({
  value,
  onChange,
  projects = [],
  categories = [],
  setores = [],
  suppliers = [],
  showProject = false,
  showCategory = false,
  showSetor = false,
  showQuoteSelector = false,
  showObservacao = false,
  quoteOptionalText = '(opcional)',
  compact = false,
  lineIndex,
  lineCount = 1,
  onAddLineItem,
  onRemoveLineItem,
  hideFrete = false,
}: PurchaseRequestFieldsProps) {
  const inputClass = compact
    ? 'mt-1 w-full bg-neutral/80 border border-white/10 rounded-md px-3 py-2 text-white'
    : 'w-full bg-white/10 border border-white/30 rounded-md px-4 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary';

  const cotacaoContainerClass = compact
    ? 'bg-neutral/40 border border-white/5 rounded-lg p-3 space-y-2'
    : 'bg-white/5 border border-white/10 rounded-md p-3 space-y-2';

  const quoteInputClass = compact
    ? 'mt-1 w-full bg-neutral/80 border border-white/10 rounded-md px-2 py-1.5 text-white text-sm'
    : 'w-full bg-white/10 border border-white/30 rounded-md px-2 py-1.5 text-white text-sm';

  const setField = <K extends keyof PurchaseRequestFieldsValue>(key: K, fieldValue: PurchaseRequestFieldsValue[K]) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const setCotacaoField = (index: number, key: keyof Cotacao, fieldValue: any) => {
    const nextCotacoes = [...value.cotacoes];
    nextCotacoes[index] = { ...nextCotacoes[index], [key]: fieldValue };
    onChange({ ...value, cotacoes: nextCotacoes });
  };

  const addCotacao = () => {
    onChange({ ...value, cotacoes: [...value.cotacoes, createEmptyCotacao()] });
  };

  const removeCotacao = (index: number) => {
    if (value.cotacoes.length <= 1) return;
    const nextCotacoes = value.cotacoes.filter((_, i) => i !== index);
    const selectedIndex = Math.min(value.selectedCotacaoIndex ?? 0, nextCotacoes.length - 1);
    onChange({ ...value, cotacoes: nextCotacoes, selectedCotacaoIndex: Math.max(0, selectedIndex) });
  };

  return (
    <div className="space-y-4">
      {(lineCount > 1 || onRemoveLineItem) && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white/90">
            Item {lineIndex ?? 1}
            {lineCount > 1 ? ` de ${lineCount}` : ''}
          </span>
          {onRemoveLineItem && lineCount > 1 && (
            <button type="button" onClick={onRemoveLineItem} className="text-xs text-danger hover:text-danger/80 font-medium">
              Remover item
            </button>
          )}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        <label className="text-sm text-white/80">
          Item <span className="text-danger">*</span>
          <input
            type="text"
            required
            value={value.item}
            onChange={(e) => setField('item', e.target.value)}
            className={compact ? inputClass : `${inputClass} mt-2`}
            placeholder="Nome do item"
          />
        </label>

        <label className="text-sm text-white/80">
          Quantidade <span className="text-danger">*</span>
          <NumericInput
            required
            min={1}
            integer
            value={value.quantidade}
            onValueChange={(v) => setField('quantidade', v)}
            className={compact ? inputClass : `${inputClass} mt-2`}
          />
        </label>

        {showProject && (
          <label className="text-sm text-white/80">
            Projeto
            <select
              value={value.projetoId || ''}
              onChange={(e) => setField('projetoId', e.target.value ? Number(e.target.value) : undefined)}
              className={compact ? inputClass : `${inputClass} mt-2`}
            >
              <option value="" className="bg-neutral text-white">
                Sem projeto (opcional)
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id} className="bg-neutral text-white">
                  {project.nome}
                </option>
              ))}
            </select>
          </label>
        )}

        {showCategory && (
          <label className="text-sm text-white/80">
            Categoria
            <select
              value={value.categoriaId || ''}
              onChange={(e) => setField('categoriaId', e.target.value ? Number(e.target.value) : undefined)}
              className={compact ? inputClass : `${inputClass} mt-2`}
            >
              <option value="" className="bg-neutral text-white">
                Selecione...
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id} className="bg-neutral text-white">
                  {category.nome}
                </option>
              ))}
            </select>
          </label>
        )}

        {showSetor && (
          <label className="text-sm text-white/80">
            Setor da Compra
            <select
              value={value.setorId || ''}
              onChange={(e) => setField('setorId', e.target.value ? Number(e.target.value) : undefined)}
              className={compact ? inputClass : `${inputClass} mt-2`}
            >
              <option value="" className="bg-neutral text-white">
                Sem setor
              </option>
              {setores.map((setor) => (
                <option key={setor.id} value={setor.id} className="bg-neutral text-white">
                  {setor.nome}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="text-sm text-white/80 block">
        Motivo da compra
        <textarea
          value={value.descricao || ''}
          onChange={(e) => setField('descricao', e.target.value)}
          rows={3}
          className={compact ? `${inputClass} h-24` : `${inputClass} mt-2`}
          placeholder="Descreva o motivo da compra..."
        />
      </label>

      {showObservacao && (
        <label className="text-sm text-white/80 block">
          Observação
          <textarea
            value={value.observacao || ''}
            onChange={(e) => setField('observacao', e.target.value)}
            rows={3}
            className={compact ? `${inputClass} h-20` : `${inputClass} mt-2`}
            placeholder="Observações gerais (opcional)"
          />
        </label>
      )}

      <div className="space-y-3 border-t border-white/10 pt-4">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h5 className="text-sm font-semibold text-white/90">
            Cotações <span className="text-white/50 text-xs ml-1">{quoteOptionalText}</span>
          </h5>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={addCotacao} className={btn.primarySoft}>
              + Adicionar Cotação
            </button>
            {onAddLineItem && (
              <button type="button" onClick={onAddLineItem} className={btn.secondary}>
                + Adicionar outro item
              </button>
            )}
          </div>
        </div>

        {value.cotacoes.map((cotacao, index) => (
          <div key={index} className={cotacaoContainerClass}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-white/70">Cotação {index + 1}</span>
              {value.cotacoes.length > 1 && (
                <button type="button" onClick={() => removeCotacao(index)} className="text-xs text-danger hover:text-danger/80">
                  Remover
                </button>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-2">
              <label className="text-xs text-white/70">
                Valor Unitário (R$)
                <NumericInput
                  min={0}
                  step={0.01}
                  value={cotacao.valorUnitario}
                  onValueChange={(v) => setCotacaoField(index, 'valorUnitario', v ?? undefined)}
                  className={quoteInputClass}
                />
              </label>

              {!hideFrete && (
                <label className="text-xs text-white/70">
                  Frete (R$)
                  <NumericInput
                    min={0}
                    step={0.01}
                    value={cotacao.frete}
                    onValueChange={(v) => setCotacaoField(index, 'frete', v ?? undefined)}
                    className={quoteInputClass}
                  />
                </label>
              )}

              <label className="text-xs text-white/70">
                Impostos (R$)
                <NumericInput
                  min={0}
                  step={0.01}
                  value={cotacao.impostos}
                  onValueChange={(v) => setCotacaoField(index, 'impostos', v ?? undefined)}
                  className={quoteInputClass}
                />
              </label>

              <label className="text-xs text-white/70">
                Desconto
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <label className="flex items-center gap-1 text-white/80 cursor-pointer">
                    <input
                      type="radio"
                      name={`descontoTipo-${index}`}
                      checked={(cotacao.descontoTipo || 'valor') === 'valor'}
                      onChange={() => setCotacaoField(index, 'descontoTipo', 'valor')}
                      className="rounded"
                    />
                    R$
                  </label>
                  <label className="flex items-center gap-1 text-white/80 cursor-pointer">
                    <input
                      type="radio"
                      name={`descontoTipo-${index}`}
                      checked={(cotacao.descontoTipo || 'valor') === 'porcentagem'}
                      onChange={() => setCotacaoField(index, 'descontoTipo', 'porcentagem')}
                      className="rounded"
                    />
                    %
                  </label>
                  <NumericInput
                    min={0}
                    step={(cotacao.descontoTipo || 'valor') === 'porcentagem' ? 0.1 : 0.01}
                    value={cotacao.desconto}
                    onValueChange={(v) => setCotacaoField(index, 'desconto', v ?? undefined)}
                    className="w-20 bg-neutral/80 border border-white/10 rounded-md px-2 py-1.5 text-white text-sm"
                  />
                </div>
              </label>

              <label className="text-xs text-white/70">
                Link
                <input
                  type="url"
                  value={cotacao.link || ''}
                  onChange={(e) => setCotacaoField(index, 'link', e.target.value)}
                  className={quoteInputClass}
                  placeholder="https://..."
                />
              </label>

              <label className="text-xs text-white/70">
                Fornecedor
                <select
                  value={cotacao.fornecedorId || ''}
                  onChange={(e) => setCotacaoField(index, 'fornecedorId', e.target.value ? Number(e.target.value) : undefined)}
                  className={quoteInputClass}
                >
                  <option value="" className="bg-neutral text-white">
                    Selecione um fornecedor (opcional)
                  </option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id} className="bg-neutral text-white">
                      {supplier.nomeFantasia}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-white/70 md:col-span-2">
                Forma de Pagamento
                <select
                  value={cotacao.formaPagamento || ''}
                  onChange={(e) => setCotacaoField(index, 'formaPagamento', e.target.value)}
                  className={quoteInputClass}
                >
                  <option value="" className="bg-neutral text-white">
                    Selecione (opcional)
                  </option>
                  {FORMAS_PAGAMENTO.map((forma) => (
                    <option key={forma} value={forma} className="bg-neutral text-white">
                      {forma}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-2 pt-2 border-t border-white/5 text-xs text-white/70">
              <div>
                Total por unidade:{' '}
                <span className="font-semibold text-white">
                  {getCotacaoValorMedioPorUnidade(cotacao, value.quantidade ?? 1).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </span>
              </div>
              <div>
                Total ({value.quantidade ?? '—'} unidades):{' '}
                <span className="font-semibold text-primary">
                  {calculateCotacaoTotal(cotacao, value.quantidade ?? 0).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showQuoteSelector && value.cotacoes.length > 0 && (
        <label className="text-sm text-white/80 block">
          Cotação Selecionada <span className="text-danger">*</span>
          <select
            required
            value={value.selectedCotacaoIndex ?? 0}
            onChange={(e) => setField('selectedCotacaoIndex', Number(e.target.value))}
            className={compact ? inputClass : `${inputClass} mt-2`}
          >
            {value.cotacoes.map((cot, index) => {
              const total = calculateCotacaoTotal(cot, value.quantidade ?? 0);
              return (
                <option key={index} value={index} className="bg-neutral text-white">
                  Cotação {index + 1}: R$ {total.toFixed(2)}
                </option>
              );
            })}
          </select>
        </label>
      )}
    </div>
  );
}
