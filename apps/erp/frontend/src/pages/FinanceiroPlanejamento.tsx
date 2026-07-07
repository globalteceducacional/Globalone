import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import {
  FINANCEIRO_PERMS,
  temAbaFinanceiro,
  temAbaFinanceiroPontoPagamentos,
} from '../utils/financeiroPermissions';
import { TabVisaoGeral } from '../components/financeiro/TabVisaoGeral';
import { TabFinanceiroProjetos } from '../components/financeiro/TabFinanceiroProjetos';
import { TabFinanceiroCuradoria } from '../components/financeiro/TabFinanceiroCuradoria';
import { TabFinanceiroCompras } from '../components/financeiro/TabFinanceiroCompras';
import { TabFinanceiroFechamento } from '../components/financeiro/TabFinanceiroFechamento';
import { TabFinanceiroPonto } from '../components/financeiro/TabFinanceiroPonto';
import { AppSectionTabs } from '../components/ui/AppSectionTabs';

interface Aba {
  id: string;
  label: string;
  shortLabel?: string;
  visivelSe: boolean;
  render: () => JSX.Element;
}

export default function FinanceiroPlanejamento() {
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();

  const abas: Aba[] = useMemo(
    () => [
      {
        id: 'visao',
        label: 'Visão geral',
        shortLabel: 'Visão',
        visivelSe: temAbaFinanceiro(user, FINANCEIRO_PERMS.visao),
        render: () => <TabVisaoGeral />,
      },
      {
        id: 'ponto',
        label: 'Horas & valores',
        shortLabel: 'Horas',
        visivelSe: temAbaFinanceiro(user, FINANCEIRO_PERMS.ponto) || temAbaFinanceiroPontoPagamentos(user),
        render: () => <TabFinanceiroPonto />,
      },
      {
        id: 'fechamento',
        label: 'Pagamentos do mês',
        shortLabel: 'Pagamentos',
        visivelSe: temAbaFinanceiro(user, FINANCEIRO_PERMS.pagamentos) || temAbaFinanceiroPontoPagamentos(user),
        render: () => <TabFinanceiroFechamento />,
      },
      {
        id: 'projetos',
        label: 'Projetos',
        visivelSe: temAbaFinanceiro(user, FINANCEIRO_PERMS.projetos),
        render: () => <TabFinanceiroProjetos />,
      },
      {
        id: 'curadoria',
        label: 'Curadoria',
        visivelSe: temAbaFinanceiro(user, FINANCEIRO_PERMS.curadoria),
        render: () => <TabFinanceiroCuradoria />,
      },
      {
        id: 'compras',
        label: 'Compras',
        visivelSe: temAbaFinanceiro(user, FINANCEIRO_PERMS.compras),
        render: () => <TabFinanceiroCompras />,
      },
    ],
    [user],
  );

  const visiveis = abas.filter((a) => a.visivelSe);
  const atual = params.get('aba') ?? 'visao';

  useEffect(() => {
    if (visiveis.length === 0) return;
    if (!visiveis.find((a) => a.id === atual)) {
      setParams({ aba: visiveis[0].id });
    }
  }, [visiveis, atual, setParams]);

  const abaCorrente = visiveis.find((a) => a.id === atual) ?? visiveis[0];

  if (visiveis.length === 0) {
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <p className="text-sm text-white/60">
          Você não tem permissão para nenhuma aba do Financeiro. Peça ao administrador as permissões em{' '}
          <strong className="text-white/80">Cargos → Financeiro</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Financeiro e planejamento</h1>
        <p className="text-sm text-white/60">
          Visão consolidada: horas/valores, pagamentos do mês, projetos, curadoria e compras — sem substituir os
          cadastros originais.
        </p>
      </header>

      <AppSectionTabs
        tabs={visiveis.map((a) => ({ id: a.id, label: a.label, shortLabel: a.shortLabel }))}
        activeId={atual}
        onChange={(id) => setParams({ aba: id })}
        ariaLabel="Seções do financeiro"
      />

      <div className="min-w-0">{abaCorrente ? abaCorrente.render() : null}</div>
    </div>
  );
}
