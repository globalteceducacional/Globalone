import React, { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import axios from 'axios';
import { TermoFornecedorPDF, type EmpresaData } from '../pdf/TermoFornecedorPDF';
import { btn } from '../../../utils/buttonStyles';
import { api } from '../../../services/api';
import { downloadPdfBlob } from '../../../utils/downloadPdfBlob';
import type { DocumentoSalvoInfo } from '../../../types/documentoSalvo';

function mensagemErroUpload(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Erro ao salvar o documento. Tente novamente.';
}

interface Props {
  onClose: () => void;
  onSalvo: (doc?: DocumentoSalvoInfo) => void;
  /** Função de upload customizada. Quando ausente usa /documentos/upload com JWT. */
  uploadFn?: (fd: FormData) => Promise<void>;
}

const defaultData: EmpresaData = {
  razaoSocial: '',
  tipoEmpresa: '',
  cidade: '',
  estado: '',
  rua: '',
  numero: '',
  cep: '',
  bairro: '',
  cnpj: '',
  nomeRepresentante: '',
  identidade: '',
  orgaoExpedidor: '',
  cpf: '',
  denominacao: '',
};

const STEPS = ['Empresa', 'Cláus. 1', 'Cláus. 2', 'Cláus. 3', 'Cláus. 4-6', 'Assinatura'];

const inputCls =
  'w-full rounded-md border border-white/25 bg-neutral/90 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/60';
const labelCls = 'block text-xs font-medium text-white/70 mb-1';

function formatCNPJ(v: string) {
  return v
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5')
    .slice(0, 18);
}

function formatCEP(v: string) {
  return v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 9);
}

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

