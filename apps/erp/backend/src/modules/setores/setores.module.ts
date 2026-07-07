import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SetoresController } from './setores.controller';
import { SetoresService } from './setores.service';

@Module({
  imports: [PrismaModule],
  controllers: [SetoresController],
  providers: [SetoresService],
  exports: [SetoresService],
})
export class SetoresModule {}

