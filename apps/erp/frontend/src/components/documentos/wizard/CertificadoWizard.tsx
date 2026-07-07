import React, { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { CertificadoPDF, type CertificadoFormData } from '../pdf/CertificadoPDF';
import { camposAplicacao, tiposPrograma, linguagens } from '../../../constants/certificado';
import { btn } from '../../../utils/buttonStyles';
import { api } from '../../../services/api';
import { formatApiError } from '../../../utils/toast';
import type { DocumentoSalvoInfo } from '../../../types/documentoSalvo';

interface Props {
  onClose: () => void;
  onSalvo: (doc: DocumentoSalvoInfo) => void;
}

const defaultData: CertificadoFormData = {
  dataPublicacao: '',
  dataCriacao: '',
  tituloPrograma: '',
  localProjeto: '',
  linguagem: [],
  campoAplicacao: [],
  tipoPrograma: [],
  algoritmoHash: '',
};

const STEPS = ['Dados', 'Campo Aplic.', 'Tipo Prog.', 'Linguagem', 'Resumo'];

const inputCls =
  'w-full rounded-md border border-white/25 bg-neutral/90 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/60';
const labelCls = 'block text-xs font-medium text-white/70 mb-1';

export const CertificadoWizard: React.FC<Props> = ({ onClose, onSalvo }) => {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<CertificadoFormData>(defaultData);
  const [search2, setSearch2] = useState('');
  const [search3, setSearch3] = useState('');
  const [search4, setSearch4] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const set = (field: keyof CertificadoFormData, value: unknown) =>
    setData((prev) => ({ ...prev, [field]: value }));

  const toggleArr = (field: 'campoAplicacao' | 'tipoPrograma' | 'linguagem', id: string) =>
    setData((prev) => {
      const arr = prev[field] as string[];
      return { ...prev, [field]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id] };
    });

  const validateStep0 = () => {
    const e: Record<string, string> = {};
    if (!data.dataCriacao) e.dataCriacao = 'Obrigatório';
    if (!data.tituloPrograma.trim()) e.tituloPrograma = 'Obrigatório';
    if (!data.localProjeto.trim()) e.localProjeto = 'Obrigatório';
    if (!data.algoritmoHash.trim()) e.algoritmoHash = 'Obrigatório';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (step === 0 && !validateStep0()) return;
    setStep((s) => s + 1);
  };
  const back = () => setStep((s) => s - 1);

  const handleSalvar = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const blob = await pdf(<CertificadoPDF data={data} />).toBlob();
      const nomeArquivo = `Certificado_${data.tituloPrograma.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`;
      const file = new File([blob], nomeArquivo, { type: 'application/pdf' });

      const fd = new FormData();
      fd.append('file', file);
      fd.append('tipo', 'certificado');
      fd.append('nomeExibicao', `Certificado – ${data.tituloPrograma}`);

      const { data: docSalvo } = await api.post<{ id: number; nomeExibicao: string; tipo: string }>(
        '/documentos/upload',
        fd,
      );

      onSalvo({ id: docSalvo.id, nomeExibicao: docSalvo.nomeExibicao, tipo: docSalvo.tipo });
    } catch (err: unknown) {
      setSaveError(formatApiError(err) || 'Erro ao salvar o documento. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const filteredCampos = camposAplicacao.filter(
    (c) =>
      c.id.toLowerCase().includes(search2.toLowerCase()) ||
      c.descricao.toLowerCase().includes(search2.toLowerCase()),
  );
  const filteredTipos = tiposPrograma.filter(
    (t) =>
      t.id.toLowerCase().includes(search3.toLowerCase()) ||
      t.descricao.toLowerCase().includes(search3.toLowerCase()),
  );
  const filteredLinguagens = linguagens.filter((l) =>
    l.toLowerCase().includes(search4.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                i === step
                  ? 'bg-primary text-white'
                  : i < step
                  ? 'bg-primary/30 text-primary'
                  : 'bg-white/5 text-white/40'
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                  i < step ? 'bg-primary/60' : 'bg-white/10'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </span>
              {s}
            </div>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-white/10" />}
          </React.Fragment>
        ))}
      </div>

      {/* Passo 0 — Dados do Programa */}
      {step === 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Dados do Programa</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Data de Publicação</label>
              <input
                type="date"
                className={inputCls}
                value={data.dataPublicacao}
                onChange={(e) => set('dataPublicacao', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Data de Criação *</label>
              <input
                type="date"
                className={`${inputCls} ${errors.dataCriacao ? 'border-red-400' : ''}`}
                value={data.dataCriacao}
                onChange={(e) => set('dataCriacao', e.target.value)}
              />
              {errors.dataCriacao && <p className="mt-0.5 text-xs text-red-400">{errors.dataCriacao}</p>}
            </div>
          </div>
          <p className="text-xs text-white/40">
            Data de publicação: quando o programa se tornou acessível ao público. Data de criação:
            quando o programa passou a atender plenamente suas funções.
          </p>
          <div>
            <label className={labelCls}>Título do Programa *</label>
            <input
              className={`${inputCls} ${errors.tituloPrograma ? 'border-red-400' : ''}`}
              value={data.tituloPrograma}
              onChange={(e) => set('tituloPrograma', e.target.value)}
            />
            {errors.tituloPrograma && <p className="mt-0.5 text-xs text-red-400">{errors.tituloPrograma}</p>}
          </div>
          <div>
            <label className={labelCls}>Local do Projeto *</label>
            <input
              className={`${inputCls} ${errors.localProjeto ? 'border-red-400' : ''}`}
              value={data.localProjeto}
              onChange={(e) => set('localProjeto', e.target.value)}
            />
            {errors.localProjeto && <p className="mt-0.5 text-xs text-red-400">{errors.localProjeto}</p>}
          </div>
          <div>
            <label className={labelCls}>Algoritmo Hash *</label>
            <input
              className={`${inputCls} ${errors.algoritmoHash ? 'border-red-400' : ''}`}
              value={data.algoritmoHash}
              onChange={(e) => set('algoritmoHash', e.target.value)}
            />
            {errors.algoritmoHash && <p className="mt-0.5 text-xs text-red-400">{errors.algoritmoHash}</p>}
          </div>
        </div>
      )}

      {/* Passo 1 — Campo de Aplicação */}
      {step === 1 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Campo de Aplicação</h3>
          <input
            className={inputCls}
            placeholder="Buscar campo..."
            value={search2}
            onChange={(e) => setSearch2(e.target.value)}
          />
          <div className="max-h-64 overflow-y-auto rounded-md border border-white/10 bg-white/5 p-2">
            {filteredCampos.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-start gap-2 py-0.5 text-xs text-white/80 hover:text-white">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-primary"
                  checked={data.campoAplicacao.includes(c.id)}
                  onChange={() => toggleArr('campoAplicacao', c.id)}
                />
                <span>{c.id} – {c.descricao}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-white/40">{data.campoAplicacao.length} selecionado(s)</p>
        </div>
      )}

      {/* Passo 2 — Tipo de Programa */}
      {step === 2 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Tipo de Programa</h3>
          <input
            className={inputCls}
            placeholder="Buscar tipo..."
            value={search3}
            onChange={(e) => setSearch3(e.target.value)}
          />
          <div className="max-h-64 overflow-y-auto rounded-md border border-white/10 bg-white/5 p-2">
            {filteredTipos.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-start gap-2 py-0.5 text-xs text-white/80 hover:text-white">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-primary"
                  checked={data.tipoPrograma.includes(t.id)}
                  onChange={() => toggleArr('tipoPrograma', t.id)}
                />
                <span>{t.id} – {t.descricao}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-white/40">{data.tipoPrograma.length} selecionado(s)</p>
        </div>
      )}

      {/* Passo 3 — Linguagem */}
      {step === 3 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Linguagem</h3>
          <input
            className={inputCls}
            placeholder="Buscar linguagem..."
            value={search4}
            onChange={(e) => setSearch4(e.target.value)}
          />
          <div className="grid max-h-64 grid-cols-2 overflow-y-auto rounded-md border border-white/10 bg-white/5 p-2 gap-x-4">
            {filteredLinguagens.map((l) => (
              <label key={l} className="flex cursor-pointer items-center gap-2 py-0.5 text-xs text-white/80 hover:text-white">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={data.linguagem.includes(l)}
                  onChange={() => toggleArr('linguagem', l)}
                />
                {l}
              </label>
            ))}
          </div>
          <p className="text-xs text-white/40">{data.linguagem.length} selecionada(s)</p>
        </div>
      )}

      {/* Passo 4 — Resumo */}
      {step === 4 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Resumo e Geração do PDF</h3>
          <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/80 space-y-1">
            <p><span className="font-semibold text-white/60">Título:</span> {data.tituloPrograma}</p>
            <p><span className="font-semibold text-white/60">Local:</span> {data.localProjeto}</p>
            <p><span className="font-semibold text-white/60">Criação:</span> {data.dataCriacao}</p>
            <p><span className="font-semibold text-white/60">Publicação:</span> {data.dataPublicacao || 'Não publicado'}</p>
            <p><span className="font-semibold text-white/60">Hash:</span> {data.algoritmoHash}</p>
            <p><span className="font-semibold text-white/60">Linguagens:</span> {data.linguagem.join(', ') || '—'}</p>
            <p><span className="font-semibold text-white/60">Campos de Aplic.:</span> {data.campoAplicacao.join(', ') || '—'}</p>
            <p><span className="font-semibold text-white/60">Tipos de Prog.:</span> {data.tipoPrograma.join(', ') || '—'}</p>
          </div>
          {saveError && <p className="text-xs text-red-400">{saveError}</p>}
        </div>
      )}

      {/* Rodapé de navegação */}
      <div className="flex justify-between pt-2 border-t border-white/10">
        <button className={btn.secondaryLg} onClick={step === 0 ? onClose : back}>
          {step === 0 ? 'Cancelar' : '← Anterior'}
        </button>
        {step < STEPS.length - 1 ? (
          <button className={btn.primaryLg} onClick={next}>
            Próximo →
          </button>
        ) : (
          <button className={btn.primaryLg} onClick={handleSalvar} disabled={saving}>
            {saving ? 'Salvando...' : 'Gerar e Salvar PDF'}
          </button>
        )}
      </div>
    </div>
  );
};
