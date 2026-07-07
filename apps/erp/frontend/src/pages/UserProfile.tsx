import { useEffect, useState, useRef, type ChangeEvent, type FormEvent } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { Usuario } from '../types';
import { useAuthStore } from '../store/auth';
import { btn } from '../utils/buttonStyles';
import { formatApiError, toast } from '../utils/toast';
import { getCargoNome } from '../utils/projectAccess';
import {
  UserAvatar,
  ProfileSectionTitle,
  ProfileField,
  CopyPlainTextButton,
  userProfileCardClass,
  accessLevelLabel,
} from '../components/users/UserDirectoryUi';
import { AppInput } from '../components/ui/AppInput';
import { AppTextarea } from '../components/ui/AppTextarea';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { ProfilePhotoCropModal } from '../components/ProfilePhotoCropModal';
import { AppModal } from '../components/ui/AppModal';
import { formatDateOnlyPtBr, toDateInputValue } from '../utils/dateInputValue';
import { formatCpfDisplay, isValidCpfDigits, maskCpfInput, onlyCpfDigits } from '../utils/cpf';
import { UPLOAD_LIMITS } from '../utils/uploadLimits';
import { userHasPermission } from '../utils/projectAccess';
import { ProfileConfidencialidade } from '../components/profile/ProfileConfidencialidade';

