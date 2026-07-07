import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { userHasAnyPermission } from '../utils/projectAccess';
import { TabSolicitacoes } from '../components/rh/TabSolicitacoes';
import { TabBancoHoras } from '../components/rh/TabBancoHoras';
import { TabFerias } from '../components/rh/TabFerias';
import { TabAfastamentos } from '../components/rh/TabAfastamentos';
import { TabDocumentos } from '../components/rh/TabDocumentos';
import { TabDesempenho } from '../components/rh/TabDesempenho';
import { TabTreinamentos } from '../components/rh/TabTreinamentos';
import { TabDashboardRh } from '../components/rh/TabDashboardRh';
import { AppSectionTabs } from '../components/ui/AppSectionTabs';

interface Aba {
  id: string;
  label: string;
  shortLabel?: string;
  visivelSe: (h: (key: string) => boolean) => boolean;
  render: () => JSX.Element;
}

export default function RhCentral() {
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();

  const has = useMemo(
    () =>
      (...keys: string[]) =>
        userHasAnyPermission(user, ...keys),
    [user],
  );

  const abas: Aba[] = useMemo(
    () => [
      {
        id: 'dashboard',
        label: 'Dashboard',
        visivelSe: (h) => h('rh_dashboard:ver'),
        render: () => <TabDashboardRh />,
      },
      {
        id: 'solicitacoes',
        label: 'Solicitações',
        shortLabel: 'Solicit.',
        visivelSe: (h) => h('solicitacoes_ponto:abrir') || h('solicitacoes_ponto:revisar'),
        render: () => <TabSolicitacoes />,
      },
      {
        id: 'banco',
        label: 'Banco de Horas',
        shortLabel: 'Banco',
        visivelSe: (h) =>
          h('banco_horas:ver_proprio') || h('banco_horas:ver_todos') || h('banco_horas:fechar'),
        render: () => <TabBancoHoras />,
      },
      {
        id: 'ferias',
        label: 'Férias',
        visivelSe: (h) => h('ferias:solicitar') || h('ferias:aprovar'),
        render: () => <TabFerias />,
      },
      {
        id: 'afastamentos',
        label: 'Afastamentos',
        shortLabel: 'Afast.',
        visivelSe: (h) => h('afastamentos:registrar') || h('afastamentos:ver_todos'),
        render: () => <TabAfastamentos />,
      },
      {
        id: 'documentos',
        label: 'Documentos',
        shortLabel: 'Docs',
        visivelSe: (h) => h('documentos_rh:gerenciar') || h('documentos_rh:ver_proprios'),
        render: () => <TabDocumentos />,
      },
      {
        id: 'desempenho',
        label: 'Desempenho',
        shortLabel: 'Desemp.',
        visivelSe: (h) => h('avaliacoes:gerenciar') || h('avaliacoes:responder'),
        render: () => <TabDesempenho />,
      },
      {
        id: 'treinamentos',
        label: 'Treinamentos',
        shortLabel: 'Treinos',
        visivelSe: (h) => h('treinamentos:gerenciar') || h('treinamentos:participar'),
        render: () => <TabTreinamentos />,
      },
    ],
    [],
  );

  const visiveis = abas.filter((a) => a.visivelSe((k) => has(k)));
  const atual = params.get('aba') ?? visiveis[0]?.id ?? 'dashboard';

  useEffect(() => {
    if (visiveis.length === 0) return;
    if (!visiveis.find((a) => a.id === atual)) {
      setParams({ aba: visiveis[0].id });
    }
  }, [visiveis, atual, setParams]);

  if (visiveis.length === 0) {
    return (
      <div className="p-6 text-white/60">
        Você não tem permissão para acessar nenhuma aba do RH.
      </div>
    );
  }

  const abaCorrente = visiveis.find((a) => a.id === atual) ?? visiveis[0];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Recursos Humanos</h1>
        <p className="text-sm text-white/60">
          Gestão de pessoas: ponto, banco de horas, férias, documentos, desempenho e treinamentos.
        </p>
      </header>

      <AppSectionTabs
        tabs={visiveis.map((a) => ({
          id: a.id,
          label: a.label,
          shortLabel: a.shortLabel,
        }))}
        activeId={atual}
        onChange={(id) => setParams({ aba: id })}
        ariaLabel="Abas do RH"
      />

      <div>{abaCorrente.render()}</div>
    </div>
  );
}
