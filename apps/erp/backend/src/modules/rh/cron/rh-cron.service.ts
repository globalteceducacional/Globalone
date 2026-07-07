import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificacaoTipo } from '@prisma/client';

/**
 * Job diário de alertas do RH:
 *  - Documentos do colaborador vencendo nos próximos 30 dias.
 *  - Treinamentos obrigatórios pendentes.
 *  - Saldo mensal negativo no fechamento próximo (penúltimo dia útil).
 *
 * Implementação leve via `setInterval`, evitando dependência de `@nestjs/schedule`.
 * O intervalo é diário; o serviço também expõe `executarAgora()` para chamadas manuais.
 */
@Injectable()
export class RhCronService {
  private readonly logger = new Logger(RhCronService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {
    if (process.env.RH_CRON_DISABLED === 'true') {
      this.logger.log('Job RH desabilitado por configuração (RH_CRON_DISABLED=true).');
      return;
    }
    const intervaloMs = 24 * 60 * 60 * 1000;
    // Primeira execução em 60s para esperar a aplicação subir.
    setTimeout(() => {
      this.executarAgora().catch((e) => this.logger.error('Falha no job inicial', e));
      this.timer = setInterval(() => {
        this.executarAgora().catch((e) => this.logger.error('Falha no job diário', e));
      }, intervaloMs);
    }, 60_000);
  }

  /** Chamada manual via /rh/cron/executar (expõe no controller se desejar). */
  async executarAgora(): Promise<{
    documentosVencendo: number;
    treinamentosPendentes: number;
    saldoNegativo: number;
  }> {
    const documentosVencendo = await this.alertarDocumentosVencendo();
    const treinamentosPendentes = await this.alertarTreinamentosPendentes();
    const saldoNegativo = await this.alertarSaldoNegativo();
    this.logger.log(
      `Job RH: docsVencendo=${documentosVencendo} treinPend=${treinamentosPendentes} saldoNeg=${saldoNegativo}`,
    );
    return { documentosVencendo, treinamentosPendentes, saldoNegativo };
  }

  private async alertarDocumentosVencendo(): Promise<number> {
    const hoje = new Date();
    const limite = new Date();
    limite.setDate(limite.getDate() + 30);
    const docs = await this.prisma.documentoColaborador.findMany({
      where: {
        dataValidade: { gte: hoje, lte: limite },
      },
      include: { usuario: { select: { id: true, nome: true } } },
    });
    let count = 0;
    for (const d of docs) {
      const diasRestantes = Math.ceil(
        (d.dataValidade!.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
      );
      await this.notifications
        .create({
          usuarioId: d.usuarioId,
          titulo: 'Documento vencendo',
          mensagem: `Seu documento "${d.titulo}" vence em ${diasRestantes} dia(s) (${d.dataValidade!.toLocaleDateString('pt-BR')}).`,
          tipo: NotificacaoTipo.WARNING,
        })
        .catch(() => undefined);
      count++;
    }
    return count;
  }

  private async alertarTreinamentosPendentes(): Promise<number> {
    // Sem schema rígido de obrigatoriedade — lemos `Treinamento` com participantes pendentes.
    try {
      const result = await this.prisma.$queryRawUnsafe<Array<{ usuarioId: number; titulo: string }>>(
        `SELECT tp."usuarioId" as "usuarioId", t."titulo" as "titulo"
         FROM "TreinamentoParticipante" tp
         JOIN "Treinamento" t ON t.id = tp."treinamentoId"
         WHERE tp."status" = 'PENDENTE'
           AND t."obrigatorio" = true`,
      );
      let count = 0;
      for (const row of result) {
        await this.notifications
          .create({
            usuarioId: row.usuarioId,
            titulo: 'Treinamento obrigatório pendente',
            mensagem: `Você possui o treinamento obrigatório "${row.titulo}" ainda pendente.`,
            tipo: NotificacaoTipo.WARNING,
          })
          .catch(() => undefined);
        count++;
      }
      return count;
    } catch {
      // Schema pode não ter colunas exatas — silencioso por compatibilidade.
      return 0;
    }
  }

  private async alertarSaldoNegativo(): Promise<number> {
    const hoje = new Date();
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const diaAtual = hoje.getDate();
    // Só dispara nos últimos 3 dias do mês.
    if (diaAtual < ultimoDia - 2) return 0;
    const competencia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const lancamentos = await this.prisma.bancoHorasLancamento.findMany({
      where: { competencia },
      select: { usuarioId: true, minutosCredito: true, minutosDebito: true },
    });
    const acumulado = new Map<number, number>();
    for (const l of lancamentos) {
      acumulado.set(
        l.usuarioId,
        (acumulado.get(l.usuarioId) ?? 0) + l.minutosCredito - l.minutosDebito,
      );
    }
    let count = 0;
    for (const [usuarioId, saldo] of acumulado.entries()) {
      if (saldo >= 0) continue;
      await this.notifications
        .create({
          usuarioId,
          titulo: 'Saldo do mês negativo',
          mensagem: `Seu saldo de banco de horas em ${competencia} está negativo (${saldo} min). Procure regularizar antes do fechamento.`,
          tipo: NotificacaoTipo.WARNING,
        })
        .catch(() => undefined);
      count++;
    }
    return count;
  }
}
