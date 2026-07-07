import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hasGlobalProjectsAccess, type ProjectAccessActor } from '../../common/utils/project-scope.util';
import * as XLSX from 'xlsx';
import { TasksService } from '../tasks/tasks.service';

interface ExcelProjectRow {
  nome?: string;
  resumo?: string;
  objetivo?: string;
  valorTotal?: number;
  supervisorEmail?: string;
  // Compatibilidade legado (ignorado no novo modelo: supervisor é o responsável único do projeto).
  responsaveisEmails?: string;
}

interface ExcelSessaoRow {
  projetoNome?: string;
  nome?: string;
  ordem?: number;
}

interface ExcelEtapaRow {
  projetoNome?: string;
  sessaoNome?: string;
  nome?: string;
  aba?: string;
  descricao?: string;
  dataInicio?: string;
  dataFim?: string;
  valorInsumos?: number;
  participantesEmails?: string;
  executorEmail?: string;
  responsavelEmail?: string;
  integrantesEmails?: string;
}

/** Planilhas novas usam Tarefas/Subtarefas e colunas tarefaTexto/subtarefaTexto; antigas Checklist/itemTexto. */
function rowTarefaTexto(r: Record<string, unknown>): string {
  const x = r as Record<string, unknown>;
  return String(x.tarefaTexto ?? x.itemTexto ?? '').trim();
}

function rowTarefaDescricao(r: Record<string, unknown>): string {
  const x = r as Record<string, unknown>;
  return String(x.tarefaDescricao ?? x.itemDescricao ?? '').trim();
}

function rowTarefaIntegrantesEmails(r: Record<string, unknown>): string {
  const x = r as Record<string, unknown>;
  return String(x.tarefaParticipantesEmails ?? x.tarefaIntegrantesEmails ?? x.itemIntegrantesEmails ?? '').trim();
}

function rowHasTarefaIntegrantesColumn(r: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(r, 'tarefaParticipantesEmails') ||
    Object.prototype.hasOwnProperty.call(r, 'itemIntegrantesEmails') ||
    Object.prototype.hasOwnProperty.call(r, 'tarefaIntegrantesEmails')
  );
}

function rowSubtarefaTexto(r: Record<string, unknown>): string {
  const x = r as Record<string, unknown>;
  return String(x.subtarefaTexto ?? x.subitemTexto ?? '').trim();
}

function rowSubtarefaDescricao(r: Record<string, unknown>): string {
  const x = r as Record<string, unknown>;
  return String(x.subtarefaDescricao ?? x.subitemDescricao ?? '').trim();
}

function clampPontosPlanilha(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(9999, Math.floor(n));
}

function rowTarefaPontos(r: Record<string, unknown>): number | undefined {
  const x = r as Record<string, unknown>;
  return clampPontosPlanilha(x.tarefaPontos ?? x.itemPontos ?? x.pontos);
}

function rowSubtarefaPontos(r: Record<string, unknown>): number | undefined {
  const x = r as Record<string, unknown>;
  return clampPontosPlanilha(x.subtarefaPontos ?? x.subitemPontos);
}

function pickSheetName(sheetNames: string[], ...candidates: string[]): string | null {
  for (const c of candidates) {
    if (sheetNames.includes(c)) return c;
  }
  return null;
}

/**
 * Converte valor de data vindo do Excel (número serial, string YYYY/MM/DD ou YYYY-MM-DD, ou Date)
 * para string ISO YYYY-MM-DD. Evita que número serial seja interpretado como timestamp Unix.
 */
