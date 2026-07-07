import React, { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import {
  TermoColaboradorPDF,
  type ColaboradorTermoData,
} from '../pdf/TermoColaboradorPDF';
import {
  RESUMO_ANEXOS_TERMO,
  RESUMO_CLAUSULAS_TERMO,
} from '../pdf/termoColaboradorConteudo';
import { btn } from '../../../utils/buttonStyles';
import { api } from '../../../services/api';
import { downloadPdfBlob } from '../../../utils/downloadPdfBlob';
import { labelTipoVinculo, TIPOS_VINCULO } from '../../../constants/documentosLabels';
import axios from 'axios';
import type { DocumentoSalvoInfo } from '../../../types/documentoSalvo';

interface Props {
  onClose: () => void;
  onSalvo: (doc?: DocumentoSalvoInfo) => void;
  /** Função de upload customizada. Quando ausente usa /documentos/upload com JWT. */
  uploadFn?: (fd: FormData) => Promise<void>;
  /** Pré-preenche campos a partir do perfil do colaborador */
  initialData?: Partial<ColaboradorTermoData>;
  /** Vincula o PDF assinado ao usuário no ERP */
  usuarioId?: number;
}

const defaultData: ColaboradorTermoData = {
  nome: '',
  tipoVinculo: 'funcionario',
  ies: '',
  estadoCivil: '',
  cpf: '',
  rg: '',
  orgaoExpedidor: '',
  cidade: '',
  estado: '',
};

const STEPS = ['Dados', 'Resumo', 'Assinatura'];

const inputCls =
  'w-full rounded-md border border-white/25 bg-neutral/90 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/60';
const labelCls = 'block text-xs font-medium text-white/70 mb-1';

function formatCPF(v: string) {
  return v
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
    .slice(0, 14);
}

function dataAtual() {
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const d = new Date();
  return `São Luís, ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}.`;
}

function mensagemErroUpload(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Erro ao salvar o documento. Tente novamente.';
}

export const TermoColaboradorWizard: React.FC<Props> = ({
  onClose,
  onSalvo,
  uploadFn,
  initialData,
  usuarioId,
}) => {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ColaboradorTermoData>({ ...defaultData, ...initialData });
  const [pdfAssinado, setPdfAssinado] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof ColaboradorTermoData, string>>>({});
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saveError, setSaveError] = useState('');

  const nomeArquivoBase = () =>
    `Termo-Confidencialidade-${form.nome.replace(/\s+/g, '-') || 'documento'}`;

  const baixarPdfParaAssinar = async () => {
    setDownloading(true);
    setSaveError('');
    try {
      const blob = await pdf(
        <TermoColaboradorPDF colaborador={form} assinatura={null} dataAtual={dataAtual()} />,
      ).toBlob();
      downloadPdfBlob(blob, `${nomeArquivoBase()}-para-assinar.pdf`);
    } catch {
      setSaveError('Não foi possível gerar o PDF para download. Tente novamente.');
    } finally {
      setDownloading(false);
    }
  };

  const set = (field: keyof ColaboradorTermoData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    set(name as keyof ColaboradorTermoData, name === 'cpf' ? formatCPF(value) : value);
  };

  const iesObrigatoria = form.tipoVinculo === 'estagiario' || form.tipoVinculo === 'pesquisador';

  const validateStep0 = () => {
    const e: Partial<Record<keyof ColaboradorTermoData, string>> = {};
    if (!form.nome.trim()) e.nome = 'Obrigatório';
    if (iesObrigatoria && !form.ies.trim()) e.ies = 'Obrigatório';
    if (!form.estadoCivil) e.estadoCivil = 'Obrigatório';
    if (!form.cpf.trim()) e.cpf = 'Obrigatório';
    if (!form.cidade.trim()) e.cidade = 'Obrigatório';
    if (!form.estado.trim()) e.estado = 'Obrigatório';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (step === 0 && !validateStep0()) return;
    setStep((s) => s + 1);
  };
  const back = () => setStep((s) => s - 1);

  const handleSalvar = async () => {
    if (!pdfAssinado) {
      setSaveError('Faça upload do PDF assinado digitalmente antes de continuar.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const fd = new FormData();
      fd.append('file', pdfAssinado);
      fd.append('tipo', 'estagiario');
      fd.append(
        'nomeExibicao',
        `Termo Confidencialidade (${labelTipoVinculo(form.tipoVinculo)}) – ${form.nome}`,
      );
      fd.append('cpfEsperado', form.cpf.replace(/\D/g, ''));
      if (usuarioId) fd.append('usuarioId', String(usuarioId));

      if (uploadFn) {
        await uploadFn(fd);
        onSalvo();
      } else {
        const { data } = await api.post<{ id: number; nomeExibicao: string; tipo: string }>(
          '/documentos/upload',
          fd,
        );
        onSalvo({ id: data.id, nomeExibicao: data.nomeExibicao, tipo: data.tipo });
      }
    } catch (err: unknown) {
      setSaveError(mensagemErroUpload(err));
    } finally {
      setSaving(false);
    }
  };

  const renderResumoPartes = (partes: typeof RESUMO_CLAUSULAS_TERMO) => (
    <ul className="space-y-2">
      {partes.map((p) => (
        <li key={p.titulo} className="rounded border border-white/5 bg-black/20 px-2.5 py-2">
          <p className="font-medium text-white/90">{p.titulo}</p>
          <p className="mt-0.5 text-white/60 leading-relaxed">{p.resumo}</p>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${i === step ? 'bg-primary text-white' : i < step ? 'bg-primary/30 text-primary' : 'bg-white/5 text-white/40'}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${i < step ? 'bg-primary/60' : 'bg-white/10'}`}>{i < step ? '✓' : i + 1}</span>
              {s}
            </div>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-white/10" />}
          </React.Fragment>
        ))}
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Dados do colaborador</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Tipo de vínculo *</label>
              <select
                name="tipoVinculo"
                className={inputCls}
                value={form.tipoVinculo}
                onChange={handleChange}
              >
                {TIPOS_VINCULO.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls}>Nome *</label>
              <input name="nome" className={`${inputCls} ${errors.nome ? 'border-red-400' : ''}`} value={form.nome} onChange={handleChange} />
              {errors.nome && <p className="mt-0.5 text-xs text-red-400">{errors.nome}</p>}
            </div>
            <div>
              <label className={labelCls}>
                {form.tipoVinculo === 'funcionario'
                  ? 'Instituição / vínculo (opcional)'
                  : form.tipoVinculo === 'pesquisador'
                    ? 'Instituição de pesquisa *'
                    : 'IES (instituição de ensino) *'}
              </label>
              <input
                name="ies"
                className={`${inputCls} ${errors.ies ? 'border-red-400' : ''}`}
                value={form.ies}
                onChange={handleChange}
                placeholder={
                  form.tipoVinculo === 'funcionario'
                    ? 'Preencha se aplicável'
                    : 'Nome da instituição'
                }
              />
              {errors.ies && <p className="mt-0.5 text-xs text-red-400">{errors.ies}</p>}
            </div>
            <div>
              <label className={labelCls}>Estado Civil *</label>
              <select name="estadoCivil" className={`${inputCls} ${errors.estadoCivil ? 'border-red-400' : ''}`} value={form.estadoCivil} onChange={handleChange}>
                <option value="">Selecione</option>
                <option>casado(a)</option>
                <option>solteiro(a)</option>
                <option>divorciado(a)</option>
                <option>viúvo(a)</option>
              </select>
              {errors.estadoCivil && <p className="mt-0.5 text-xs text-red-400">{errors.estadoCivil}</p>}
            </div>
            <div>
              <label className={labelCls}>CPF *</label>
              <input name="cpf" className={`${inputCls} ${errors.cpf ? 'border-red-400' : ''}`} value={form.cpf} onChange={handleChange} placeholder="000.000.000-00" />
              {errors.cpf && <p className="mt-0.5 text-xs text-red-400">{errors.cpf}</p>}
            </div>
            <div>
              <label className={labelCls}>RG</label>
              <input name="rg" className={inputCls} value={form.rg} onChange={handleChange} />
            </div>
            <div>
              <label className={labelCls}>Órgão Expedidor</label>
              <input name="orgaoExpedidor" className={inputCls} value={form.orgaoExpedidor} onChange={handleChange} />
            </div>
            <div>
              <label className={labelCls}>Cidade *</label>
              <input name="cidade" className={`${inputCls} ${errors.cidade ? 'border-red-400' : ''}`} value={form.cidade} onChange={handleChange} />
              {errors.cidade && <p className="mt-0.5 text-xs text-red-400">{errors.cidade}</p>}
            </div>
            <div>
              <label className={labelCls}>Estado *</label>
              <input name="estado" className={`${inputCls} ${errors.estado ? 'border-red-400' : ''}`} value={form.estado} onChange={handleChange} placeholder="MA" maxLength={2} />
              {errors.estado && <p className="mt-0.5 text-xs text-red-400">{errors.estado}</p>}
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Resumo do documento</h3>
          <p className="text-xs text-white/55">
            Revise os dados e o conteúdo que será gerado no PDF antes de assinar.
          </p>
          <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/80">
            <p className="font-medium text-white/90">Termo de Confidencialidade e Sigilo</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              <p><span className="text-white/55">Colaborador:</span> {form.nome || '—'}</p>
              <p><span className="text-white/55">CPF:</span> {form.cpf || '—'}</p>
              <p><span className="text-white/55">Vínculo:</span> {labelTipoVinculo(form.tipoVinculo)}</p>
              {form.ies.trim() && (
                <p><span className="text-white/55">Instituição:</span> {form.ies}</p>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border border-white/10 bg-white/5 p-3 text-xs space-y-4">
            <div>
              <p className="mb-2 font-semibold text-white/80">Corpo do termo — 19 cláusulas</p>
              {renderResumoPartes(RESUMO_CLAUSULAS_TERMO)}
            </div>
            <div>
              <p className="mb-2 font-semibold text-white/80">Anexos — 1 página cada</p>
              {renderResumoPartes(RESUMO_ANEXOS_TERMO)}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Assinatura Digital</h3>
          <p className="text-xs text-white/60">
            1. Baixe o PDF abaixo · 2. Assine digitalmente (Gov.br, e-CPF, etc.) · 3. Envie o arquivo assinado
          </p>
          <button
            type="button"
            className={`${btn.primarySm} self-start`}
            onClick={baixarPdfParaAssinar}
            disabled={downloading}
          >
            {downloading ? 'Gerando PDF...' : '⬇ Baixar PDF para assinar'}
          </button>
          <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
            <p className="text-xs text-white/60">Upload do PDF assinado:</p>
            <input
              type="file"
              accept="application/pdf"
              className="text-sm text-white/70 file:mr-3 file:rounded file:border-0 file:bg-primary/20 file:px-3 file:py-1 file:text-xs file:text-primary"
              onChange={(e) => setPdfAssinado(e.target.files?.[0] ?? null)}
            />
            {pdfAssinado && <p className="text-xs text-green-400">✓ {pdfAssinado.name}</p>}
          </div>
          {saveError && <p className="text-xs text-red-400">{saveError}</p>}
        </div>
      )}

      <div className="flex justify-between border-t border-white/10 pt-2">
        <button className={btn.secondaryLg} onClick={step === 0 ? onClose : back}>
          {step === 0 ? 'Cancelar' : '← Anterior'}
        </button>
        {step < STEPS.length - 1 ? (
          <button className={btn.primaryLg} onClick={next}>Próximo →</button>
        ) : (
          <button
            className={btn.primaryLg}
            onClick={handleSalvar}
            disabled={saving || !pdfAssinado}
          >
            {saving ? 'Salvando...' : 'Enviar documento assinado'}
          </button>
        )}
      </div>
    </div>
  );
};
