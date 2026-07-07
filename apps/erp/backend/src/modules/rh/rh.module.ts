import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ComprovantePublicoController, PontoController } from './ponto/ponto.controller';
import { PontoService } from './ponto/ponto.service';
import { JornadaController } from './jornada/jornada.controller';
import { JornadaService } from './jornada/jornada.service';
import { EspelhoController } from './espelho/espelho.controller';
import { EspelhoService } from './espelho/espelho.service';
import { SolicitacoesController } from './solicitacoes/solicitacoes.controller';
import { SolicitacoesService } from './solicitacoes/solicitacoes.service';
import { BancoHorasController } from './banco-horas/banco-horas.controller';
import { BancoHorasService } from './banco-horas/banco-horas.service';
import { FeriasController } from './ferias/ferias.controller';
import { FeriasService } from './ferias/ferias.service';
import { FeriadosController } from './feriados/feriados.controller';
import { FeriadosService } from './feriados/feriados.service';
import { AfastamentosController } from './afastamentos/afastamentos.controller';
import { AfastamentosService } from './afastamentos/afastamentos.service';
import { DocumentosController } from './documentos/documentos.controller';
import { DocumentosService } from './documentos/documentos.service';
import { DesempenhoController } from './desempenho/desempenho.controller';
import { DesempenhoService } from './desempenho/desempenho.service';
import { TreinamentosController } from './treinamentos/treinamentos.controller';
import { TreinamentosService } from './treinamentos/treinamentos.service';
import { AnalyticsController } from './analytics/analytics.controller';
import { AnalyticsService } from './analytics/analytics.service';
import { EmpregadorController } from './empregador/empregador.controller';
import { EmpregadorService } from './empregador/empregador.service';
import { AfdController } from './afd/afd.controller';
import { AfdService } from './afd/afd.service';
import { RhCronService } from './cron/rh-cron.service';

/**
 * Módulo de RH. Agrupa os sub-recursos:
 * - Ponto eletrônico (Fase 0)
 * - Jornada, Espelho de Ponto, Solicitações de ajuste (Fase 1)
 * - Banco de Horas, Férias, Afastamentos, Documentos (Fase 2)
 * - Avaliação de Desempenho, Treinamentos, Analytics + Folha (Fase 3)
 */
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [
    PontoController,
    ComprovantePublicoController,
    JornadaController,
    EspelhoController,
    SolicitacoesController,
    BancoHorasController,
    FeriasController,
    FeriadosController,
    AfastamentosController,
    DocumentosController,
    DesempenhoController,
    TreinamentosController,
    AnalyticsController,
    EmpregadorController,
    AfdController,
  ],
  providers: [
    PontoService,
    JornadaService,
    EspelhoService,
    SolicitacoesService,
    BancoHorasService,
    FeriasService,
    FeriadosService,
    AfastamentosService,
    DocumentosService,
    DesempenhoService,
    TreinamentosService,
    AnalyticsService,
    EmpregadorService,
    AfdService,
    RhCronService,
  ],
  exports: [EspelhoService, JornadaService, FeriadosService, BancoHorasService],
})
export class RhModule {}
