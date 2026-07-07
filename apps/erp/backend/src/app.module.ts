import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CargosModule } from './modules/cargos/cargos.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { StockModule } from './modules/stock/stock.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OccurrencesModule } from './modules/occurrences/occurrences.module';
import { RequestsModule } from './modules/requests/requests.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CuradoriaModule } from './modules/curadoria/curadoria.module';
import { SetoresModule } from './modules/setores/setores.module';
import { GalpaoModule } from './modules/galpao/galpao.module';
import { CalendarioModule } from './modules/calendario/calendario.module';
import { HealthController } from './common/health.controller';
import { UploadsModule } from './modules/uploads/uploads.module';
import { RhModule } from './modules/rh/rh.module';
import { FinanceiroModule } from './modules/financeiro/financeiro.module';
import { DocumentosModule } from './modules/documentos/documentos.module';
import { PatentesDocumentosModule } from './modules/patentes-documentos/patentes-documentos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting global: max 200 req/min por IP (evita abuso de força bruta)
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60000,
        limit: 200,
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    CargosModule,
    ProjectsModule,
    TasksModule,
    StockModule,
    NotificationsModule,
    OccurrencesModule,
    RequestsModule,
    SuppliersModule,
    CategoriesModule,
    CuradoriaModule,
    SetoresModule,
    GalpaoModule,
    CalendarioModule,
    UploadsModule,
    RhModule,
    FinanceiroModule,
    DocumentosModule,
    PatentesDocumentosModule,
  ],
  controllers: [HealthController],
  providers: [
    // Aplicar rate limiting globalmente a todas as rotas
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