/** Garante URL clicável quando o usuário omitir `https://`. */
function profileLinkHref(raw: string): string {
  const t = raw.trim();
  if (!t) return '#';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

type PerfilUsuario = Usuario & {
  cargo: Usuario['cargo'] & {
    descricao?: string | null;
    permissions?: Array<{ chave?: string; modulo?: string; acao?: string; descricao?: string }>;
  };
};

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const authUser = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setCredentials = useAuthStore((s) => s.setCredentials);
  const [profile, setProfile] = useState<PerfilUsuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [draftTelefone, setDraftTelefone] = useState('');
  const [draftCpf, setDraftCpf] = useState('');
  const [draftFormacao, setDraftFormacao] = useState('');
  const [draftDataNascimento, setDraftDataNascimento] = useState('');
  const [draftBiografiaResumo, setDraftBiografiaResumo] = useState('');
  const [draftHabilidades, setDraftHabilidades] = useState('');
  const [draftLinkLattes, setDraftLinkLattes] = useState('');
  const [draftLinkPortfolio, setDraftLinkPortfolio] = useState('');
  const [draftLinkLinkedin, setDraftLinkLinkedin] = useState('');
  const [draftDadosContato, setDraftDadosContato] = useState('');
  const [draftPix, setDraftPix] = useState('');
  const [draftEndereco, setDraftEndereco] = useState('');
  const [draftDataEntrada, setDraftDataEntrada] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [showRemovePhotoConfirm, setShowRemovePhotoConfirm] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const cropModalOpen = Boolean(cropImageSrc);

  function dismissCropModal() {
    if (cropImageSrc?.startsWith('blob:')) {
      URL.revokeObjectURL(cropImageSrc);
    }
    setCropImageSrc(null);
  }

  const numericId = id ? Number.parseInt(id, 10) : NaN;

  useEffect(() => {
    if (!Number.isFinite(numericId) || numericId < 1) {
      setLoading(false);
      setError('ID de usuário inválido');
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<PerfilUsuario>(`/users/${numericId}`);
        if (!cancelled) setProfile(data);
      } catch (e: unknown) {
        if (!cancelled) setError(formatApiError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [numericId]);

  if (!Number.isFinite(numericId) || numericId < 1) {
    return <Navigate to="/" replace />;
  }

  const isOwn = authUser?.id === numericId;
  const podeGerenciarDocs =
    userHasPermission(authUser, 'documentos_rh:gerenciar') ||
    userHasPermission(authUser, 'usuarios:gerenciar') ||
    userHasPermission(authUser, 'sistema:administrar');
  const cargoNome =
    profile && typeof profile.cargo === 'object' && profile.cargo
      ? getCargoNome(profile) || profile.cargo.nome
      : '';

  const responsabilidade =
    profile && typeof profile.cargo === 'object' && profile.cargo?.descricao?.trim()
      ? profile.cargo.descricao.trim()
      : null;

  const telefoneOk = profile?.telefone?.trim();
  const cpfOk = profile?.cpf?.trim();
  const cpfDisplay = cpfOk ? formatCpfDisplay(cpfOk) : '';
  const formacaoOk = profile?.formacao?.trim();
  const funcaoOk = profile?.funcao?.trim();
  const dataOk = formatDateOnlyPtBr(profile?.dataNascimento);
  const dataEntradaOk = formatDateOnlyPtBr(profile?.dataEntrada);
  const biografiaOk = profile?.biografiaResumo?.trim();
  const habilidadesOk = profile?.habilidades?.trim();
  const dadosContatoOk = profile?.dadosContato?.trim();
  const pixOk = profile?.pix?.trim();
  const enderecoOk = profile?.endereco?.trim();
  const linkLattesOk = profile?.linkLattes?.trim();
  const linkPortfolioOk = profile?.linkPortfolio?.trim();
  const linkLinkedinOk = profile?.linkLinkedin?.trim();

  function startEditingPersonal() {
    if (!profile) return;
    setDraftTelefone(profile.telefone ?? '');
    setDraftCpf(profile.cpf ? formatCpfDisplay(profile.cpf) : '');
    setDraftFormacao(profile.formacao ?? '');
    setDraftDataNascimento(toDateInputValue(profile.dataNascimento));
    setDraftBiografiaResumo(profile.biografiaResumo ?? '');
    setDraftHabilidades(profile.habilidades ?? '');
    setDraftLinkLattes(profile.linkLattes ?? '');
    setDraftLinkPortfolio(profile.linkPortfolio ?? '');
    setDraftLinkLinkedin(profile.linkLinkedin ?? '');
    setDraftDadosContato(profile.dadosContato ?? '');
    setDraftPix(profile.pix ?? '');
    setDraftEndereco(profile.endereco ?? '');
    setDraftDataEntrada(toDateInputValue(profile.dataEntrada));
    setEditingPersonal(true);
  }

  function cancelEditingPersonal() {
    setEditingPersonal(false);
  }

  async function savePersonalInfo(e: FormEvent) {
    e.preventDefault();
    if (!isOwn || !token) return;

    const cpfDigits = onlyCpfDigits(draftCpf);
    if (cpfDigits.length > 0 && !isValidCpfDigits(cpfDigits)) {
      toast.error('CPF inválido. Verifique os dígitos informados.');
      return;
    }

    setSavingPersonal(true);
    try {
      const { data } = await api.patch<PerfilUsuario>('/users/me/profile', {
        telefone: draftTelefone.trim() === '' ? null : draftTelefone.trim(),
        cpf: cpfDigits.length > 0 ? cpfDigits : null,
        formacao: draftFormacao.trim() === '' ? null : draftFormacao.trim(),
        dataNascimento: draftDataNascimento.trim() === '' ? null : draftDataNascimento.trim(),
        biografiaResumo: draftBiografiaResumo.trim() === '' ? null : draftBiografiaResumo.trim(),
        habilidades: draftHabilidades.trim() === '' ? null : draftHabilidades.trim(),
        linkLattes: draftLinkLattes.trim() === '' ? null : draftLinkLattes.trim(),
        linkPortfolio: draftLinkPortfolio.trim() === '' ? null : draftLinkPortfolio.trim(),
        linkLinkedin: draftLinkLinkedin.trim() === '' ? null : draftLinkLinkedin.trim(),
        dadosContato: draftDadosContato.trim() === '' ? null : draftDadosContato.trim(),
        pix: draftPix.trim() === '' ? null : draftPix.trim(),
        endereco: draftEndereco.trim() === '' ? null : draftEndereco.trim(),
        dataEntrada: draftDataEntrada.trim() === '' ? null : draftDataEntrada.trim(),
      });
      setProfile(data);
      if (authUser && authUser.id === numericId) {
        setCredentials({
          token,
          user: {
            ...authUser,
            telefone: data.telefone ?? null,
            cpf: data.cpf ?? null,
            formacao: data.formacao ?? null,
            dataNascimento: data.dataNascimento ?? null,
            biografiaResumo: data.biografiaResumo ?? null,
            habilidades: data.habilidades ?? null,
            linkLattes: data.linkLattes ?? null,
            linkPortfolio: data.linkPortfolio ?? null,
            linkLinkedin: data.linkLinkedin ?? null,
            dadosContato: data.dadosContato ?? null,
            pix: data.pix ?? null,
            endereco: data.endereco ?? null,
            dataEntrada: data.dataEntrada ?? null,
          },
        });
      }
      setEditingPersonal(false);
      toast.success('Informações atualizadas.');
    } catch (err: unknown) {
      toast.error(formatApiError(err));
    } finally {
      setSavingPersonal(false);
    }
  }

  function mergeAuthUserFoto(fotoUrl: string | null | undefined) {
    if (!authUser || authUser.id !== numericId || !token) return;
    setCredentials({
      token,
      user: { ...authUser, fotoUrl: fotoUrl ?? null },
    });
  }

  function onPickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isOwn) return;
    if (file.size > UPLOAD_LIMITS.generic.maxBytes) {
      toast.error(
        `Escolha uma imagem de até ${UPLOAD_LIMITS.generic.maxMb} MB (será recortada antes do envio).`,
      );
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem.');
      return;
    }
    const url = URL.createObjectURL(file);
    setCropImageSrc(url);
  }

  async function uploadCroppedProfilePhoto(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post<PerfilUsuario>('/users/me/profile-photo', formData);
    setProfile(data);
    mergeAuthUserFoto(data.fotoUrl);
    toast.success('Foto de perfil atualizada.');
  }

  async function confirmRemovePhoto() {
    if (!isOwn || !token) return;
    setUploadingPhoto(true);
    try {
      const { data } = await api.delete<PerfilUsuario>('/users/me/profile-photo');
      setProfile(data);
      mergeAuthUserFoto(null);
      setShowRemovePhotoConfirm(false);
      toast.success('Foto de perfil removida.');
    } catch (err: unknown) {
      toast.error(formatApiError(err));
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Perfil</h1>
        <p className="text-sm text-white/55 mt-1">
          {isOwn ? 'Seus dados cadastrais e cargo no sistema' : 'Dados do colaborador'}
        </p>
      </div>

      {isOwn && (
        <>
          <AppModal
            open={showRemovePhotoConfirm}
            onClose={() => !uploadingPhoto && setShowRemovePhotoConfirm(false)}
            title="Remover foto de perfil"
            size="sm"
            overlayClassName="z-[55]"
            panelClassName="z-[55]"
            bodyClassName="p-6 space-y-4"
          >
            <p className="text-sm text-white/80">
              Deseja remover sua foto de perfil? O avatar voltará a exibir apenas a inicial do seu nome.
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={uploadingPhoto}
                onClick={() => setShowRemovePhotoConfirm(false)}
                className={`${btn.secondary} rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50`}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={uploadingPhoto}
                onClick={confirmRemovePhoto}
                className={`${btn.modalDanger} rounded-lg px-4 py-2 text-sm disabled:opacity-50`}
              >
                {uploadingPhoto ? 'Removendo…' : 'Remover foto'}
              </button>
            </div>
          </AppModal>
          <ChangePasswordModal open={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
          <ProfilePhotoCropModal
            open={cropModalOpen}
            imageSrc={cropImageSrc ?? ''}
            onClose={dismissCropModal}
            onConfirm={async (file) => {
              try {
                await uploadCroppedProfilePhoto(file);
              } catch (err: unknown) {
                toast.error(formatApiError(err));
                throw err;
              }
            }}
          />
        </>
      )}

      {loading && (
        <div className={`${userProfileCardClass} px-8 py-16 text-center text-white/60`}>
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-4 text-sm">Carregando perfil…</p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-500/35 bg-red-500/10 px-5 py-4 text-sm text-red-200">{error}</div>
      )}

      {!loading && !error && profile && (
        <div className={userProfileCardClass}>
          {/* Cabeçalho do cartão */}
          <div className="px-6 sm:px-8 py-6 sm:py-8 border-b border-white/10 bg-white/[0.03]">
            <div className="flex flex-col sm:flex-row sm:items-start gap-5">
              <div className="flex flex-col items-center sm:items-start gap-3 shrink-0">
                <UserAvatar nome={profile.nome} fotoUrl={profile.fotoUrl} size="xl" />
                {isOwn && (
                  <>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      className="sr-only"
                      onChange={onPickPhoto}
                    />
                    <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                      <button
                        type="button"
                        disabled={uploadingPhoto || cropModalOpen || showRemovePhotoConfirm}
                        onClick={() => photoInputRef.current?.click()}
                        className={`${btn.primarySoft} inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        {cropModalOpen ? 'Recortando…' : 'Alterar foto'}
                      </button>
                      {profile.fotoUrl ? (
                        <button
                          type="button"
                          disabled={uploadingPhoto || cropModalOpen || showRemovePhotoConfirm}
                          onClick={() => setShowRemovePhotoConfirm(true)}
                          className={`${btn.secondary} inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50`}
                        >
                          Remover foto
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                  <h2 className="text-xl sm:text-2xl font-semibold text-white">{profile.nome}</h2>
                  {isOwn && (
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md bg-white/10 text-white/70 border border-white/15">
                      Você
                    </span>
                  )}
                </div>
                <div className="text-sm text-white/60 mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="truncate">{profile.email}</span>
                    <CopyPlainTextButton text={profile.email} title="Copiar e-mail" />
                  </span>
                  {isOwn && (
                    <button
                      type="button"
                      onClick={() => setShowPasswordModal(true)}
                      className={`${btn.primarySoft} inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shrink-0`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                        />
                      </svg>
                      Alterar senha
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-8 py-6 sm:py-8 space-y-8">
            <section>
              <ProfileSectionTitle>Dados profissionais</ProfileSectionTitle>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
                <ProfileField label="Cargo" copyText={cargoNome || undefined}>
                  {cargoNome || '—'}
                </ProfileField>
                <ProfileField label="Responsabilidade" empty={!responsabilidade} copyText={responsabilidade ?? undefined}>
                  {responsabilidade || '[Não informado]'}
                </ProfileField>
                <ProfileField label="Função / papel" empty={!funcaoOk} copyText={funcaoOk}>
                  {funcaoOk || '[Não informado]'}
                </ProfileField>
                <ProfileField label="Nível de acesso" copyText={accessLevelLabel(cargoNome)}>
                  {accessLevelLabel(cargoNome)}
                </ProfileField>
              </dl>
            </section>

            <section>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-2.5 mb-4">
                <h3 className="text-[11px] font-semibold tracking-[0.12em] text-white/40 uppercase flex-1 min-w-[12rem]">
                  Informações pessoais
                </h3>
                {isOwn && !editingPersonal && (
                  <button
                    type="button"
                    onClick={startEditingPersonal}
                    className={`${btn.primarySoft} inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                    Editar informações
                  </button>
                )}
              </div>

              {isOwn && editingPersonal ? (
                <form onSubmit={savePersonalInfo} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <AppInput
                      label="Telefone"
                      value={draftTelefone}
                      onChange={setDraftTelefone}
                      placeholder="Ex.: (11) 98765-4321"
                    />
                    <AppInput
                      label="CPF"
                      value={draftCpf}
                      onChange={(v) => setDraftCpf(maskCpfInput(v))}
                      placeholder="000.000.000-00"
                    />
                    <AppInput
                      label="Formação"
                      value={draftFormacao}
                      onChange={setDraftFormacao}
                      placeholder="Ex.: Graduação em Design, pós em Gestão…"
                    />
                    <AppInput
                      label="Data de nascimento"
                      type="date"
                      value={draftDataNascimento}
                      onChange={setDraftDataNascimento}
                    />
                    <AppInput
                      label="Data de entrada"
                      type="date"
                      value={draftDataEntrada}
                      onChange={setDraftDataEntrada}
                    />
                    <AppTextarea
                      label="Resumo da biografia"
                      value={draftBiografiaResumo}
                      onChange={setDraftBiografiaResumo}
                      placeholder="Breve apresentação sobre você…"
                      rows={4}
                      className="sm:col-span-2"
                    />
                    <AppTextarea
                      label="Habilidades"
                      value={draftHabilidades}
                      onChange={setDraftHabilidades}
                      placeholder="Ex.: React, gestão de projetos, comunicação — separadas por vírgula ou linhas"
                      rows={3}
                      className="sm:col-span-2"
                    />
                    <AppTextarea
                      label="Dados de contato (complementares)"
                      value={draftDadosContato}
                      onChange={setDraftDadosContato}
                      placeholder="E-mail alternativo, horário preferencial, outro meio de contato…"
                      rows={2}
                      className="sm:col-span-2"
                    />
                    <AppInput
                      label="PIX (pagamentos / RH)"
                      value={draftPix}
                      onChange={setDraftPix}
                      placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                      className="sm:col-span-2"
                    />
                    <AppTextarea
                      label="Endereço"
                      value={draftEndereco}
                      onChange={setDraftEndereco}
                      placeholder="Rua, número, bairro, cidade, UF, CEP…"
                      rows={3}
                      className="sm:col-span-2"
                    />
                    <AppInput
                      label="Currículo Lattes (URL)"
                      value={draftLinkLattes}
                      onChange={setDraftLinkLattes}
                      placeholder="https://lattes.cnpq.br/…"
                    />
                    <AppInput
                      label="Portfólio (URL)"
                      value={draftLinkPortfolio}
                      onChange={setDraftLinkPortfolio}
                      placeholder="https://…"
                    />
                    <AppInput
                      label="LinkedIn (URL)"
                      value={draftLinkLinkedin}
                      onChange={setDraftLinkLinkedin}
                      placeholder="https://linkedin.com/in/…"
                      className="sm:col-span-2"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={savingPersonal}
                      className={`${btn.primary} rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50`}
                    >
                      {savingPersonal ? 'Salvando…' : 'Salvar'}
                    </button>
                    <button
                      type="button"
                      disabled={savingPersonal}
                      onClick={cancelEditingPersonal}
                      className={`${btn.secondary} rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50`}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
                  <ProfileField label="Telefone" empty={!telefoneOk} copyText={telefoneOk}>
                    {telefoneOk || '[Não informado]'}
                  </ProfileField>
                  <ProfileField label="CPF" empty={!cpfOk} copyText={cpfOk}>
                    {cpfDisplay || '[Não informado]'}
                  </ProfileField>
                  <ProfileField label="Formação" empty={!formacaoOk} copyText={formacaoOk}>
                    {formacaoOk || '[Não informado]'}
                  </ProfileField>
                  <ProfileField label="Data de nascimento" empty={!dataOk} copyText={dataOk || undefined}>
                    {dataOk || '[Não informado]'}
                  </ProfileField>
                  <ProfileField label="Data de entrada" empty={!dataEntradaOk} copyText={dataEntradaOk || undefined}>
                    {dataEntradaOk || '[Não informado]'}
                  </ProfileField>
                  <ProfileField
                    label="Resumo da biografia"
                    empty={!biografiaOk}
                    className="sm:col-span-2"
                    copyText={biografiaOk}
                  >
                    <span className="whitespace-pre-wrap">{biografiaOk || '[Não informado]'}</span>
                  </ProfileField>
                  <ProfileField label="Habilidades" empty={!habilidadesOk} className="sm:col-span-2" copyText={habilidadesOk}>
                    <span className="whitespace-pre-wrap">{habilidadesOk || '[Não informado]'}</span>
                  </ProfileField>
                  <ProfileField
                    label="Dados de contato"
                    empty={!dadosContatoOk}
                    className="sm:col-span-2"
                    copyText={dadosContatoOk}
                  >
                    <span className="whitespace-pre-wrap">{dadosContatoOk || '[Não informado]'}</span>
                  </ProfileField>
                  <ProfileField
                    label="PIX"
                    empty={!pixOk}
                    className="sm:col-span-2"
                    copyText={pixOk}
                  >
                    <span className="whitespace-pre-wrap break-all">{pixOk || '[Não informado]'}</span>
                  </ProfileField>
                  <ProfileField
                    label="Endereço"
                    empty={!enderecoOk}
                    className="sm:col-span-2"
                    copyText={enderecoOk}
                  >
                    <span className="whitespace-pre-wrap">{enderecoOk || '[Não informado]'}</span>
                  </ProfileField>
                  <ProfileField label="Currículo Lattes" empty={!linkLattesOk} copyText={linkLattesOk}>
                    {linkLattesOk ? (
                      <a
                        href={profileLinkHref(linkLattesOk)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline break-all"
                      >
                        {linkLattesOk}
                      </a>
                    ) : (
                      '[Não informado]'
                    )}
                  </ProfileField>
                  <ProfileField label="Portfólio" empty={!linkPortfolioOk} copyText={linkPortfolioOk}>
                    {linkPortfolioOk ? (
                      <a
                        href={profileLinkHref(linkPortfolioOk)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline break-all"
                      >
                        {linkPortfolioOk}
                      </a>
                    ) : (
                      '[Não informado]'
                    )}
                  </ProfileField>
                  <ProfileField label="LinkedIn" empty={!linkLinkedinOk} copyText={linkLinkedinOk}>
                    {linkLinkedinOk ? (
                      <a
                        href={profileLinkHref(linkLinkedinOk)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline break-all"
                      >
                        {linkLinkedinOk}
                      </a>
                    ) : (
                      '[Não informado]'
                    )}
                  </ProfileField>
                </dl>
              )}
            </section>

            {(isOwn || podeGerenciarDocs) && (
              <ProfileConfidencialidade
                usuarioId={numericId}
                isOwn={isOwn}
                podeGerenciar={podeGerenciarDocs}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
