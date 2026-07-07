import { Module } from '@nestjs/common';
import { FinanceiroController } from './financeiro.controller';
import { FinanceiroService } from './financeiro.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RhModule } from '../rh/rh.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [PrismaModule, RhModule, ProjectsModule],
  controllers: [FinanceiroController],
  providers: [FinanceiroService],
})
export class FinanceiroModule {}
