import type { Cotacao, StockItem, StockItemEntrada } from '../../../types/stock';
import { btn } from '../../../utils/buttonStyles';
import { calculateCotacaoTotal, normalizeCotacaoForForm } from '../../../utils/stockHelpers';
import { FilePreviewTrigger } from '../../files/FilePreviewTrigger';
import { UploadFileLink } from '../../files/UploadFileLink';
import { resolvePublicUploadUrl } from '../../../utils/uploadFile';

function formatDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

function cotacaoLinkHref(link: string): string {
  const t = link.trim();
  if (!t) return '';
  if (t.startsWith('http://') || t.startsWith('https://')) return t;
  return resolvePublicUploadUrl(t);
}

interface ItemDetailsModalProps {
  isOpen: boolean;
  item: StockItem | null;
  onClose: () => void;
  getCategoryName: (categoriaId?: number) => string;
  getSupplierName: (fornecedorId?: number) => string;
  getCotacaoValorUnitario: (cotacao: Cotacao) => number;
}

export function ItemDetailsModal({
  isOpen,
  item,
  onClose,
  getCategoryName,
  getSupplierName,
  getCotacaoValorUnitario,
}: ItemDetailsModalProps) {
  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-white/20 bg-neutral shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-white/20 bg-neutral px-6 py-4">
          <h2 className="text-xl font-bold">Detalhes do Item</h2>
          <button onClick={onClose} className="text-2xl text-white/50 transition-colors hover:text-white">
            ✕
          </button>
        </div>
        <div className="space-y-6 p-6">
          {item.imagemUrl && (
            <div className="flex justify-center">
              <FilePreviewTrigger
                src={item.imagemUrl}
                name={item.item || 'Item'}
                variant="thumbnail"
                className="max-h-64 max-w-full rounded-lg border border-white/10 overflow-hidden"
              >
                <img
                  src={resolvePublicUploadUrl(item.imagemUrl)}
                  alt={item.item || 'Item'}
                  className="max-h-64 max-w-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </FilePreviewTrigger>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">Item</label>
              <p className="font-semibold text-white/90">{item.item || '—'}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">Quantidade Total</label>
              <p className="font-semibold text-white/90">{item.quantidade || 0}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">Quantidade Alocada</label>
              <p className="font-semibold text-white/90">{item.quantidadeAlocada || 0}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">Quantidade Disponível</label>
              <p className="font-semibold text-white/90">{item.quantidadeDisponivel || item.quantidade || 0}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">Valor unitário</label>
              {item.entradas && item.entradas.length > 1 && (
                <p className="mb-0.5 text-xs text-white/45">Média ponderada entre as entradas</p>
              )}
              <p className="font-semibold text-white/90">
                {item.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">Valor Total</label>
              <p className="font-semibold text-white/90">
                {((item.valorUnitario || 0) * (item.quantidade || 0)).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">Status</label>
              <p className="font-semibold text-white/90">{item.status || '—'}</p>
            </div>
            {(item as any).codigo && (
              <div>
                <label className="mb-1 block text-sm font-medium text-white/60">Código</label>
                <p className="font-semibold text-white/90">{(item as any).codigo}</p>
              </div>
            )}
            {(item as any).unidadeMedida && (
              <div>
                <label className="mb-1 block text-sm font-medium text-white/60">Unidade de Medida</label>
                <p className="font-semibold text-white/90">{(item as any).unidadeMedida}</p>
              </div>
            )}
            {(item as any).localizacao && (
              <div>
                <label className="mb-1 block text-sm font-medium text-white/60">Localização</label>
                <p className="font-semibold text-white/90">{(item as any).localizacao}</p>
              </div>
            )}
            {(item as any).categoriaId && (
              <div>
                <label className="mb-1 block text-sm font-medium text-white/60">Categoria</label>
                <p className="font-semibold text-white/90">{getCategoryName((item as any).categoriaId)}</p>
              </div>
            )}
          </div>

          {item.descricao && (
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">Descrição</label>
              <p className="whitespace-pre-wrap text-white/90">{item.descricao}</p>
            </div>
          )}

          {(item.nfUrl || item.comprovantePagamentoUrl) && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <label className="mb-1 block text-sm font-medium text-white/60">
                Nota fiscal e comprovante
              </label>
              <p className="mb-3 text-xs text-white/50">
                Vêm da compra quando ela é marcada como entregue (consolidadas na linha do estoque) ou foram
                anexados ao editar o item.
              </p>
              <div className="flex flex-wrap gap-4">
                {item.nfUrl && (
                  <UploadFileLink src={item.nfUrl} className="text-sm text-primary underline hover:text-primary/80">
                    Ver nota fiscal
                  </UploadFileLink>
                )}
                {item.comprovantePagamentoUrl && (
                  <UploadFileLink
                    src={item.comprovantePagamentoUrl}
                    className="text-sm text-primary underline hover:text-primary/80"
                  >
                    Ver comprovante de pagamento
                  </UploadFileLink>
                )}
              </div>
            </div>
          )}

          {item.cotacoesJson && Array.isArray(item.cotacoesJson) && item.cotacoesJson.length > 0 && (
            <div>
              <label className="mb-2 block text-sm font-medium text-white/60">Cotações</label>
              <div className="space-y-2">
                {item.cotacoesJson.map((cotacao: Cotacao, index: number) => {
                  const vu = getCotacaoValorUnitario(cotacao);
                  const fr = cotacao.frete ?? 0;
                  const imp = cotacao.impostos ?? 0;
                  const totalComQuantidade = calculateCotacaoTotal(
                    normalizeCotacaoForForm(cotacao),
                    item.quantidade || 1,
                  );
                  return (
                    <div key={index} className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-white/90">Cotação {index + 1}</span>
                        <span className="text-sm font-bold text-primary">
                          {totalComQuantidade.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-white/70">
                        <div>Valor Unitário: {vu.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        <div>Frete: {fr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        <div>Impostos: {imp.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        {cotacao.desconto != null && cotacao.desconto > 0 && (
                          <div>
                            Desconto:{' '}
                            {(cotacao.descontoTipo || 'valor') === 'porcentagem'
                              ? `${cotacao.desconto}%`
                              : cotacao.desconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </div>
                        )}
                        {cotacao.formaPagamento && <div>Forma de Pagamento: {cotacao.formaPagamento}</div>}
                        {cotacao.fornecedorId ? (
                          <div>Fornecedor: {getSupplierName(cotacao.fornecedorId)}</div>
                        ) : cotacao.fornecedor ? (
                          <div>Fornecedor: {cotacao.fornecedor}</div>
                        ) : null}
                      </div>
                      {cotacao.link && (
                        <div className="mt-2">
                          <a
                            href={cotacaoLinkHref(cotacao.link)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary underline hover:text-primary/80"
                          >
                            Ver link da cotação
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {item.entradas && item.entradas.length > 0 && (
            <div>
              <label className="mb-2 block text-sm font-medium text-white/60">
                Histórico de entradas (compras entregues)
              </label>
              <p className="mb-3 text-xs text-white/50">
                Cada linha corresponde a uma compra que entrou no estoque, com NF, comprovante e valores da época.
              </p>
              <div className="space-y-3">
                {item.entradas.map((entrada: StockItemEntrada) => (
                  <div
                    key={entrada.id}
                    className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/85"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-white/90">Compra #{entrada.compraId}</span>
                      <span className="text-xs text-white/50">
                        Entrada: {formatDataHora(entrada.dataEntrada)}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                      <div>
                        Quantidade: <strong>{entrada.quantidade}</strong>
                      </div>
                      <div>
                        Valor unitário (nesta compra):{' '}
                        <strong>
                          {entrada.valorUnitario.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </strong>
                      </div>
                      {entrada.compra?.dataCompra && (
                        <div>Data da compra: {formatDataHora(entrada.compra.dataCompra)}</div>
                      )}
                      {entrada.compra?.dataEntrega && (
                        <div>Data de entrega: {formatDataHora(entrada.compra.dataEntrega)}</div>
                      )}
                      {entrada.formaPagamento && <div>Forma de pagamento: {entrada.formaPagamento}</div>}
                    </div>
                    {entrada.observacao && (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-white/55">{entrada.observacao}</p>
                    )}
                    {(entrada.nfUrl || entrada.comprovantePagamentoUrl) && (
                      <div className="mt-3 flex flex-wrap gap-4 border-t border-white/10 pt-3">
                        {entrada.nfUrl && (
                          <UploadFileLink
                            src={entrada.nfUrl}
                            className="text-xs text-primary underline hover:text-primary/80"
                          >
                            Ver nota fiscal
                          </UploadFileLink>
                        )}
                        {entrada.comprovantePagamentoUrl && (
                          <UploadFileLink
                            src={entrada.comprovantePagamentoUrl}
                            className="text-xs text-primary underline hover:text-primary/80"
                          >
                            Ver comprovante
                          </UploadFileLink>
                        )}
                      </div>
                    )}
                    {entrada.cotacoesJson && Array.isArray(entrada.cotacoesJson) && entrada.cotacoesJson.length > 0 && (
                      <div className="mt-3 border-t border-white/10 pt-3">
                        <span className="text-xs font-medium text-white/60">Cotações nesta entrada</span>
                        <ul className="mt-1 list-inside list-disc text-xs text-white/55">
                          {entrada.cotacoesJson.map((c: Cotacao, i: number) => {
                            const vu = getCotacaoValorUnitario(c);
                            const totalLinha = calculateCotacaoTotal(
                              normalizeCotacaoForForm(c),
                              entrada.quantidade || 1,
                            );
                            return (
                              <li key={i}>
                                Cotação {i + 1}:{' '}
                                {totalLinha.toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                })}{' '}
                                (unit. {vu.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                                {c.link ? (
                                  <>
                                    {' '}
                                    —{' '}
                                    <a
                                      href={cotacaoLinkHref(c.link)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary underline hover:text-primary/80"
                                    >
                                      link
                                    </a>
                                  </>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end border-t border-white/10 pt-4">
            <button onClick={onClose} className={btn.secondaryLg}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