function parseDateFromExcel(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number') {
    // Excel serial: 1 = 1900-01-01. 25569 = 1970-01-01 (Unix epoch)
    if (value < 1) return undefined;
    const date = new Date((value - 25569) * 86400 * 1000);
    if (isNaN(date.getTime())) return undefined;
    return date.toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return undefined;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return undefined;
  // YYYY/MM/DD ou YYYY-MM-DD
  const match = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (match) {
    const y = match[1];
    const m = match[2].padStart(2, '0');
    const d = match[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return undefined;
}

/**
 * Planilhas exportadas ou editadas no Excel costumam repetir o valor só na primeira linha
 * (células mescladas ou “preencher como” vazio). Replica o último valor não vazio por coluna.
 */
function forwardFillStrings(rows: Record<string, unknown>[], fields: string[]): Record<string, unknown>[] {
  const prev: Record<string, string> = Object.fromEntries(fields.map((f) => [f, '']));
  return rows.map((row) => {
    const out = { ...row };
    for (const f of fields) {
      const s = out[f] == null ? '' : String(out[f]).trim();
      if (s) prev[f] = s;
      else if (prev[f]) out[f] = prev[f];
    }
    return out;
  });
}

/** Mescla células vazias de projeto/etapa e repete tarefaTexto só dentro do mesmo par (projeto|etapa). */
function forwardFillSubtarefasRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const base = forwardFillStrings(rows, ['projetoNome', 'etapaNome']);
  let lastProjetoEtapaKey = '';
  let lastTarefaTexto = '';
  return base.map((row) => {
    const pn = String(row.projetoNome ?? '').trim();
    const en = String(row.etapaNome ?? '').trim();
    const key = `${pn}|${en}`;
    if (key !== lastProjetoEtapaKey) {
      lastProjetoEtapaKey = key;
      lastTarefaTexto = '';
    }
    const tt = rowTarefaTexto(row);
    if (tt) lastTarefaTexto = tt;
    const out = { ...row };
    if (!String(out.tarefaTexto ?? out.itemTexto ?? '').trim() && lastTarefaTexto) {
      out.tarefaTexto = lastTarefaTexto;
    }
    return out;
  });
}

@Injectable()
export class ProjectsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
  ) {}

  /** Resolve e-mails em IDs de usuário que são integrantes da etapa. */
  private async integrantesIdsFromEmails(
    emailsRaw: unknown,
    allowedIntegranteIds: Set<number>,
  ): Promise<number[]> {
    const s = emailsRaw == null ? '' : String(emailsRaw).trim();
    if (!s) return [];
    const emails = s
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const ids: number[] = [];
    for (const email of emails) {
      const u = await this.prisma.usuario.findFirst({
        where: { email },
        select: { id: true },
      });
      if (u && allowedIntegranteIds.has(u.id)) ids.push(u.id);
    }
    return [...new Set(ids)].sort((a, b) => a - b);
  }

  private async emailsFromIntegrantesIds(ids: number[]): Promise<string> {
    if (!ids.length) return '';
    const users = await this.prisma.usuario.findMany({
      where: { id: { in: ids } },
      select: { email: true },
      orderBy: { id: 'asc' },
    });
    return users.map((u) => u.email).join(', ');
  }

  async importFromExcel(fileBuffer: Buffer, actor: ProjectAccessActor) {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetNames = workbook.SheetNames;

      if (!sheetNames.includes('Projetos')) {
        throw new BadRequestException('A planilha deve conter uma aba chamada "Projetos"');
      }

      const projetosSheet = workbook.Sheets['Projetos'];
      const projetosData: ExcelProjectRow[] = XLSX.utils.sheet_to_json(projetosSheet);

      const projectMap = new Map<string, number>();

      if (projetosData.length > 0) {
        for (const projetoRow of projetosData) {
          if (!projetoRow.nome?.trim()) continue;

          const nomeProjeto = projetoRow.nome.trim();
          if (projectMap.has(nomeProjeto)) {
            throw new BadRequestException(
              `Dois projetos não podem ter o mesmo nome. Nome duplicado na planilha: "${nomeProjeto}".`,
            );
          }
          const existente = await this.prisma.projeto.findFirst({
            where: { nome: nomeProjeto },
            select: { id: true },
          });
          if (existente) {
            throw new BadRequestException(
              `Já existe um projeto com o nome "${nomeProjeto}" no sistema. Projetos não podem ter o mesmo nome. Use a aba Etapas para adicionar etapas a esse projeto.`,
            );
          }

          let supervisorId: number = actor.userId;
          if (projetoRow.supervisorEmail?.trim()) {
            const supervisor = await this.prisma.usuario.findFirst({
              where: { email: projetoRow.supervisorEmail.trim() },
            });
            if (!supervisor) {
              throw new BadRequestException(`Supervisor não encontrado: ${projetoRow.supervisorEmail}`);
            }
            supervisorId = supervisor.id;
          }

          const projeto = await this.prisma.projeto.create({
            data: {
              nome: projetoRow.nome.trim(),
              resumo: projetoRow.resumo?.trim() || null,
              objetivo: projetoRow.objetivo?.trim() || null,
              valorTotal: projetoRow.valorTotal ? Number(projetoRow.valorTotal) : 0,
              valorInsumos: 0,
              supervisor: { connect: { id: supervisorId } },
            },
          });
          projectMap.set(projeto.nome.trim(), projeto.id);
        }
      }

      // Mapa (projetoNome|sessaoNome) -> sessaoId para vincular etapas às sessões na importação
      const sessaoMap = new Map<string, number>();

      if (sheetNames.includes('Sessoes')) {
        const sessoesSheet = workbook.Sheets['Sessoes'];
        const sessoesData = forwardFillStrings(
          XLSX.utils.sheet_to_json(sessoesSheet) as Record<string, unknown>[],
          ['projetoNome'],
        ) as ExcelSessaoRow[];
        for (const row of sessoesData) {
          if (!row.projetoNome?.trim() || !row.nome?.trim()) continue;
          const projetoId = projectMap.get(row.projetoNome.trim());
          if (projetoId == null) continue;
          const ordem = row.ordem != null && !Number.isNaN(Number(row.ordem)) ? Number(row.ordem) : 0;
          const sessao = await this.prisma.sessao.create({
            data: { projetoId, nome: row.nome.trim(), ordem },
          });
          sessaoMap.set(`${row.projetoNome.trim()}|${row.nome.trim()}`, sessao.id);
        }
      }

      // Projetos sem nenhuma sessão na aba Sessoes: criar sessão "Geral" para cada um
      const projetosComSessao = new Set(Array.from(sessaoMap.keys()).map((k) => k.split('|')[0]));
      for (const [nomeProjeto, idProjeto] of projectMap) {
        if (projetosComSessao.has(nomeProjeto)) continue;
        const sessao = await this.prisma.sessao.create({
          data: { projetoId: idProjeto, nome: 'Geral', ordem: 0 },
        });
        sessaoMap.set(`${nomeProjeto}|Geral`, sessao.id);
      }

      const resultados: { projeto?: string; etapa?: string; id?: number; status: string }[] = [];

      const resolveProjectId = async (projetoNome: string): Promise<number | null> => {
        const nome = projetoNome?.trim();
        if (!nome) return null;
        const fromMap = projectMap.get(nome);
        if (fromMap != null) return fromMap;
        const existing = await this.prisma.projeto.findFirst({
          where: { nome },
          select: { id: true },
        });
        return existing?.id ?? null;
      };

      const etapaMap = new Map<string, number>();

      if (sheetNames.includes('Etapas')) {
        const etapasSheet = workbook.Sheets['Etapas'];
        const etapasDataRaw = XLSX.utils.sheet_to_json(etapasSheet) as Record<string, unknown>[];
        let lastProjetoNomeEtapas = '';
        let lastSessaoNomeEtapas = '';
        const etapasData: ExcelEtapaRow[] = [];
        for (const raw of etapasDataRaw) {
          const pn = String(raw.projetoNome ?? '').trim();
          if (pn) {
            if (lastProjetoNomeEtapas && pn !== lastProjetoNomeEtapas) lastSessaoNomeEtapas = '';
            lastProjetoNomeEtapas = pn;
          }
          const sn = String(raw.sessaoNome ?? '').trim();
          if (sn) lastSessaoNomeEtapas = sn;
          const sessaoFilled = lastSessaoNomeEtapas || String(raw.sessaoNome ?? '').trim() || undefined;
          etapasData.push({
            ...(raw as ExcelEtapaRow),
            projetoNome: (lastProjetoNomeEtapas || undefined) as string | undefined,
            sessaoNome: sessaoFilled,
          });
        }

        for (const etapaRow of etapasData) {
          if (!etapaRow.nome?.trim() || !etapaRow.projetoNome?.trim()) continue;

          const projetoId = await resolveProjectId(etapaRow.projetoNome);
          if (projetoId == null) {
            throw new BadRequestException(
              `Projeto não encontrado: "${etapaRow.projetoNome}". Crie o projeto na aba Projetos ou use o nome exato de um projeto já existente.`,
            );
          }

          // Novo modelo: participantesEmails. Compatibilidade: aceita executorEmail/integrantesEmails.
          const participantesIds: number[] = [];

          if (etapaRow.participantesEmails?.trim()) {
            const emails = etapaRow.participantesEmails
              .toString()
              .split(',')
              .map((e) => e.trim())
              .filter(Boolean);
            for (const email of emails) {
              const u = await this.prisma.usuario.findFirst({ where: { email } });
              if (u && !participantesIds.includes(u.id)) participantesIds.push(u.id);
            }
            if (participantesIds.length === 0) {
              throw new BadRequestException(
                `Nenhum participante válido encontrado em participantesEmails para a etapa "${etapaRow.nome?.trim() ?? ''}".`,
              );
            }
          } else {
            let executorIdLegacy: number = actor.userId;
            if (etapaRow.executorEmail?.trim()) {
              const executor = await this.prisma.usuario.findFirst({
                where: { email: etapaRow.executorEmail.trim() },
              });
              if (!executor) {
                throw new BadRequestException(`Executor não encontrado: ${etapaRow.executorEmail}`);
              }
              executorIdLegacy = executor.id;
            }

            participantesIds.push(executorIdLegacy);
            if (etapaRow.integrantesEmails) {
              const emails = etapaRow.integrantesEmails
                .toString()
                .split(',')
                .map((e) => e.trim())
                .filter(Boolean);
              for (const email of emails) {
                const u = await this.prisma.usuario.findFirst({ where: { email } });
                if (u && !participantesIds.includes(u.id)) participantesIds.push(u.id);
              }
            }
          }

          const executorId = participantesIds[0] ?? actor.userId;

          const sessaoNomeNorm = (etapaRow.sessaoNome ?? '').trim() || 'Geral';
          const sessaoId = sessaoMap.get(`${etapaRow.projetoNome!.trim()}|${sessaoNomeNorm}`) ?? undefined;

          const etapa = await this.tasksService.create(
            {
              projetoId,
              executorId,
              nome: etapaRow.nome.trim(),
              sessaoId,
              aba: etapaRow.aba?.trim(),
              descricao: etapaRow.descricao?.trim(),
              dataInicio: parseDateFromExcel(etapaRow.dataInicio) || undefined,
              dataFim: parseDateFromExcel(etapaRow.dataFim) || undefined,
              valorInsumos: etapaRow.valorInsumos ? Number(etapaRow.valorInsumos) : 0,
              checklist: undefined,
              integrantesIds: participantesIds.length > 0 ? participantesIds : undefined,
            },
            actor,
          );

          const key = `${etapaRow.projetoNome.trim()}|${etapaRow.nome.trim()}`;
          etapaMap.set(key, etapa.id);
          resultados.push({ projeto: etapaRow.projetoNome.trim(), etapa: etapaRow.nome.trim(), id: etapa.id, status: 'sucesso' });
        }
      }

      const resolveEtapaId = async (projetoNome: string, etapaNome: string): Promise<number | null> => {
        const key = `${projetoNome.trim()}|${etapaNome.trim()}`;
        const fromMap = etapaMap.get(key);
        if (fromMap != null) return fromMap;
        const projetoId = await resolveProjectId(projetoNome);
        if (projetoId == null) return null;
        const etapa = await this.prisma.etapa.findFirst({
          where: { projetoId, nome: etapaNome.trim() },
          select: { id: true },
        });
        return etapa?.id ?? null;
      };

      let checklistRowCount = 0;
      const tarefasSheet = pickSheetName(sheetNames, 'Tarefas', 'Checklist');
      if (tarefasSheet) {
        const checklistSheet = workbook.Sheets[tarefasSheet];
        const checklistData = forwardFillStrings(
          XLSX.utils.sheet_to_json(checklistSheet) as Record<string, unknown>[],
          ['projetoNome', 'etapaNome'],
        );
        checklistRowCount = checklistData.length;

        const subtarefasSheetName = pickSheetName(sheetNames, 'Subtarefas', 'ChecklistSubitens');
        const hasChecklistSubitens = subtarefasSheetName != null;
        const subitensByEtapa = new Map<string, Record<string, unknown>[]>();

        if (hasChecklistSubitens && subtarefasSheetName) {
          const subitensSheet = workbook.Sheets[subtarefasSheetName];
          const subitensData = forwardFillSubtarefasRows(
            XLSX.utils.sheet_to_json(subitensSheet) as Record<string, unknown>[],
          );
          checklistRowCount += subitensData.length;

          for (const row of subitensData) {
            const pn = String(row.projetoNome ?? '').trim();
            const en = String(row.etapaNome ?? '').trim();
            const tt = rowTarefaTexto(row);
            const st = rowSubtarefaTexto(row);
            if (!pn || !en || !tt || !st) {
              continue;
            }
            const key = `${pn}|${en}`;
            if (!subitensByEtapa.has(key)) subitensByEtapa.set(key, []);
            subitensByEtapa.get(key)!.push(row);
          }
        }

        const byEtapa = new Map<string, Record<string, unknown>[]>();
        for (const row of checklistData) {
          const pn = String(row.projetoNome ?? '').trim();
          const en = String(row.etapaNome ?? '').trim();
          const tt = rowTarefaTexto(row);
          if (!pn || !en || !tt) continue;
          const key = `${pn}|${en}`;
          if (!byEtapa.has(key)) byEtapa.set(key, []);
          byEtapa.get(key)!.push(row);
        }

        for (const [key, rows] of byEtapa) {
          const [projetoNome, etapaNome] = key.split('|');
          const etapaId = await resolveEtapaId(projetoNome, etapaNome);
          if (etapaId == null) {
            throw new BadRequestException(
              `Etapa não encontrada: projeto "${projetoNome}", etapa "${etapaNome}". Verifique os nomes na aba Etapas ou crie a etapa antes de importar as tarefas da etapa.`,
            );
          }

          const etapa = await this.prisma.etapa.findUnique({
            where: { id: etapaId },
            select: {
              checklistJson: true,
              integrantes: { select: { usuarioId: true } },
            },
          });
          const currentChecklist: any[] = Array.isArray(etapa?.checklistJson) ? etapa!.checklistJson : [];
          const allowedIntegranteIds = new Set(
            (etapa?.integrantes ?? []).map((i) => i.usuarioId),
          );

          const itensMap = new Map<string, any>();
          for (const item of currentChecklist) {
            const t = (item?.texto || '').trim() || `__${itensMap.size}`;
            const itemPts = clampPontosPlanilha(item?.pontos);
            const base: any = {
              texto: item?.texto || '',
              descricao: item?.descricao || '',
              concluido: Boolean(item?.concluido),
              ...(itemPts != null ? { pontos: itemPts } : {}),
              subitens: Array.isArray(item?.subitens)
                ? item.subitens.map((s: any) => {
                    const subPts = clampPontosPlanilha(s?.pontos);
                    return {
                      texto: s?.texto || '',
                      descricao: s?.descricao || '',
                      concluido: Boolean(s?.concluido),
                      ...(subPts != null ? { pontos: subPts } : {}),
                    };
                  })
                : [],
            };
            if (Array.isArray(item?.integrantesIds) && item.integrantesIds.length > 0) {
              base.integrantesIds = [
                ...new Set(
                  item.integrantesIds
                    .map((n: unknown) => Number(n))
                    .filter((n: number) => Number.isInteger(n) && n > 0 && allowedIntegranteIds.has(n)),
                ),
              ].sort((a: number, b: number) => a - b);
              if (base.integrantesIds.length === 0) delete base.integrantesIds;
            }
            itensMap.set(t, base);
          }

          // Processar tarefas (aba Tarefas ou Checklist)
          for (const row of rows) {
            const itemKey = rowTarefaTexto(row);
            const itemDesc = rowTarefaDescricao(row);
            const pontosDaLinha = rowTarefaPontos(row);
            if (!itensMap.has(itemKey)) {
              itensMap.set(itemKey, {
                texto: itemKey,
                descricao: itemDesc || '',
                concluido: false,
                subitens: [],
                ...(pontosDaLinha != null ? { pontos: pontosDaLinha } : {}),
              });
            } else if (itemDesc) {
              const existing = itensMap.get(itemKey);
              if (!existing.descricao) {
                existing.descricao = itemDesc;
              }
            }
            if (pontosDaLinha != null) {
              const ref = itensMap.get(itemKey);
              if (ref) ref.pontos = pontosDaLinha;
            }

            // Se NÃO existir aba Subtarefas/ChecklistSubitens, aceitar subtarefa na mesma aba
            if (!hasChecklistSubitens && rowSubtarefaTexto(row)) {
              const item = itensMap.get(itemKey);
              const sp = rowSubtarefaPontos(row);
              item.subitens.push({
                texto: rowSubtarefaTexto(row),
                descricao: rowSubtarefaDescricao(row) || '',
                concluido: false,
                ...(sp != null ? { pontos: sp } : {}),
              });
            }
          }

          // E-mails por tarefa: coluna ausente = não altera; presente e todas vazias = todos veem
          const itemKeysSeen = new Set<string>();
          for (const row of rows) {
            itemKeysSeen.add(rowTarefaTexto(row));
          }
          for (const itemKey of itemKeysSeen) {
            const rel = rows.filter((r) => rowTarefaTexto(r) === itemKey);
            const hasCol = rel.some((r) => rowHasTarefaIntegrantesColumn(r));
            if (!hasCol) continue;
            const firstNonEmpty = rel.map((r) => rowTarefaIntegrantesEmails(r)).find((s) => s.length > 0);
            const itemRef = itensMap.get(itemKey);
            if (!itemRef) continue;
            if (firstNonEmpty === undefined) {
              delete itemRef.integrantesIds;
            } else {
              const ids = await this.integrantesIdsFromEmails(
                firstNonEmpty,
                allowedIntegranteIds,
              );
              if (ids.length === 0) {
                delete itemRef.integrantesIds;
              } else {
                itemRef.integrantesIds = ids;
              }
            }
          }

          if (hasChecklistSubitens) {
            const subRows = subitensByEtapa.get(key) ?? [];
            for (const row of subRows) {
              const itemKey = rowTarefaTexto(row);
              if (!itensMap.has(itemKey)) {
                itensMap.set(itemKey, {
                  texto: itemKey,
                  descricao: '',
                  concluido: false,
                  subitens: [],
                });
              }
              const item = itensMap.get(itemKey);
              const sp = rowSubtarefaPontos(row);
              item.subitens.push({
                texto: rowSubtarefaTexto(row),
                descricao: rowSubtarefaDescricao(row) || '',
                concluido: false,
                ...(sp != null ? { pontos: sp } : {}),
              });
            }
          }

          const mergedChecklist = Array.from(itensMap.values());
          await this.tasksService.updateChecklistFromImport(etapaId, actor.userId, mergedChecklist);
        }
      }

      const totalProjetos = projectMap.size;
      const totalSessoes = sessaoMap.size;
      const totalEtapas = etapaMap.size;
      const msg: string[] = [];
      if (totalProjetos > 0) msg.push(`${totalProjetos} projeto(s) criado(s)`);
      if (totalSessoes > 0) msg.push(`${totalSessoes} sessão(ões) criada(s)`);
      if (totalEtapas > 0) msg.push(`${totalEtapas} etapa(s) criada(s)`);
      if (checklistRowCount > 0) msg.push('tarefas da etapa atualizadas');
      return {
        message: msg.length ? `Importação concluída: ${msg.join(', ')}.` : 'Nenhum dado para importar nas abas preenchidas.',
        resultados,
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Erro ao processar arquivo Excel: ${error.message}`);
    }
  }

  async exportToExcel(actor: ProjectAccessActor, projetoId?: number) {
    const where: Record<string, unknown> = {};
    if (projetoId != null) {
      where.id = projetoId;
    }
    if (!hasGlobalProjectsAccess(actor.permissions)) {
      where.supervisorId = actor.userId;
    }

    const projetos = await this.prisma.projeto.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        supervisor: true,
        responsaveis: { include: { usuario: true } },
        sessoes: { orderBy: { ordem: 'asc' } },
        etapas: {
          include: {
            sessao: true,
            executor: true,
            responsavel: true,
            integrantes: { include: { usuario: true } },
          },
        },
      },
    });

    if (projetoId != null && projetos.length === 0) {
      throw new NotFoundException('Projeto não encontrado');
    }

    const wb = XLSX.utils.book_new();

    // Aba Sessões (projetoNome, nome, ordem) — antes de Projetos para referência
    const sessoesRows: { projetoNome: string; nome: string; ordem: number }[] = [];
    for (const projeto of projetos) {
      const sessoes = (projeto as any).sessoes ?? [];
      for (const sessao of sessoes) {
        sessoesRows.push({
          projetoNome: projeto.nome,
          nome: sessao.nome,
          ordem: sessao.ordem ?? 0,
        });
      }
    }
    const sessoesHeaders = ['projetoNome', 'nome', 'ordem'];
    const sessoesSheet =
      sessoesRows.length > 0
        ? XLSX.utils.json_to_sheet(sessoesRows, { header: sessoesHeaders, skipHeader: false })
        : XLSX.utils.aoa_to_sheet([sessoesHeaders]);
    XLSX.utils.book_append_sheet(wb, sessoesSheet, 'Sessoes');

    // Aba Projetos (mesma estrutura da importação)
    const projetosRows = projetos.map((projeto) => ({
      nome: projeto.nome,
      resumo: projeto.resumo ?? '',
      objetivo: projeto.objetivo ?? '',
      valorTotal: projeto.valorTotal,
      supervisorEmail: projeto.supervisor?.email ?? '',
    }));
    const projetosHeaders = ['nome', 'resumo', 'objetivo', 'valorTotal', 'supervisorEmail'];
    const projetosSheet = XLSX.utils.json_to_sheet(projetosRows, {
      header: projetosHeaders,
      skipHeader: false,
    });
    XLSX.utils.book_append_sheet(wb, projetosSheet, 'Projetos');

    const etapasRows: any[] = [];
    const checklistItemRows: any[] = [];
    const checklistSubitemRows: any[] = [];

    for (const projeto of projetos) {
      for (const etapa of projeto.etapas as any[]) {
        etapasRows.push({
          projetoNome: projeto.nome,
          sessaoNome: etapa.sessao?.nome ?? '',
          nome: etapa.nome,
          aba: etapa.aba ?? '',
          descricao: etapa.descricao ?? '',
          dataInicio: etapa.dataInicio ? etapa.dataInicio.toISOString().slice(0, 10) : '',
          dataFim: etapa.dataFim ? etapa.dataFim.toISOString().slice(0, 10) : '',
          valorInsumos: etapa.valorInsumos,
          participantesEmails: (() => {
            const emails: string[] = [];
            if (etapa.executor?.email) emails.push(etapa.executor.email);
            if (Array.isArray(etapa.integrantes)) {
              for (const i of etapa.integrantes as any[]) {
                const email = i?.usuario?.email;
                if (email && !emails.includes(email)) emails.push(email);
              }
            }
            return emails.join(', ');
          })(),
        });

        if (Array.isArray(etapa.checklistJson)) {
          const checklist = etapa.checklistJson as Array<{
            texto?: string;
            descricao?: string;
            subitens?: Array<{ texto?: string; descricao?: string }>;
          }>;

          for (const item of checklist) {
            const itemTexto = (item.texto ?? '').trim();
            const itemDescricao = (item.descricao ?? '').trim();

            if (!itemTexto && (!item.subitens || item.subitens.length === 0)) {
              continue;
            }

            const rawIds = (item as { integrantesIds?: unknown }).integrantesIds;
            const idList = Array.isArray(rawIds)
              ? rawIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
              : [];
            const itemIntegrantesEmails =
              idList.length > 0 ? await this.emailsFromIntegrantesIds(idList) : '';

            const tarefaPontos =
              clampPontosPlanilha((item as { pontos?: unknown }).pontos) ?? 1;
            checklistItemRows.push({
              projetoNome: projeto.nome,
              etapaNome: etapa.nome,
              tarefaTexto: itemTexto,
              tarefaDescricao: itemDescricao,
              tarefaPontos,
              tarefaParticipantesEmails: itemIntegrantesEmails,
            });

            if (item.subitens && item.subitens.length > 0) {
              for (const sub of item.subitens) {
                const subTexto = (sub.texto ?? '').trim();
                if (!subTexto) continue;
                const subtarefaPontos =
                  clampPontosPlanilha((sub as { pontos?: unknown }).pontos) ?? 1;
                checklistSubitemRows.push({
                  projetoNome: projeto.nome,
                  etapaNome: etapa.nome,
                  tarefaTexto: itemTexto,
                  subtarefaTexto: subTexto,
                  subtarefaDescricao: (sub.descricao ?? '').trim(),
                  subtarefaPontos,
                });
              }
            }
          }
        }
      }
    }

    // Aba Etapas (mesma estrutura da importação; sessaoNome para vincular à sessão)
    const etapasHeaders = [
      'projetoNome',
      'sessaoNome',
      'nome',
      'aba',
      'descricao',
      'dataInicio',
      'dataFim',
      'valorInsumos',
      'participantesEmails',
    ];
    const etapasSheet = XLSX.utils.json_to_sheet(etapasRows, {
      header: etapasHeaders,
      skipHeader: false,
    });
    XLSX.utils.book_append_sheet(wb, etapasSheet, 'Etapas');

    const tarefasHeaders = [
      'projetoNome',
      'etapaNome',
      'tarefaTexto',
      'tarefaDescricao',
      'tarefaPontos',
      'tarefaParticipantesEmails',
    ];
    if (checklistItemRows.length > 0) {
      const tarefasSheet = XLSX.utils.json_to_sheet(checklistItemRows, {
        header: tarefasHeaders,
        skipHeader: false,
      });
      XLSX.utils.book_append_sheet(wb, tarefasSheet, 'Tarefas');
    } else {
      const emptyTarefasSheet = XLSX.utils.aoa_to_sheet([tarefasHeaders]);
      XLSX.utils.book_append_sheet(wb, emptyTarefasSheet, 'Tarefas');
    }

    const subtarefasHeaders = [
      'projetoNome',
      'etapaNome',
      'tarefaTexto',
      'subtarefaTexto',
      'subtarefaDescricao',
      'subtarefaPontos',
    ];
    let subtarefasSheet;
    if (checklistSubitemRows.length > 0) {
      subtarefasSheet = XLSX.utils.json_to_sheet(checklistSubitemRows, {
        header: subtarefasHeaders,
        skipHeader: false,
      });
    } else {
      subtarefasSheet = XLSX.utils.aoa_to_sheet([subtarefasHeaders]);
    }
    XLSX.utils.book_append_sheet(wb, subtarefasSheet, 'Subtarefas');

    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    return buffer;
  }
}
