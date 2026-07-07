import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrigemPonto, Prisma, TipoBatida } from '@prisma/client';
import * as fs from 'fs';
import { join } from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { assertCompetenciaAbertaPorData } from '../../../common/utils/competencia-lock.util';
import {
  calcularHashAtual,
  gerarComprovanteId,
  obterUltimoHashCadeia,
  reservarProximoNsr,
} from '../../../common/utils/ponto-nsr.util';
import { computeAlmocoDoDia, type JornadaFatiaAlmoco } from '../espelho/espelho.calculator';
import { JornadaService } from '../jornada/jornada.service';
import { BaterPontoDto } from './dto/bater-ponto.dto';
import { CriarAjustePontoDto, EditarPontoDto, RemoverPontoDto } from './dto/ajustar-ponto.dto';
import { ListarPontoDto } from './dto/listar-ponto.dto';

const registroInclude = {
  usuario: { select: { id: true, nome: true, email: true, fotoUrl: true } },
  ajustadoPor: { select: { id: true, nome: true } },
} satisfies Prisma.RegistroPontoInclude;

const UPLOADS_URL_PREFIX = (process.env.UPLOADS_URL_PREFIX || '/uploads').replace(/\/+$/, '');

@Injectable()
export class PontoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jornadaService: JornadaService,
  ) {}

  // ---------- Helpers ----------

  /** Janela [00:00, 24:00) do dia local do servidor. */
  private boundsHoje(reference: Date = new Date()): { inicio: Date; fim: Date } {
    const inicio = new Date(reference);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 1);
    return { inicio, fim };
  }

  /** Janela [inicio, fim] aceitando strings ISO; default = mês corrente. */
  private bounds(inicio?: string, fim?: string): { inicio: Date; fim: Date } {
    const now = new Date();
    const start = inicio
      ? new Date(inicio)
      : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = fim
      ? new Date(fim)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Período inválido.');
    }
    if (end < start) {
      throw new BadRequestException('Data final deve ser posterior à inicial.');
    }
    return { inicio: start, fim: end };
  }

  private removerFotoFisica(fotoUrl: string | null | undefined) {
    if (!fotoUrl) return;
    // Aceita os dois prefixos: legado público e o novo protegido (LGPD).
    let relativo: string | null = null;
    if (fotoUrl.startsWith('/uploads-protegido/')) {
      relativo = fotoUrl.slice('/uploads-protegido/'.length);
    } else if (fotoUrl.startsWith(UPLOADS_URL_PREFIX + '/')) {
      relativo = fotoUrl.slice(UPLOADS_URL_PREFIX.length + 1);
    }
    if (!relativo) return;
    try {
      const uploadsRoot = process.env.UPLOADS_DIR
        ? process.env.UPLOADS_DIR.startsWith('.')
          ? join(process.cwd(), process.env.UPLOADS_DIR)
          : process.env.UPLOADS_DIR
        : join(process.cwd(), 'uploads');
      const absoluto = join(uploadsRoot, relativo);
      if (fs.existsSync(absoluto)) {
        fs.unlinkSync(absoluto);
      }
    } catch {
      // Silencioso — limpeza física é best-effort.
    }
  }

  /** Salva selfie base64 da batida offline em `uploads/ponto` e retorna URL protegida. */
  private salvarFotoBase64NoPonto(fotoBase64?: string): string | null {
    if (!fotoBase64) return null;
    try {
      const buffer = Buffer.from(fotoBase64, 'base64');
      if (!buffer.length) return null;
      const uploadsRoot = process.env.UPLOADS_DIR
        ? process.env.UPLOADS_DIR.startsWith('.')
          ? join(process.cwd(), process.env.UPLOADS_DIR)
          : process.env.UPLOADS_DIR
        : join(process.cwd(), 'uploads');
      const pontoDir = join(uploadsRoot, 'ponto');
      if (!fs.existsSync(pontoDir)) {
        fs.mkdirSync(pontoDir, { recursive: true });
      }
      const fileName = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
      const absolute = join(pontoDir, fileName);
      fs.writeFileSync(absolute, buffer);
      return `/uploads-protegido/ponto/${fileName}`;
    } catch {
      return null;
    }
  }

  // ---------- Batida normal pelo colaborador ----------

  /**
   * Decide automaticamente se a próxima batida é ENTRADA (1ª do dia)
   * ou SAIDA (2ª). Bloqueia tentativas além do limite de 2 batidas/dia.
   */
  /** Distância (em metros) entre dois pontos lat/long via fórmula de Haversine. */
  private distanciaMetros(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000; // metros
    const toRad = (g: number) => (g * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /**
   * Valida geocerca da batida. Ordem de precedência (do mais específico para o mais genérico):
   *   1. Geocerca DA JORNADA do usuário (se os 3 campos lat/lon/raio estiverem preenchidos);
   *   2. Geocerca do EMPREGADOR principal (config global da unidade).
   * Quando nenhum dos dois exige geocerca, a validação é silenciosa (passa).
   */
  private async validarGeocerca(
    usuarioId: number,
    latitude?: number | null,
    longitude?: number | null,
  ) {
    let lat: number | null = null;
    let lon: number | null = null;
    let raio: number | null = null;
    let origem: 'jornada' | 'unidade' = 'unidade';

    const jornada = await this.prisma.jornadaTrabalho.findUnique({
      where: { usuarioId },
      select: {
        latitudeReferencia: true,
        longitudeReferencia: true,
        raioMetros: true,
      },
    });
    if (
      jornada?.latitudeReferencia != null &&
      jornada?.longitudeReferencia != null &&
      jornada?.raioMetros != null
    ) {
      lat = jornada.latitudeReferencia;
      lon = jornada.longitudeReferencia;
      raio = jornada.raioMetros;
      origem = 'jornada';
    } else {
      const empregador = await this.prisma.empregador.findFirst({
        where: { principal: true },
        select: {
          latitudeReferencia: true,
          longitudeReferencia: true,
          raioMetros: true,
        },
      });
      if (
        empregador?.latitudeReferencia != null &&
        empregador?.longitudeReferencia != null &&
        empregador?.raioMetros != null
      ) {
        lat = empregador.latitudeReferencia;
        lon = empregador.longitudeReferencia;
        raio = empregador.raioMetros;
        origem = 'unidade';
      }
    }

    if (lat == null || lon == null || raio == null) return;

    if (latitude == null || longitude == null) {
      throw new BadRequestException(
        origem === 'jornada'
          ? 'Sua jornada exige geolocalização para registrar o ponto. Habilite o GPS.'
          : 'A unidade exige geolocalização para registrar o ponto. Habilite o GPS.',
      );
    }

    const distancia = this.distanciaMetros(lat, lon, latitude, longitude);
    if (distancia > raio) {
      const alvo = origem === 'jornada' ? 'do seu local de trabalho cadastrado' : 'da unidade';
      throw new BadRequestException(
        `Você está a ${Math.round(distancia)}m ${alvo} (limite: ${raio}m). Aproxime-se do local correto para registrar o ponto.`,
      );
    }
  }

  async baterPonto(
    usuarioId: number,
    dto: BaterPontoDto,
    foto: Express.Multer.File | undefined,
    ip?: string,
  ) {
    const { inicio, fim } = this.boundsHoje();
    const agora = new Date();

    await this.jornadaService.assertPodeBaterPontoComoColaborador(usuarioId);

    // Lock retroativo: a competência do dia da batida não pode estar fechada.
    await assertCompetenciaAbertaPorData(this.prisma, usuarioId, agora);

    // Bloqueio durante férias aprovadas que cubram hoje.
    const feriasAtivas = await this.prisma.feriasSolicitacao.findFirst({
      where: {
        usuarioId,
        status: 'APROVADO',
        dataInicio: { lte: agora },
        dataFim: { gte: agora },
      },
      select: { id: true, dataInicio: true, dataFim: true },
    });
    if (feriasAtivas) {
      throw new ConflictException(
        `Você está em férias aprovadas até ${feriasAtivas.dataFim.toLocaleDateString('pt-BR')}; não é possível bater ponto neste período.`,
      );
    }

    // Geocerca: jornada do usuário (se configurada) > unidade.
    await this.validarGeocerca(usuarioId, dto.latitude, dto.longitude);

    const batidasHoje = await this.prisma.registroPonto.findMany({
      where: {
        usuarioId,
        dataHora: { gte: inicio, lt: fim },
      },
      orderBy: { dataHora: 'asc' },
    });

    // Múltiplas batidas/dia: alterna ENTRADA/SAIDA com base na última.
    // Limite suave de 8 batidas/dia para evitar abuso (4 pares: manhã/almoço/tarde/extra).
    if (batidasHoje.length >= 8) {
      throw new ConflictException(
        'Limite de 8 batidas/dia atingido. Solicite ajuste ao RH se for necessário.',
      );
    }
    const ultima = batidasHoje[batidasHoje.length - 1];
    const tipo: TipoBatida =
      !ultima
        ? TipoBatida.ENTRADA
        : ultima.tipo === TipoBatida.ENTRADA
          ? TipoBatida.SAIDA
          : TipoBatida.ENTRADA;
    // Anexos protegidos (LGPD): selfie do ponto também passa pelo guard.
    const fotoUrl = foto ? `/uploads-protegido/ponto/${foto.filename}` : null;

    return this.criarRegistroComCadeia({
      usuarioId,
      tipo,
      dataHora: agora,
      origem: OrigemPonto.NORMAL,
      latitude: dto.latitude,
      longitude: dto.longitude,
      precisaoGps: dto.precisaoGps,
      fotoUrl,
      ip: ip ?? null,
      observacao: dto.observacao?.trim() || null,
    });
  }

  /**
   * Cria um RegistroPonto reservando NSR e calculando o hash encadeado em
   * transação serializável — base do REP-P (Portaria 671/2021).
   */
  private async criarRegistroComCadeia(input: {
    usuarioId: number;
    tipo: TipoBatida;
    dataHora: Date;
    origem: OrigemPonto;
    latitude?: number | null;
    longitude?: number | null;
    precisaoGps?: number | null;
    fotoUrl?: string | null;
    ip?: string | null;
    observacao?: string | null;
    ajustadoPorId?: number | null;
    justificativa?: string | null;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        const nsr = await reservarProximoNsr(tx);
        const hashAnterior = await obterUltimoHashCadeia(tx);
        const hashAtual = calcularHashAtual({
          nsr,
          usuarioId: input.usuarioId,
          tipo: input.tipo,
          dataHora: input.dataHora,
          origem: input.origem,
          hashAnterior,
        });
        const comprovanteId = gerarComprovanteId();

        return tx.registroPonto.create({
          data: {
            usuarioId: input.usuarioId,
            tipo: input.tipo,
            dataHora: input.dataHora,
            origem: input.origem,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
            precisaoGps: input.precisaoGps ?? null,
            fotoUrl: input.fotoUrl ?? null,
            ip: input.ip ?? null,
            observacao: input.observacao ?? null,
            ajustadoPorId: input.ajustadoPorId ?? null,
            justificativa: input.justificativa ?? null,
            ajustadoEm: input.ajustadoPorId ? new Date() : null,
            nsr,
            hashAnterior,
            hashAtual,
            comprovanteId,
          },
          include: registroInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /** Retorna o status do dia corrente do próprio usuário. */
  async statusHoje(usuarioId: number) {
    await this.jornadaService.ensure(usuarioId);
    const j = await this.prisma.jornadaTrabalho.findUnique({
      where: { usuarioId },
      select: { controlePonto: true },
    });
    if (j && j.controlePonto === false) {
      const temHistorico = await this.prisma.registroPonto.findFirst({
        where: { usuarioId },
        select: { id: true },
      });
      if (temHistorico) {
        return {
          dispensadoControlePonto: true as const,
          entrada: null,
          saida: null,
          proximaBatida: null,
          concluido: true,
          batidasHoje: [] as Array<{ id: number; tipo: TipoBatida; dataHora: Date; fotoUrl: string | null }>,
          almoco: {
            automatico: true,
            inicio: '12:00',
            fim: '13:00',
            descontoMin: null as number | null,
            saidaAutomatica: null as string | null,
            voltaAutomatica: null as string | null,
            saidaManual: null as { id: number; dataHora: Date } | null,
            voltaManual: null as { id: number; dataHora: Date } | null,
          },
        };
      }
    }

    const { inicio, fim } = this.boundsHoje();

    const batidas = await this.prisma.registroPonto.findMany({
      where: { usuarioId, dataHora: { gte: inicio, lt: fim } },
      orderBy: { dataHora: 'asc' },
    });

    const entrada = batidas.find((b) => b.tipo === TipoBatida.ENTRADA) ?? null;
    // No fluxo de almoço manual a "saída do dia" é a última SAÍDA registrada (4ª batida).
    const saida =
      [...batidas].reverse().find((b) => b.tipo === TipoBatida.SAIDA) ?? null;

    const jornada = await this.jornadaService.ensure(usuarioId);
    const jAlm = jornada as unknown as JornadaFatiaAlmoco;
    const almocoAutomatico = jAlm.almocoAutomatico !== false;

    let almocoDescontoMin: number | null = null;
    let almocoSaidaAutomatica: string | null = null;
    let almocoVoltaAutomatica: string | null = null;
    if (almocoAutomatico && entrada && saida) {
      const almoco = computeAlmocoDoDia(
        inicio,
        new Date(entrada.dataHora),
        new Date(saida.dataHora),
        jAlm,
      );
      if (almoco.deductMin > 0) {
        almocoDescontoMin = almoco.deductMin;
        almocoSaidaAutomatica = almoco.lunchStart!.toISOString();
        almocoVoltaAutomatica = almoco.lunchEnd!.toISOString();
      } else {
        almocoDescontoMin = 0;
      }
    }

    // Fluxo manual: 4 batidas/dia em ordem cronológica → E1 / S1 (saída almoço) / E2 (volta almoço) / S2.
    const saidaAlmocoManual =
      !almocoAutomatico && batidas.length >= 2 && batidas[1].tipo === TipoBatida.SAIDA
        ? batidas[1]
        : null;
    const voltaAlmocoManual =
      !almocoAutomatico && batidas.length >= 3 && batidas[2].tipo === TipoBatida.ENTRADA
        ? batidas[2]
        : null;

    let proximaBatida: TipoBatida | null;
    let concluido: boolean;
    if (almocoAutomatico) {
      proximaBatida = !entrada ? TipoBatida.ENTRADA : !saida ? TipoBatida.SAIDA : null;
      concluido = !!entrada && !!saida;
    } else if (batidas.length === 0) {
      proximaBatida = TipoBatida.ENTRADA;
      concluido = false;
    } else if (batidas.length >= 4) {
      proximaBatida = null;
      concluido = true;
    } else {
      const ultima = batidas[batidas.length - 1];
      proximaBatida =
        ultima.tipo === TipoBatida.ENTRADA ? TipoBatida.SAIDA : TipoBatida.ENTRADA;
      concluido = false;
    }

    return {
      entrada: entrada
        ? {
            id: entrada.id,
            dataHora: entrada.dataHora,
            fotoUrl: entrada.fotoUrl,
          }
        : null,
      saida: saida ? { id: saida.id, dataHora: saida.dataHora, fotoUrl: saida.fotoUrl } : null,
      proximaBatida,
      concluido,
      batidasHoje: batidas.map((b) => ({
        id: b.id,
        tipo: b.tipo,
        dataHora: b.dataHora,
        fotoUrl: b.fotoUrl,
      })),
      almoco: {
        automatico: almocoAutomatico,
        inicio: jAlm.almocoInicio ?? '12:00',
        fim: jAlm.almocoFim ?? '13:00',
        descontoMin: almocoDescontoMin,
        saidaAutomatica: almocoSaidaAutomatica,
        voltaAutomatica: almocoVoltaAutomatica,
        saidaManual: saidaAlmocoManual
          ? { id: saidaAlmocoManual.id, dataHora: saidaAlmocoManual.dataHora }
          : null,
        voltaManual: voltaAlmocoManual
          ? { id: voltaAlmocoManual.id, dataHora: voltaAlmocoManual.dataHora }
          : null,
      },
    };
  }

  // ---------- Histórico ----------

  /** Histórico do próprio colaborador. */
  async listarMeus(usuarioId: number, filtros: ListarPontoDto) {
    const { inicio, fim } = this.bounds(filtros.inicio, filtros.fim);
    return this.prisma.registroPonto.findMany({
      where: { usuarioId, dataHora: { gte: inicio, lte: fim } },
      orderBy: { dataHora: 'desc' },
      include: registroInclude,
    });
  }

  /** Listagem geral para RH/admin (filtra por usuario/período). */
  async listarTodos(filtros: ListarPontoDto) {
    const { inicio, fim } = this.bounds(filtros.inicio, filtros.fim);
    return this.prisma.registroPonto.findMany({
      where: {
        dataHora: { gte: inicio, lte: fim },
        ...(filtros.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
      },
      orderBy: [{ dataHora: 'desc' }, { id: 'desc' }],
      include: registroInclude,
    });
  }

  // ---------- Ajustes manuais (RH) ----------

  async criarAjuste(adminUserId: number, dto: CriarAjustePontoDto) {
    const dataHora = new Date(dto.dataHora);
    if (Number.isNaN(dataHora.getTime())) {
      throw new BadRequestException('dataHora inválida.');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: dto.usuarioId },
      select: { id: true },
    });
    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    // Lock retroativo: ajustes em mês fechado exigem reabertura prévia.
    await assertCompetenciaAbertaPorData(this.prisma, dto.usuarioId, dataHora);

    await this.jornadaService.habilitarControlePontoParaRegistroRh(dto.usuarioId);

    return this.criarRegistroComCadeia({
      usuarioId: dto.usuarioId,
      tipo: dto.tipo,
      dataHora,
      origem: OrigemPonto.AJUSTE_RH,
      observacao: dto.observacao?.trim() || null,
      ajustadoPorId: adminUserId,
      justificativa: dto.justificativa.trim(),
    });
  }

  /**
   * REP-P (Portaria 671/2021): batidas NORMAL são imutáveis. Para qualquer
   * registro (NORMAL ou AJUSTE_RH), `dataHora`/`tipo` não podem ser alterados —
   * isso quebraria a cadeia de hashes. Permitimos apenas atualizar metadados
   * (justificativa, observação) e somente em registros AJUSTE_RH.
   */
  async editar(adminUserId: number, id: number, dto: EditarPontoDto) {
    const existente = await this.prisma.registroPonto.findUnique({ where: { id } });
    if (!existente) {
      throw new NotFoundException('Registro de ponto não encontrado.');
    }

    if (existente.origem === OrigemPonto.NORMAL) {
      throw new ForbiddenException(
        'Batidas NORMAL são imutáveis (Portaria 671/2021). Para corrigir, crie um ajuste retroativo (AJUSTE_RH) com justificativa.',
      );
    }

    if (dto.dataHora || dto.tipo) {
      throw new ForbiddenException(
        'Não é permitido alterar dataHora/tipo de uma batida (quebra a cadeia de hashes). Crie um novo ajuste e marque o anterior como cancelado na justificativa.',
      );
    }

    await assertCompetenciaAbertaPorData(this.prisma, existente.usuarioId, existente.dataHora);

    return this.prisma.registroPonto.update({
      where: { id },
      data: {
        observacao:
          typeof dto.observacao === 'undefined' ? undefined : dto.observacao?.trim() || null,
        ajustadoPorId: adminUserId,
        justificativa: dto.justificativa.trim(),
        ajustadoEm: new Date(),
      },
      include: registroInclude,
    });
  }

  /**
   * Exclui um registro dentro de competência aberta, com justificativa obrigatória.
   * Atualiza o registro com `[EXCLUSÃO]` antes do delete para rastro no banco.
   *
   * Inclui batidas `NORMAL`: a cadeia REP-P (NSR/hash) pode ficar semanticamente
   * inconsistente para registros posteriores que apontavam para este hash; o uso
   * é administrativo (correção de duplicidade, erro de batida etc.).
   */
  async remover(adminUserId: number, id: number, dto: RemoverPontoDto) {
    const existente = await this.prisma.registroPonto.findUnique({ where: { id } });
    if (!existente) {
      throw new NotFoundException('Registro de ponto não encontrado.');
    }

    await assertCompetenciaAbertaPorData(this.prisma, existente.usuarioId, existente.dataHora);

    // Persistimos a justificativa antes de excluir para auditoria no log do banco.
    await this.prisma.registroPonto.update({
      where: { id },
      data: {
        ajustadoPorId: adminUserId,
        justificativa: `[EXCLUSÃO] ${dto.justificativa.trim()}`,
        ajustadoEm: new Date(),
      },
    });

    this.removerFotoFisica(existente.fotoUrl);

    await this.prisma.registroPonto.delete({ where: { id } });

    return { ok: true };
  }

  /** Dados completos de um registro para emissão de comprovante. */
  async obterComprovante(id: number) {
    const registro = await this.prisma.registroPonto.findUnique({
      where: { id },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            cpf: true,
          },
        },
      },
    });
    if (!registro) {
      throw new NotFoundException('Registro de ponto não encontrado.');
    }
    const empregador = await this.prisma.empregador.findFirst({
      where: { principal: true },
      orderBy: { id: 'asc' },
    });
    return { registro, empregador };
  }

  /** Acesso público pelo comprovanteId (para QR-code de conferência). */
  async obterComprovantePorPublicId(comprovanteId: string) {
    const registro = await this.prisma.registroPonto.findUnique({
      where: { comprovanteId },
      include: {
        usuario: {
          select: { id: true, nome: true, cpf: true },
        },
      },
    });
    if (!registro) {
      throw new NotFoundException('Comprovante não encontrado.');
    }
    const empregador = await this.prisma.empregador.findFirst({
      where: { principal: true },
      orderBy: { id: 'asc' },
    });
    return { registro, empregador };
  }

  /**
   * Sincroniza um lote de batidas offline (mobile).
   *
   * Regras:
   *  - O `dataHoraCliente` é preservado se estiver dentro de [now-24h, now+5min].
   *    Fora dessa janela, usa `now()` e adiciona alerta na observação.
   *  - Se a competência da `dataHoraCliente` estiver fechada, descarta o item
   *    (retornando como falha — o cliente deve reabrir solicitação manual).
   *  - Geocerca aplicada a cada item.
   *  - Cada batida usa o helper de cadeia (NSR + hash) e é numerada conforme
   *    sua chegada ao servidor (ordem cronológica do array recebido).
   */
  async baterBatch(
    usuarioId: number,
    items: Array<{
      dataHoraCliente: string;
      latitude: number;
      longitude: number;
      precisaoGps?: number;
      observacao?: string;
      clienteId?: string;
      fotoBase64?: string;
    }>,
    ip?: string,
  ): Promise<{
    sucessos: Array<{ clienteId?: string; registroId: number; nsr: number | null }>;
    falhas: Array<{ clienteId?: string; motivo: string }>;
  }> {
    const sucessos: Array<{ clienteId?: string; registroId: number; nsr: number | null }> = [];
    const falhas: Array<{ clienteId?: string; motivo: string }> = [];
    try {
      await this.jornadaService.assertPodeBaterPontoComoColaborador(usuarioId);
    } catch (e: unknown) {
      const motivo = e instanceof ForbiddenException ? e.message : 'Não é possível registrar ponto.';
      for (const item of items) {
        falhas.push({ clienteId: item.clienteId, motivo });
      }
      return { sucessos, falhas };
    }
    const now = Date.now();
    const ordenado = [...items].sort(
      (a, b) =>
        new Date(a.dataHoraCliente).getTime() - new Date(b.dataHoraCliente).getTime(),
    );

    for (const item of ordenado) {
      try {
        const tCliente = new Date(item.dataHoraCliente);
        if (Number.isNaN(tCliente.getTime())) {
          throw new BadRequestException('dataHoraCliente inválida.');
        }
        const diff = now - tCliente.getTime();
        const dentroJanela = diff >= -5 * 60 * 1000 && diff <= 24 * 60 * 60 * 1000;
        const dataHora = dentroJanela ? tCliente : new Date();
        const obsExtra = dentroJanela
          ? ''
          : ' [SYNC] horário do cliente fora da janela aceitável; usado o do servidor.';

        await assertCompetenciaAbertaPorData(this.prisma, usuarioId, dataHora);
        await this.validarGeocerca(usuarioId, item.latitude, item.longitude);

        const ultimaHoje = await this.prisma.registroPonto.findFirst({
          where: {
            usuarioId,
            dataHora: {
              gte: new Date(dataHora.getFullYear(), dataHora.getMonth(), dataHora.getDate()),
              lt: new Date(dataHora.getFullYear(), dataHora.getMonth(), dataHora.getDate() + 1),
            },
          },
          orderBy: { dataHora: 'desc' },
        });
        const tipo: TipoBatida = !ultimaHoje
          ? TipoBatida.ENTRADA
          : ultimaHoje.tipo === TipoBatida.ENTRADA
            ? TipoBatida.SAIDA
            : TipoBatida.ENTRADA;

        const reg = await this.criarRegistroComCadeia({
          usuarioId,
          tipo,
          dataHora,
          origem: OrigemPonto.NORMAL,
          latitude: item.latitude,
          longitude: item.longitude,
          precisaoGps: item.precisaoGps,
          fotoUrl: this.salvarFotoBase64NoPonto(item.fotoBase64),
          ip: ip ?? null,
          observacao: ((item.observacao ?? '') + obsExtra).trim() || null,
        });
        sucessos.push({
          clienteId: item.clienteId,
          registroId: reg.id,
          nsr: reg.nsr ?? null,
        });
      } catch (e: unknown) {
        const motivo = e instanceof Error ? e.message : 'Erro desconhecido';
        falhas.push({ clienteId: item.clienteId, motivo });
      }
    }
    return { sucessos, falhas };
  }

  /** Re-exposto para uso por outros services (ex.: SolicitacoesService). */
  async criarRegistroAjustePelaSolicitacao(input: {
    usuarioId: number;
    tipo: TipoBatida;
    dataHora: Date;
    ajustadoPorId: number;
    justificativa: string;
  }) {
    await assertCompetenciaAbertaPorData(this.prisma, input.usuarioId, input.dataHora);
    await this.jornadaService.habilitarControlePontoParaRegistroRh(input.usuarioId);
    return this.criarRegistroComCadeia({
      usuarioId: input.usuarioId,
      tipo: input.tipo,
      dataHora: input.dataHora,
      origem: OrigemPonto.AJUSTE_RH,
      ajustadoPorId: input.ajustadoPorId,
      justificativa: input.justificativa,
    });
  }

  /**
   * Renderiza o comprovante REP-P em HTML imprimível.
   * O QR-code aponta para `/rh/comprovante/conferir/:comprovanteId` (rota pública)
   * para verificação por terceiros (fiscal/colaborador) sem precisar de JWT.
   */
  renderComprovanteHtml(
    dados:
      | Awaited<ReturnType<PontoService['obterComprovante']>>
      | Awaited<ReturnType<PontoService['obterComprovantePorPublicId']>>,
    opts: { conferencia?: boolean } = {},
  ): string {
    const r = dados.registro;
    const e = dados.empregador;
    const baseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    const qrTarget =
      r.comprovanteId && baseUrl
        ? `${baseUrl}/rh/comprovante/conferir/${r.comprovanteId}`
        : r.comprovanteId
          ? `/rh/comprovante/conferir/${r.comprovanteId}`
          : '';
    const qrImg = qrTarget
      ? `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrTarget)}`
      : '';

    const fmtDate = (d: Date) =>
      new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
    const cpfFmt = (cpf?: string | null) => {
      if (!cpf) return '—';
      const digits = cpf.replace(/\D/g, '');
      if (digits.length !== 11) return cpf;
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    };
    const cnpjFmt = (id?: string | null) => {
      if (!id) return '—';
      const digits = id.replace(/\D/g, '');
      if (digits.length !== 14) return id;
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
    };

    const titulo = opts.conferencia ? 'Conferência de comprovante' : 'Comprovante de Marcação de Ponto';

    return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8" />
<title>${titulo} #${r.id}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; max-width: 720px; margin: 32px auto; padding: 0 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 16px 0 8px; color: #444; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 4px 0; vertical-align: top; }
  td.label { width: 38%; color: #555; }
  .hash { font-family: ui-monospace, Consolas, monospace; font-size: 11px; word-break: break-all; }
  .qr { float: right; margin-left: 16px; text-align: center; }
  .qr img { display: block; }
  .qr small { display: block; color: #666; font-size: 10px; margin-top: 4px; }
  .footer { margin-top: 24px; font-size: 11px; color: #666; border-top: 1px dashed #ccc; padding-top: 8px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #eef; color: #225; font-size: 11px; }
</style>
</head>
<body>
${qrImg ? `<div class="qr"><img alt="QR" src="${qrImg}" /><small>QR p/ conferência</small></div>` : ''}
<h1>${titulo}</h1>
<div><span class="badge">Portaria MTE 671/2021 — REP-P</span></div>

<h2>Empregador</h2>
<table>
  <tr><td class="label">Razão social</td><td>${e?.razaoSocial ?? '—'}</td></tr>
  <tr><td class="label">CNPJ/CEI</td><td>${cnpjFmt(e?.identificador)}${e?.cei ? ` · CEI ${e.cei}` : ''}</td></tr>
  <tr><td class="label">Endereço</td><td>${e?.endereco ?? '—'}</td></tr>
</table>

<h2>Colaborador</h2>
<table>
  <tr><td class="label">Nome</td><td>${r.usuario.nome}</td></tr>
  <tr><td class="label">CPF</td><td>${cpfFmt(r.usuario.cpf)}</td></tr>
</table>

<h2>Marcação</h2>
<table>
  <tr><td class="label">NSR</td><td><b>${r.nsr ?? '—'}</b></td></tr>
  <tr><td class="label">Tipo</td><td>${r.tipo}</td></tr>
  <tr><td class="label">Data/Hora</td><td>${fmtDate(r.dataHora)}</td></tr>
  <tr><td class="label">Origem</td><td>${r.origem}</td></tr>
  <tr><td class="label">Hash atual</td><td class="hash">${r.hashAtual ?? '—'}</td></tr>
  <tr><td class="label">Hash anterior</td><td class="hash">${r.hashAnterior ?? '(primeiro registro)'}</td></tr>
  <tr><td class="label">Comprovante ID</td><td class="hash">${r.comprovanteId ?? '—'}</td></tr>
</table>

<div class="footer">
  Documento gerado automaticamente pelo sistema. A integridade é garantida pela cadeia de hashes
  (cada registro depende do anterior). Use o QR-code para conferência pública.
</div>
</body></html>`;
  }

  /**
   * Lista RegistrosPonto + ajustes para AFD (Portaria 671/2021).
   * Filtros por NSR (faixa) ou data (faixa). Inclui dados do colaborador para CPF.
   */
  async listarParaAfd(filtros: {
    inicio?: string;
    fim?: string;
    nsrInicial?: number;
    nsrFinal?: number;
  }) {
    const where: Prisma.RegistroPontoWhereInput = {};
    if (filtros.nsrInicial !== undefined || filtros.nsrFinal !== undefined) {
      where.nsr = {};
      if (filtros.nsrInicial !== undefined) (where.nsr as { gte?: number }).gte = filtros.nsrInicial;
      if (filtros.nsrFinal !== undefined) (where.nsr as { lte?: number }).lte = filtros.nsrFinal;
    } else {
      const now = new Date();
      const start = filtros.inicio
        ? new Date(filtros.inicio)
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const end = filtros.fim
        ? new Date(filtros.fim)
        : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      where.dataHora = { gte: start, lte: end };
    }
    return this.prisma.registroPonto.findMany({
      where,
      orderBy: [{ nsr: 'asc' }, { id: 'asc' }],
      include: {
        usuario: { select: { id: true, nome: true, cpf: true } },
        ajustadoPor: { select: { id: true, nome: true } },
      },
    });
  }

  // ---------- Exportação CSV ----------

  /** Gera string CSV com os registros do período (sem dependências externas). */
  async exportarCsv(filtros: ListarPontoDto): Promise<string> {
    const registros = await this.listarTodos(filtros);

    const escape = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      if (/[",;\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = [
      'id',
      'usuarioId',
      'usuarioNome',
      'email',
      'tipo',
      'dataHora',
      'origem',
      'latitude',
      'longitude',
      'precisaoGps',
      'ip',
      'fotoUrl',
      'observacao',
      'ajustadoPor',
      'justificativa',
      'ajustadoEm',
    ];

    const linhas = registros.map((r) =>
      [
        r.id,
        r.usuarioId,
        r.usuario?.nome,
        r.usuario?.email,
        r.tipo,
        r.dataHora.toISOString(),
        r.origem,
        r.latitude ?? '',
        r.longitude ?? '',
        r.precisaoGps ?? '',
        r.ip ?? '',
        r.fotoUrl ?? '',
        r.observacao ?? '',
        r.ajustadoPor?.nome ?? '',
        r.justificativa ?? '',
        r.ajustadoEm ? r.ajustadoEm.toISOString() : '',
      ]
        .map(escape)
        .join(';'),
    );

    return [header.join(';'), ...linhas].join('\r\n');
  }
}
