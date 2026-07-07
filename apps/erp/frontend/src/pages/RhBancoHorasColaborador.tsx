import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  fecharBancoHoras,
  getBancoHorasUsuario,
  patchPoliticaUsoExtrasBancoHoras,
  reabrirFechamentoBancoHoras,
  solicitarDesafioReabrirFechamento,
  type BancoHorasExtrato,
  type BancoHorasLancamento,
} from '../services/rh';
import { useAuthStore } from '../store/auth';
import { userHasPermission } from '../utils/projectAccess';
import { toast, formatApiError } from '../utils/toast';
import { ExportarBatidasMesModal } from '../components/rh/ExportarBatidasMesModal';
import { ImprimirMinhaFolhaPontoButton } from '../components/rh/ImprimirMinhaFolhaPontoButton';
import { btn } from '../utils/buttonStyles';
import {
  agruparLancamentosMesmoDia,
  COLUNAS_LANCAMENTOS_BANCO_HORAS,
  LancarManualModal,
  ModalAjustePontoParDia,
  ModalConfirmarExcluirLancamentoBancoHoras,
  bancoHorasLancamentoExclusivel,
  colunasLancamentosBancoHorasComAcoes,
  rotuloOrigemBancoHoras,
} from '../components/rh/TabBancoHoras';
import { DataTable } from '../components/DataTable';
import {
  BancoHorasFiltroConsulta,
  Card,
  Field,
  Modal,
  competenciaCorrente,
  filtroBancoHorasParaParams,
  formatData,
  formatHoras,
  rotuloPeriodoBancoHoras,
  type EstadoFiltroBancoHoras,
} from '../components/rh/rhUi';

