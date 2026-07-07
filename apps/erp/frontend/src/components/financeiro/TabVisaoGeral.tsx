import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { btn } from '../../utils/buttonStyles';
import { formatApiError } from '../../utils/toast';
import {
  FINANCEIRO_PERMS,
  temAbaFinanceiro,
  temAbaFinanceiroPontoPagamentos,
} from '../../utils/financeiroPermissions';

export type FinanceiroResumo = {
  projetos: null | { emAndamento: number; valorTotalSoma: number };
  curadoria: null | { orcamentos: number };
  compras: null | { emFluxo: number };
};

export function TabVisaoGeral() {
  const user = useAuthStore((s) => s.user);
  const [resumo, setResumo] = useState<FinanceiroResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mostrarAtalhoPonto = useMemo(
    () => temAbaFinanceiro(user, FINANCEIRO_PERMS.ponto) || temAbaFinanceiroPontoPagamentos(user),
    [user],
  );

  const mostrarAtalhoPagamentos = useMemo(
    () => temAbaFinanceiro(user, FINANCEIRO_PERMS.pagamentos) || temAbaFinanceiroPontoPagamentos(user),
    [user],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<FinanceiroResumo>('/financeiro/resumo');
        if (!cancelled) setResumo(data);
      } catch (e: unknown) {
        if (!cancelled) setError(formatApiError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-white/60 py-8 text-center">Carregando resumo…</p>;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-danger text-sm">
        {error}
      </div>
    );
  }

  const fmt = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <p className="text-sm text-white/65">
        Visão rápida com números já existentes no sistema (projetos em andamento sob seu escopo, orçamentos de
        curadoria e compras em fluxo). Use as abas <strong className="text-white/80">Horas & valores</strong> e{' '}
        <strong className="text-white/80">Pagamentos do mês</strong> para valores por colaborador, ou os atalhos abaixo.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {resumo?.projetos != null && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-semibold text-white/90">Projetos em andamento</h3>
            <p className="mt-2 text-2xl font-bold text-primary">{resumo.projetos.emAndamento}</p>
            <p className="mt-1 text-xs text-white/55">Valor total somado (contrato)</p>
            <p className="text-lg font-medium text-white/85">{fmt(resumo.projetos.valorTotalSoma)}</p>
            <Link to="/projects" className={`${btn.secondary} mt-3 inline-block text-sm`}>
              Abrir projetos
            </Link>
          </div>
        )}

        {resumo?.curadoria != null && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-semibold text-white/90">Orçamentos — Curadoria</h3>
            <p className="mt-2 text-2xl font-bold text-amber-300/95">{resumo.curadoria.orcamentos}</p>
            <p className="mt-1 text-xs text-white/55">Cadastros de orçamento (livros)</p>
            <Link to="/curadoria" className={`${btn.secondary} mt-3 inline-block text-sm`}>
              Abrir curadoria
            </Link>
          </div>
        )}

        {resumo?.compras != null && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-semibold text-white/90">Compras em fluxo</h3>
            <p className="mt-2 text-2xl font-bold text-emerald-300/95">{resumo.compras.emFluxo}</p>
            <p className="mt-1 text-xs text-white/55">Solicitado, pendente ou a caminho (não entregue)</p>
            <Link to="/stock" className={`${btn.secondary} mt-3 inline-block text-sm`}>
              Abrir compras e estoque
            </Link>
          </div>
        )}

        {mostrarAtalhoPonto && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 sm:col-span-2 xl:col-span-1">
            <h3 className="text-sm font-semibold text-white/90">Horas & valores (ponto)</h3>
            <p className="mt-1 text-xs text-white/55">Projeção do mês conforme remuneração na jornada.</p>
            <Link to="/financeiro?aba=ponto" className={`${btn.secondary} mt-3 inline-block text-sm`}>
              Abrir aba
            </Link>
          </div>
        )}

        {mostrarAtalhoPagamentos && (
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 p-4 sm:col-span-2 xl:col-span-1">
            <h3 className="text-sm font-semibold text-white/90">Pagamentos do mês</h3>
            <p className="mt-1 text-xs text-white/55">Valor base + extras solicitados; saldo BH como referência.</p>
            <Link to="/financeiro?aba=fechamento" className={`${btn.secondary} mt-3 inline-block text-sm`}>
              Abrir aba
            </Link>
          </div>
        )}
      </div>

      {resumo?.projetos == null &&
        resumo?.curadoria == null &&
        resumo?.compras == null &&
        !mostrarAtalhoPonto &&
        !mostrarAtalhoPagamentos && (
          <p className="text-sm text-white/55">
            Nenhum indicador disponível para o seu perfil de permissões. Solicite ao administrador acesso às abas
            desejadas em Cargos → Financeiro.
          </p>
        )}
    </div>
  );
}