export const TermoFornecedorWizard: React.FC<Props> = ({ onClose, onSalvo, uploadFn }) => {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<EmpresaData>(defaultData);
  const [pdfAssinado, setPdfAssinado] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof EmpresaData, string>>>({});
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saveError, setSaveError] = useState('');

  const nomeArquivoBase = () =>
    `Termo-Fornecedor-${form.razaoSocial.replace(/\s+/g, '-') || 'documento'}`;

  const baixarPdfParaAssinar = async () => {
    setDownloading(true);
    setSaveError('');
    try {
      const blob = await pdf(
        <TermoFornecedorPDF empresa={form} assinatura={null} dataAtual={dataAtual()} />,
      ).toBlob();
      downloadPdfBlob(blob, `${nomeArquivoBase()}-para-assinar.pdf`);
    } catch {
      setSaveError('Não foi possível gerar o PDF para download. Tente novamente.');
    } finally {
      setDownloading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let v = value;
    if (name === 'cnpj') v = formatCNPJ(value);
    if (name === 'cep') v = formatCEP(value);
    if (name === 'cpf') v = formatCPF(value);
    setForm((prev) => ({ ...prev, [name]: v }));
  };

  const validateStep0 = () => {
    const e: Partial<Record<keyof EmpresaData, string>> = {};
    const obrigatorios: (keyof EmpresaData)[] = [
      'razaoSocial', 'tipoEmpresa', 'cnpj', 'cep', 'cidade', 'estado',
      'rua', 'numero', 'bairro', 'nomeRepresentante', 'identidade', 'orgaoExpedidor', 'cpf',
    ];
    obrigatorios.forEach((k) => {
      if (!form[k].trim()) e[k] = 'Obrigatório';
    });
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
      fd.append('tipo', 'fornecedor');
      fd.append('nomeExibicao', `Termo Fornecedor – ${form.razaoSocial}`);
      fd.append('cpfEsperado', form.cpf.replace(/\D/g, ''));

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

  const textoClauses: Record<number, string> = {
    1: `CLÁUSULA PRIMEIRA — INFORMAÇÕES CONFIDENCIAIS\n\n1.1. Entendem-se como Informações Confidenciais todas as informações acessadas, recebidas ou conhecidas pelas partes, de qualquer natureza (técnica, operacional, financeira, jurídica, estratégica ou pessoal), relativas às atividades, projetos, colaboradores, clientes e fornecedores da outra parte, bem como quaisquer dados pessoais protegidos nos termos da LGPD.\n\n1.2. Incluem-se como confidenciais: relatórios, estudos, desenhos, modelos, especificações técnicas, segredos comerciais, dados operacionais, estratégias de mercado, planos de negócio e informações pessoais ou sensíveis.\n\n1.3. As Informações Confidenciais permanecem de propriedade exclusiva da parte reveladora.`,
    2: `CLÁUSULA SEGUNDA — PROTEÇÃO DE DADOS\n\n2.1. As partes obrigam-se a proteger os dados pessoais e sensíveis acessados em decorrência deste acordo, observando os princípios e obrigações previstos na LGPD.\n\n2.2. A CONTRATADA compromete-se a adotar todas as medidas técnicas e organizacionais aptas a proteger os dados pessoais contra acessos não autorizados.\n\n2.3. Caso haja exigência legal de compartilhamento de dados pessoais, a parte responsável deverá notificar imediatamente a outra, salvo impedimento legal.`,
    3: `CLÁUSULA TERCEIRA — NÃO CONCORRÊNCIA\n\na) A não divulgar, reproduzir, transferir ou utilizar segredos comerciais e industriais da GLOBALTEC, nos termos da Lei 9.279/96.\n\nb) A não contratar, diretamente ou por interposta pessoa, qualquer funcionário ou colaborador da GLOBALTEC pelo prazo de 5 anos após o término do contrato.\n\nc) A não prestar serviços em atividades concorrentes às da GLOBALTEC pelo prazo de 5 anos contados do encerramento do vínculo contratual.`,
    4: `CLÁUSULA QUARTA — VIGÊNCIA\nO presente acordo terá vigência de 10 (dez) anos a partir da data de sua assinatura.\n\nCLÁUSULA QUINTA — PENALIDADES\n5.1. O descumprimento ensejará indenização integral por perdas e danos diretos, indiretos e lucros cessantes.\n5.2. A parte infratora estará sujeita a multa de 5 vezes o valor total do contrato.\n\nCLÁUSULA SEXTA — FORO\nFica eleito o foro da Comarca de São Luís/MA para dirimir quaisquer controvérsias oriundas deste instrumento.`,
  };

  const req = (field: keyof EmpresaData) => (errors[field] ? 'border-red-400' : '');

  return (
    <div className="flex flex-col gap-4">
      {/* Stepper */}
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

      {/* Passo 0 — Dados da Empresa */}
      {step === 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Dados da Empresa</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls}>Razão Social *</label>
              <input name="razaoSocial" className={`${inputCls} ${req('razaoSocial')}`} value={form.razaoSocial} onChange={handleChange} />
              {errors.razaoSocial && <p className="mt-0.5 text-xs text-red-400">{errors.razaoSocial}</p>}
            </div>
            <div>
              <label className={labelCls}>Tipo de Empresa *</label>
              <input name="tipoEmpresa" className={`${inputCls} ${req('tipoEmpresa')}`} value={form.tipoEmpresa} onChange={handleChange} placeholder="MEI, LTDA, S/A..." />
              {errors.tipoEmpresa && <p className="mt-0.5 text-xs text-red-400">{errors.tipoEmpresa}</p>}
            </div>
            <div>
              <label className={labelCls}>CNPJ *</label>
              <input name="cnpj" className={`${inputCls} ${req('cnpj')}`} value={form.cnpj} onChange={handleChange} placeholder="00.000.000/0000-00" />
              {errors.cnpj && <p className="mt-0.5 text-xs text-red-400">{errors.cnpj}</p>}
            </div>
            <div>
              <label className={labelCls}>CEP *</label>
              <input name="cep" className={`${inputCls} ${req('cep')}`} value={form.cep} onChange={handleChange} placeholder="00000-000" />
              {errors.cep && <p className="mt-0.5 text-xs text-red-400">{errors.cep}</p>}
            </div>
            <div>
              <label className={labelCls}>Cidade *</label>
              <input name="cidade" className={`${inputCls} ${req('cidade')}`} value={form.cidade} onChange={handleChange} />
              {errors.cidade && <p className="mt-0.5 text-xs text-red-400">{errors.cidade}</p>}
            </div>
            <div>
              <label className={labelCls}>Estado *</label>
              <input name="estado" className={`${inputCls} ${req('estado')}`} value={form.estado} onChange={handleChange} maxLength={2} placeholder="MA" />
              {errors.estado && <p className="mt-0.5 text-xs text-red-400">{errors.estado}</p>}
            </div>
            <div>
              <label className={labelCls}>Rua *</label>
              <input name="rua" className={`${inputCls} ${req('rua')}`} value={form.rua} onChange={handleChange} />
              {errors.rua && <p className="mt-0.5 text-xs text-red-400">{errors.rua}</p>}
            </div>
            <div>
              <label className={labelCls}>Número *</label>
              <input name="numero" className={`${inputCls} ${req('numero')}`} value={form.numero} onChange={handleChange} />
              {errors.numero && <p className="mt-0.5 text-xs text-red-400">{errors.numero}</p>}
            </div>
            <div>
              <label className={labelCls}>Bairro *</label>
              <input name="bairro" className={`${inputCls} ${req('bairro')}`} value={form.bairro} onChange={handleChange} />
              {errors.bairro && <p className="mt-0.5 text-xs text-red-400">{errors.bairro}</p>}
            </div>
            <div>
              <label className={labelCls}>Nome do Representante *</label>
              <input name="nomeRepresentante" className={`${inputCls} ${req('nomeRepresentante')}`} value={form.nomeRepresentante} onChange={handleChange} />
              {errors.nomeRepresentante && <p className="mt-0.5 text-xs text-red-400">{errors.nomeRepresentante}</p>}
            </div>
            <div>
              <label className={labelCls}>RG / Identidade *</label>
              <input name="identidade" className={`${inputCls} ${req('identidade')}`} value={form.identidade} onChange={handleChange} />
              {errors.identidade && <p className="mt-0.5 text-xs text-red-400">{errors.identidade}</p>}
            </div>
            <div>
              <label className={labelCls}>Órgão Expedidor *</label>
              <input name="orgaoExpedidor" className={`${inputCls} ${req('orgaoExpedidor')}`} value={form.orgaoExpedidor} onChange={handleChange} />
              {errors.orgaoExpedidor && <p className="mt-0.5 text-xs text-red-400">{errors.orgaoExpedidor}</p>}
            </div>
            <div>
              <label className={labelCls}>CPF do Representante *</label>
              <input name="cpf" className={`${inputCls} ${req('cpf')}`} value={form.cpf} onChange={handleChange} placeholder="000.000.000-00" />
              {errors.cpf && <p className="mt-0.5 text-xs text-red-400">{errors.cpf}</p>}
            </div>
            <div>
              <label className={labelCls}>Denominação (apelido)</label>
              <input name="denominacao" className={inputCls} value={form.denominacao} onChange={handleChange} />
            </div>
          </div>
        </div>
      )}

      {/* Passos 1-4 — cláusulas */}
      {step >= 1 && step <= 4 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">{STEPS[step]}</h3>
          <div className="max-h-72 overflow-y-auto rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/80 leading-relaxed whitespace-pre-wrap">
            {textoClauses[step]}
          </div>
        </div>
      )}

      {/* Passo 5 — Assinatura Digital */}
      {step === 5 && (
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

      {/* Rodapé */}
      <div className="flex justify-between border-t border-white/10 pt-2">
        <button className={btn.secondaryLg} onClick={step === 0 ? onClose : back}>
          {step === 0 ? 'Cancelar' : '← Anterior'}
        </button>
        {step < STEPS.length - 1 ? (
          <button className={btn.primaryLg} onClick={next}>Próximo →</button>
        ) : (
          <button className={btn.primaryLg} onClick={handleSalvar} disabled={saving || !pdfAssinado}>
            {saving ? 'Salvando...' : 'Enviar documento assinado'}
          </button>
        )}
      </div>
    </div>
  );
};
