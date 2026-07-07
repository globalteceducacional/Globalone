import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GalpaoController } from './galpao.controller';
import { GalpaoService } from './galpao.service';

@Module({
  imports: [PrismaModule],
  controllers: [GalpaoController],
  providers: [GalpaoService],
})
export class GalpaoModule {}