function KpiBox({ label, valor, valorClass }: { label: string; valor: string; valorClass?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 min-w-[140px]">
      <p className="text-xs uppercase tracking-wide text-white/60">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${valorClass ?? ''}`}>{valor}</p>
    </div>
  );
}

export default function RhBancoHorasColaborador() {
  const { usuarioId: param } = useParams();
  const usuarioId = Number(param);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const podeVerTodos = userHasPermission(user, 'banco_horas:ver_todos');
  const podeFechar = userHasPermission(user, 'banco_horas:fechar');
  const podeAjustarPonto = userHasPermission(user, 'ponto:ajustar');
  const podeExportarBatidas = userHasPermission(user, 'ponto:exportar');
  const [exportarBatidasOpen, setExportarBatidasOpen] = useState(false);

  const nomeState = (location.state as { nome?: string } | null)?.nome;

  const compFromUrl = searchParams.get('competencia');
  const dataInicioUrl = searchParams.get('dataInicio');
  const dataFimUrl = searchParams.get('dataFim');

  const filtroInicial = useMemo((): EstadoFiltroBancoHoras => {
    if (
      dataInicioUrl &&
      dataFimUrl &&
      /^\d{4}-\d{2}-\d{2}$/.test(dataInicioUrl) &&
      /^\d{4}-\d{2}-\d{2}$/.test(dataFimUrl)
    ) {
      return { modo: 'periodo', dataInicio: dataInicioUrl, dataFim: dataFimUrl };
    }
    const comp =
      compFromUrl && /^\d{4}-(0[1-9]|1[0-2])$/.test(compFromUrl)
        ? compFromUrl
        : competenciaCorrente();
    return { modo: 'mes', competencia: comp };
  }, [compFromUrl, dataInicioUrl, dataFimUrl]);

  const [filtro, setFiltro] = useState<EstadoFiltroBancoHoras>(filtroInicial);
  const consultaParams = useMemo(() => filtroBancoHorasParaParams(filtro), [filtro]);
  const consultaPorMes = filtro.modo === 'mes';
  const competenciaMes = consultaPorMes ? filtro.competencia : competenciaCorrente();
  const rotuloConsulta = useMemo(() => rotuloPeriodoBancoHoras(filtro), [filtro]);

  useEffect(() => {
    setFiltro(filtroInicial);
  }, [filtroInicial]);

  useEffect(() => {
    if (filtro.modo === 'mes') {
      setSearchParams({ competencia: filtro.competencia }, { replace: true });
    } else {
      setSearchParams(
        { dataInicio: filtro.dataInicio, dataFim: filtro.dataFim },
        { replace: true },
      );
    }
  }, [filtro, setSearchParams]);

  const [extrato, setExtrato] = useState<BancoHorasExtrato | null>(null);
  const [loading, setLoading] = useState(true);
  const [lancando, setLancando] = useState(false);
  const [desfazerFechamento, setDesfazerFechamento] = useState(false);
  const [palavraDesafioGerada, setPalavraDesafioGerada] = useState<string | null>(null);
  const [palavraDesafioDigitada, setPalavraDesafioDigitada] = useState('');
  const [carregandoDesafio, setCarregandoDesafio] = useState(false);
  const [salvandoDesfazer, setSalvandoDesfazer] = useState(false);
  const [lancamentoExcluir, setLancamentoExcluir] = useState<BancoHorasLancamento | null>(null);
  const [linhaAjustePonto, setLinhaAjustePonto] = useState<BancoHorasLancamento | null>(null);
  const [polPermitido, setPolPermitido] = useState(false);
  const [polLimiteMin, setPolLimiteMin] = useState('');
  const [salvandoPolitica, setSalvandoPolitica] = useState(false);

  const carregar = useCallback(async () => {
    if (!podeVerTodos || !Number.isFinite(usuarioId) || usuarioId < 1) return;
    setLoading(true);
    try {
      const e = await getBancoHorasUsuario(usuarioId, consultaParams);
      setExtrato(e);
      const p = e.politicaUsoExtras;
      if (p) {
        setPolPermitido(!!p.permitido);
        setPolLimiteMin(p.limiteMinutos != null && p.limiteMinutos > 0 ? String(p.limiteMinutos) : '');
      } else {
        setPolPermitido(false);
        setPolLimiteMin('');
      }
    } catch (err) {
      toast.error(formatApiError(err));
      setExtrato(null);
    } finally {
      setLoading(false);
    }
  }, [podeVerTodos, usuarioId, consultaParams]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function handleFechar() {
    try {
      await fecharBancoHoras(usuarioId, competenciaMes);
      toast.success('Competência fechada.');
      void carregar();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }

  async function iniciarDesfazerFechamento() {
    setDesfazerFechamento(true);
    setPalavraDesafioGerada(null);
    setPalavraDesafioDigitada('');
    setCarregandoDesafio(true);
    try {
      const { palavraDesafio } = await solicitarDesafioReabrirFechamento(usuarioId, competenciaMes);
      setPalavraDesafioGerada(palavraDesafio);
    } catch (err) {
      toast.error(formatApiError(err));
      setDesfazerFechamento(false);
    } finally {
      setCarregandoDesafio(false);
    }
  }

  async function gerarNovaPalavraDesafio() {
    setCarregandoDesafio(true);
    setPalavraDesafioDigitada('');
    try {
      const { palavraDesafio } = await solicitarDesafioReabrirFechamento(usuarioId, competenciaMes);
      setPalavraDesafioGerada(palavraDesafio);
      toast.success('Nova palavra gerada.');
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setCarregandoDesafio(false);
    }
  }

  const colunasLancamentosTabela = useMemo(() => {
    const competenciaFechada = consultaPorMes && !!extrato?.fechamento;
    const extra = {
      competenciaFechada,
      podeAjustarPonto,
      onAjustarBatidasDia: (l: BancoHorasLancamento) => setLinhaAjustePonto(l),
    };
    if (!podeFechar) {
      if (!podeAjustarPonto || competenciaFechada) return COLUNAS_LANCAMENTOS_BANCO_HORAS;
      return colunasLancamentosBancoHorasComAcoes(() => {}, extra);
    }
    return colunasLancamentosBancoHorasComAcoes((l) => setLancamentoExcluir(l), extra);
  }, [podeFechar, podeAjustarPonto, extrato?.fechamento, consultaPorMes]);
  const lancamentosAgrupados = useMemo(
    () => agruparLancamentosMesmoDia(extrato?.lancamentos ?? []),
    [extrato?.lancamentos],
  );

  async function handleDesfazerFechamento() {
    if (!palavraDesafioDigitada.trim()) {
      toast.error('Digite a palavra exibida acima.');
      return;
    }
    setSalvandoDesfazer(true);
    try {
      await reabrirFechamentoBancoHoras(usuarioId, palavraDesafioDigitada.trim(), competenciaMes);
      toast.success('Fechamento removido. A competência voltou a ficar em aberto.');
      setDesfazerFechamento(false);
      setPalavraDesafioGerada(null);
      setPalavraDesafioDigitada('');
      void carregar();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvandoDesfazer(false);
    }
  }

  if (!Number.isFinite(usuarioId) || usuarioId < 1 || param?.trim() === '') {
    return <Navigate to="/rh?aba=banco" replace />;
  }

  if (!podeVerTodos) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
        <Card title="Banco de horas">
          <p className="text-white/65 text-sm leading-relaxed">
            Você não tem permissão para visualizar o extrato de outros colaboradores.
          </p>
        </Card>
      </div>
    );
  }

  const nomeTitulo = nomeState ?? `Colaborador #${usuarioId}`;
  const fechado = !!extrato?.fechamento;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/rh?aba=banco')}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/15 bg-white/5 text-sm text-white/85 hover:bg-white/10 transition-colors"
        >
          ← Voltar ao RH
        </button>
      </div>

      <header className="border-b border-white/10 pb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Banco de horas — {nomeTitulo}</h1>
          <p className="text-sm text-white/55 mt-1">
            {extrato?.periodo ? (
              <>Período {rotuloConsulta}</>
            ) : (
              <>Competência {extrato?.competencia ?? rotuloConsulta}</>
            )}
            {fechado && consultaPorMes ? (
              <span className="text-white/45">
                {' '}
                · Fechado {extrato?.fechamento ? formatData(extrato.fechamento.fechadoEm) : ''}
              </span>
            ) : null}
          </p>
        </div>
        <BancoHorasFiltroConsulta filtro={filtro} onChange={setFiltro} />
      </header>

      {loading ? (
        <p className="text-white/60">Carregando...</p>
      ) : !extrato ? (
        <p className="text-white/60">Sem dados.</p>
      ) : extrato.participaControlePonto === false ? (
        <Card title="Sem banco de horas para este colaborador">
          <p className="text-sm text-amber-100/90 leading-relaxed">
            Este colaborador <strong className="text-amber-200">não está no banco de horas</strong> ainda (padrão até a
            primeira batida) ou está dispensado pelo RH.
          </p>
          <p className="text-sm text-white/65 leading-relaxed mt-3">
            O controle liga automaticamente na primeira batida no app. Para ativar manualmente ou dispensar após
            histórico, use <strong className="text-white/85">RH → aba Jornada</strong> e a opção{' '}
            <strong className="text-white/85">Exige registro de ponto e banco de horas</strong>.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <KpiBox
              label={extrato.periodo || !consultaPorMes ? 'Saldo do período' : 'Saldo do mês'}
              valor={formatHoras(extrato.saldoMesMin)}
              valorClass={extrato.saldoMesMin < 0 ? 'text-red-300' : 'text-green-300'}
            />
            <KpiBox
              label="Saldo acumulado"
              valor={formatHoras(extrato.saldoAcumuladoMin)}
              valorClass={extrato.saldoAcumuladoMin < 0 ? 'text-red-300' : 'text-green-300'}
            />
            <KpiBox
              label="Fechamento"
              valor={
                extrato.periodo
                  ? 'Por período'
                  : extrato.fechamento
                    ? `Fechado ${formatData(extrato.fechamento.fechadoEm)}`
                    : 'Em aberto'
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ImprimirMinhaFolhaPontoButton
              filtro={filtro}
              usuarioId={usuarioId}
              nome={nomeTitulo}
              usuarioIdAtual={user?.id}
            />
            {consultaPorMes && podeExportarBatidas ? (
              <button
                type="button"
                onClick={() => setExportarBatidasOpen(true)}
                className={btn.primarySoft}
              >
                Exportar batidas do mês
              </button>
            ) : null}
          </div>

          {podeFechar && consultaPorMes ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleFechar()}
                disabled={fechado}
                className="px-4 py-2 rounded-md border border-white/15 bg-white/10 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Fechar mês
              </button>
              <button
                type="button"
                onClick={() => setLancando(true)}
                disabled={fechado}
                className="px-4 py-2 rounded-md border border-amber-400/30 bg-amber-500/15 text-sm font-medium text-amber-100 hover:bg-amber-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Lançar ajuste
              </button>
              {fechado ? (
                <button
                  type="button"
                  onClick={() => void iniciarDesfazerFechamento()}
                  className="px-4 py-2 rounded-md border border-red-400/35 bg-red-500/15 text-sm font-medium text-red-100 hover:bg-red-500/25 transition-colors"
                >
                  Desfazer fechamento…
                </button>
              ) : null}
            </div>
          ) : podeFechar && !consultaPorMes ? (
            <p className="text-sm text-white/50">
              Fechamento e lançamento manual usam competência mensal. Altere o filtro para &quot;Por mês&quot;.
            </p>
          ) : (
            <p className="text-sm text-white/50">
              Apenas quem tem permissão de fechamento pode fechar o mês ou lançar ajustes manuais.
            </p>
          )}

          {podeFechar ? (
            <Card title="Política — uso de horas extras (solicitações do colaborador)">
              <p className="text-xs text-white/55 mb-3 leading-relaxed">
                Defina se este colaborador pode abrir solicitações para usar (débitar) horas extras do banco e o teto
                total em minutos (solicitações pendentes + aprovadas contam no limite). A aprovação exige saldo
                acumulado suficiente até a competência da solicitação.
              </p>
              <div className="flex flex-wrap items-center gap-4 mb-3">
                <label className="flex items-center gap-2 text-sm text-white/85 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={polPermitido}
                    onChange={(e) => setPolPermitido(e.target.checked)}
                    className="rounded border-white/30"
                  />
                  Permitir solicitações
                </label>
              </div>
              {polPermitido ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                  <Field label="Limite total (minutos)">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={polLimiteMin}
                      onChange={(e) => setPolLimiteMin(e.target.value)}
                      placeholder="Ex.: 240"
                      className="w-full h-9 rounded-md border border-white/15 bg-black/30 px-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </Field>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={salvandoPolitica}
                      onClick={() => {
                        const lim = Number.parseInt(polLimiteMin.trim(), 10);
                        if (polPermitido && (!Number.isFinite(lim) || lim < 1)) {
                          toast.error('Com permissão ativa, informe o limite em minutos (inteiro ≥ 1).');
                          return;
                        }
                        setSalvandoPolitica(true);
                        void (async () => {
                          try {
                            const atualizado = await patchPoliticaUsoExtrasBancoHoras(usuarioId, {
                              permitido: polPermitido,
                              limiteMinutos: polPermitido ? lim : undefined,
                            });
                            setExtrato(atualizado);
                            const p = atualizado.politicaUsoExtras;
                            if (p) {
                              setPolPermitido(!!p.permitido);
                              setPolLimiteMin(p.limiteMinutos != null && p.limiteMinutos > 0 ? String(p.limiteMinutos) : '');
                            }
                            toast.success('Política atualizada.');
                          } catch (err) {
                            toast.error(formatApiError(err));
                          } finally {
                            setSalvandoPolitica(false);
                          }
                        })();
                      }}
                      className="px-4 py-2 rounded-md bg-primary text-neutral text-sm font-semibold hover:opacity-95 disabled:opacity-50"
                    >
                      {salvandoPolitica ? 'Salvando…' : 'Salvar política'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={salvandoPolitica}
                  onClick={() => {
                    setSalvandoPolitica(true);
                    void (async () => {
                      try {
                        const atualizado = await patchPoliticaUsoExtrasBancoHoras(usuarioId, { permitido: false });
                        setExtrato(atualizado);
                        setPolPermitido(false);
                        setPolLimiteMin('');
                        toast.success('Política atualizada (solicitações desabilitadas).');
                      } catch (err) {
                        toast.error(formatApiError(err));
                      } finally {
                        setSalvandoPolitica(false);
                      }
                    })();
                  }}
                  className="px-4 py-2 rounded-md bg-white/10 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-50"
                >
                  {salvandoPolitica ? 'Salvando…' : 'Salvar (desabilitar solicitações)'}
                </button>
              )}
              {extrato?.politicaUsoExtras ? (
                <p className="text-xs text-white/45 mt-3">
                  Comprometido agora: {formatHoras(extrato.politicaUsoExtras.comprometidoMinutos)}
                  {extrato.politicaUsoExtras.disponivelMinutos != null
                    ? ` · Disponível: ${formatHoras(extrato.politicaUsoExtras.disponivelMinutos)}`
                    : ''}
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card title="Lançamentos">
            {!fechado ? (
              <p className="text-xs text-white/50 mb-3 leading-relaxed">
                Mês em aberto: aparecem todas as <strong className="text-white/70">batidas</strong> registradas, linhas
                de <strong className="text-white/70">saldo do dia</strong> do espelho (crédito verde / débito vermelho) e
                ajustes manuais. Ao <strong className="text-white/70">fechar o mês</strong>, essas linhas viram
                lançamentos definitivos de ponto.
              </p>
            ) : null}
            <DataTable
              columns={colunasLancamentosTabela}
              data={lancamentosAgrupados}
              keyExtractor={(l) => l.id}
              emptyMessage="Sem lançamentos no mês."
              renderMobileCard={(l) => (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-1">
                  <p className="text-white/90 font-medium">{formatData(l.data)}</p>
                  <p className="text-xs text-white/60">{rotuloOrigemBancoHoras(l.origem)}</p>
                  <p className="text-xs">
                    <span className="text-green-300">
                      Créd.: {l.minutosCredito ? formatHoras(l.minutosCredito) : '—'}
                    </span>
                    {' · '}
                    <span className="text-red-300">
                      Déb.: {l.minutosDebito ? formatHoras(l.minutosDebito) : '—'}
                    </span>
                  </p>
                  <p className="text-white/55 text-xs line-clamp-2">{l.descricao ?? '—'}</p>
                  {podeAjustarPonto && !fechado ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLinhaAjustePonto(l);
                      }}
                      className="text-primary hover:text-primary/90 text-sm font-medium pt-1 text-left"
                    >
                      Ajustar batidas
                    </button>
                  ) : null}
                  {podeFechar && bancoHorasLancamentoExclusivel(l) ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLancamentoExcluir(l);
                      }}
                      className="text-red-300 hover:text-red-200 text-sm font-medium pt-1"
                    >
                      Excluir lançamento
                    </button>
                  ) : null}
                </div>
              )}
            />
          </Card>
        </div>
      )}

      {lancando && consultaPorMes ? (
        <LancarManualModal
          competencia={competenciaMes}
          usuarioId={usuarioId}
          nome={nomeTitulo}
          jornadaAlmoco={extrato?.jornadaAlmoco}
          onClose={() => setLancando(false)}
          onSaved={() => {
            setLancando(false);
            void carregar();
          }}
        />
      ) : null}

      {desfazerFechamento ? (
        <Modal
          title="Desfazer fechamento do mês"
          onClose={() => {
            setDesfazerFechamento(false);
            setPalavraDesafioGerada(null);
            setPalavraDesafioDigitada('');
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setDesfazerFechamento(false);
                  setPalavraDesafioGerada(null);
                  setPalavraDesafioDigitada('');
                }}
                className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDesfazerFechamento()}
                disabled={salvandoDesfazer || carregandoDesafio || !palavraDesafioGerada}
                className="px-3 py-2 rounded bg-red-600 text-white font-semibold text-sm hover:bg-red-500 disabled:opacity-50"
              >
                {salvandoDesfazer ? 'Removendo…' : 'Confirmar exclusão'}
              </button>
            </>
          }
        >
          <p className="text-sm text-white/70 leading-relaxed mb-3">
            Esta ação apaga o registro de fechamento e remove os lançamentos automáticos do espelho (origem PONTO/FECHAMENTO)
            desta competência. Ajustes manuais (AJUSTE) permanecem. É irreversível após confirmar.
          </p>
          {carregandoDesafio && !palavraDesafioGerada ? (
            <p className="text-sm text-white/55">Gerando palavra de confirmação…</p>
          ) : palavraDesafioGerada ? (
            <>
              <p className="text-xs text-white/55 mb-1">Digite exatamente esta palavra (válida por cerca de 10 minutos):</p>
              <p className="mb-3 px-3 py-2 rounded-md bg-black/40 border border-white/15 font-mono text-lg tracking-wide text-primary break-all select-all">
                {palavraDesafioGerada}
              </p>
              <button
                type="button"
                onClick={() => void gerarNovaPalavraDesafio()}
                disabled={carregandoDesafio}
                className="mb-4 text-xs text-primary hover:underline disabled:opacity-50"
              >
                Gerar outra palavra
              </button>
              <Field label="Confirmação (copie ou digite a palavra acima)">
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={palavraDesafioDigitada}
                  onChange={(e) => setPalavraDesafioDigitada(e.target.value)}
                  className="w-full h-9 rounded-md border border-white/15 bg-black/30 px-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Palavra exibida"
                />
              </Field>
            </>
          ) : (
            <p className="text-sm text-white/55">Não foi possível obter a palavra. Feche e tente de novo.</p>
          )}
        </Modal>
      ) : null}

      <ModalConfirmarExcluirLancamentoBancoHoras
        lancamento={lancamentoExcluir}
        usuarioIdAlvo={usuarioId}
        onClose={() => setLancamentoExcluir(null)}
        onExcluido={() => void carregar()}
      />

      {linhaAjustePonto ? (
        <ModalAjustePontoParDia
          competencia={linhaAjustePonto.competencia}
          usuarioId={usuarioId}
          nomeColaborador={nomeTitulo}
          jornadaAlmoco={extrato?.jornadaAlmoco}
          linha={linhaAjustePonto}
          onClose={() => setLinhaAjustePonto(null)}
          onSaved={() => {
            setLinhaAjustePonto(null);
            void carregar();
          }}
        />
      ) : null}

      <ExportarBatidasMesModal
        open={exportarBatidasOpen}
        onClose={() => setExportarBatidasOpen(false)}
        competencia={competenciaMes}
        usuarioIdFixo={usuarioId}
        colaboradores={[{ usuarioId, nome: nomeTitulo }]}
      />
    </div>
  );
}
