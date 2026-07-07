import { useCallback, useEffect, useState } from 'react';
import {
  atualizarEmpregador,
  criarEmpregador,
  obterEmpregadorPrincipal,
  type Empregador,
} from '../../services/rh';
import { useAuthStore } from '../../store/auth';
import { userHasAnyPermission } from '../../utils/projectAccess';
import { toast, formatApiError } from '../../utils/toast';
import { Card, Field } from './rhUi';
import {
  GeocercaPicker,
  geocercaInicialDe,
  montarPayloadGeocerca,
  type GeocercaValor,
} from './GeocercaPicker';

const TIPO_IDENTIFICADOR_LABEL: Record<number, string> = {
  1: 'CNPJ',
  2: 'CPF',
  3: 'CAEPF',
  4: 'CNO',
};

/**
 * Tela do RH para definir o LOCAL DE TRABALHO usado pela geocerca da
 * batida de ponto. Vale para todos os colaboradores: o sistema verifica
 * o GPS na batida e bloqueia se a distância for maior que o raio.
 *
 * Override por colaborador é configurado em cada Jornada (TabJornada).
 */
export function TabGeocerca() {
  const user = useAuthStore((s) => s.user);
  // Espelha o backend RolesGuard: sistema:administrar passa por qualquer rota.
  const podeGerenciar = userHasAnyPermission(
    user,
    'rh:gerenciar_empregador',
    'sistema:administrar',
  );

  const [empregador, setEmpregador] = useState<Empregador | null>(null);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Identificação do empregador (necessário para criar do zero, opcional para editar).
  const [razaoSocial, setRazaoSocial] = useState('');
  const [identificador, setIdentificador] = useState('');
  const [tipoIdentificador, setTipoIdentificador] = useState<number>(1);
  const [endereco, setEndereco] = useState('');

  const [geocerca, setGeocerca] = useState<GeocercaValor>(() =>
    geocercaInicialDe({ latitudeReferencia: null, longitudeReferencia: null, raioMetros: null }),
  );

  const carregar = useCallback(async () => {
    if (!podeGerenciar) return;
    setLoading(true);
    try {
      const e = await obterEmpregadorPrincipal();
      setEmpregador(e);
      if (e) {
        setRazaoSocial(e.razaoSocial);
        setIdentificador(e.identificador);
        setTipoIdentificador(e.tipoIdentificador);
        setEndereco(e.endereco ?? '');
        setGeocerca(
          geocercaInicialDe({
            latitudeReferencia: e.latitudeReferencia,
            longitudeReferencia: e.longitudeReferencia,
            raioMetros: e.raioMetros,
          }),
        );
      } else {
        setRazaoSocial('');
        setIdentificador('');
        setTipoIdentificador(1);
        setEndereco('');
        setGeocerca(
          geocercaInicialDe({ latitudeReferencia: null, longitudeReferencia: null, raioMetros: null }),
        );
      }
    } catch (err) {
      toast.error(`Falha ao carregar empregador. ${formatApiError(err)}`);
    } finally {
      setLoading(false);
    }
  }, [podeGerenciar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar() {
    const result = montarPayloadGeocerca(geocerca);
    if (!result.ok) {
      toast.error(result.motivo);
      return;
    }
    setSalvando(true);
    try {
      if (empregador) {
        await atualizarEmpregador(empregador.id, {
          ...result.payload,
          endereco: endereco.trim() || null,
        });
        toast.success('Local de batida atualizado.');
      } else {
        if (!razaoSocial.trim() || !identificador.trim()) {
          toast.error('Preencha a razão social e o CNPJ/CPF da empresa.');
          setSalvando(false);
          return;
        }
        await criarEmpregador({
          tipoIdentificador,
          identificador: identificador.replace(/\D/g, ''),
          razaoSocial: razaoSocial.trim(),
          endereco: endereco.trim() || null,
          principal: true,
          ...result.payload,
        });
        toast.success('Empregador cadastrado e local definido.');
      }
      await carregar();
    } catch (err) {
      toast.error(`Falha ao salvar local. ${formatApiError(err)}`);
    } finally {
      setSalvando(false);
    }
  }

  if (!podeGerenciar) {
    return (
      <Card title="Local da unidade">
        <p className="text-sm text-white/65 leading-relaxed">
          Você não tem permissão para configurar o local de batida. Fale com o RH.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="Como funciona">
        <p className="text-sm text-white/70 leading-relaxed">
          Defina aqui o <strong>local físico onde os colaboradores devem bater o ponto</strong>.
          O sistema usa o GPS do dispositivo na hora da batida (web ou app mobile) e bloqueia
          o registro quando a distância for maior que o raio configurado. Vale para todos os
          colaboradores que <em>não</em> tiverem um local específico configurado em sua jornada.
        </p>
        <ul className="text-xs text-white/55 list-disc list-inside mt-2 space-y-1">
          <li>Para <strong>desativar</strong>, desmarque "Geocerca ativa" e salve — qualquer GPS passa.</li>
          <li>
            Para definir um <strong>local diferente para um colaborador específico</strong> (externo,
            home-office, outra filial), use a aba <strong>Jornada</strong> e edite a jornada dele.
          </li>
          <li>Raio recomendado: 50 a 200 m (urbano). Em canteiros maiores, até 1 km.</li>
        </ul>
      </Card>

      {!empregador ? (
        <Card title="Empregador (cadastro inicial)">
          <p className="text-xs text-amber-200/85 mb-3">
            Não há empregador principal cadastrado. Para ativar a geocerca, preencha
            estes dados (eles também aparecem no comprovante REP-P e no AFD).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Tipo de identificador">
              <select
                value={tipoIdentificador}
                onChange={(e) => setTipoIdentificador(Number(e.target.value))}
                className="w-full bg-neutral border border-white/15 rounded px-2 py-1.5 text-sm"
              >
                <option value={1}>CNPJ</option>
                <option value={2}>CPF</option>
                <option value={3}>CAEPF</option>
                <option value={4}>CNO</option>
              </select>
            </Field>
            <Field label="CNPJ / CPF / CAEPF / CNO (apenas números)">
              <input
                type="text"
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                placeholder="00.000.000/0000-00"
                className="w-full bg-neutral border border-white/15 rounded px-2 py-1.5 text-sm"
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Razão social">
                <input
                  type="text"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  placeholder="Empresa LTDA"
                  className="w-full bg-neutral border border-white/15 rounded px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
          </div>
        </Card>
      ) : (
        <Card title={`Empregador principal — ${empregador.razaoSocial}`}>
          <p className="text-xs text-white/55">
            {TIPO_IDENTIFICADOR_LABEL[empregador.tipoIdentificador] ?? 'ID'}: {empregador.identificador}
            {empregador.cei ? ` · CEI ${empregador.cei}` : ''}
          </p>
          <div className="mt-3">
            <Field label="Endereço (texto livre, exibido no comprovante)">
              <input
                type="text"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                placeholder="Rua, número, bairro, cidade/UF"
                className="w-full bg-neutral border border-white/15 rounded px-2 py-1.5 text-sm"
              />
            </Field>
          </div>
        </Card>
      )}

      <Card title="Local de batida (geocerca)">
        <GeocercaPicker
          value={geocerca}
          onChange={setGeocerca}
          toggleLabel="Geocerca ativa — bloquear batida fora do raio do ponto definido"
        />

        <div className="flex justify-end pt-4 border-t border-white/10 mt-4">
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={salvando || loading}
            className="px-4 py-2 rounded-md bg-primary text-neutral text-sm font-semibold hover:opacity-95 disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Salvar local'}
          </button>
        </div>
      </Card>
    </div>
  );
}
