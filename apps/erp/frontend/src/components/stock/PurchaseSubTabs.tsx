import type { PurchaseSubTab } from '../../types/stock';

interface PurchaseCounts {
  pendente: number;
  'a-caminho': number;
  entregue: number;
  despesas: number;
  assinaturas: number;
}

interface PurchaseSubTabsProps {
  subTab: PurchaseSubTab;
  counts: PurchaseCounts;
  onChange: (tab: PurchaseSubTab) => void;
}

function tabButtonClass(isActive: boolean): string {
  return `px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${
    isActive
      ? 'text-primary border-primary'
      : 'text-white/70 border-transparent hover:text-white hover:border-white/30'
  }`;
}

function badgeClass(isActive: boolean): string {
  return `ml-2 px-2 py-0.5 rounded-full text-xs ${
    isActive ? 'bg-primary/20 text-primary' : 'bg-white/10 text-white/70'
  }`;
}

export function PurchaseSubTabs({ subTab, counts, onChange }: PurchaseSubTabsProps) {
  return (
    <div className="flex gap-2 mb-4 border-b border-white/10">
      <button onClick={() => onChange('pendente')} className={tabButtonClass(subTab === 'pendente')}>
        Pendente
        {counts.pendente > 0 && <span className={badgeClass(subTab === 'pendente')}>{counts.pendente}</span>}
      </button>
      <button onClick={() => onChange('a-caminho')} className={tabButtonClass(subTab === 'a-caminho')}>
        A Caminho
        {counts['a-caminho'] > 0 && (
          <span className={badgeClass(subTab === 'a-caminho')}>{counts['a-caminho']}</span>
        )}
      </button>
      <button onClick={() => onChange('entregue')} className={tabButtonClass(subTab === 'entregue')}>
        Entregue
        {counts.entregue > 0 && <span className={badgeClass(subTab === 'entregue')}>{counts.entregue}</span>}
      </button>
      <button onClick={() => onChange('despesas')} className={tabButtonClass(subTab === 'despesas')}>
        Despesas
        {counts.despesas > 0 && <span className={badgeClass(subTab === 'despesas')}>{counts.despesas}</span>}
      </button>
      <button onClick={() => onChange('assinaturas')} className={tabButtonClass(subTab === 'assinaturas')}>
        Assinaturas
        {counts.assinaturas > 0 && <span className={badgeClass(subTab === 'assinaturas')}>{counts.assinaturas}</span>}
      </button>
    </div>
  );
}
