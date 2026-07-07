import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CuradoriaController } from './curadoria.controller';
import { CuradoriaService } from './curadoria.service';

@Module({
  imports: [PrismaModule],
  controllers: [CuradoriaController],
  providers: [CuradoriaService],
})
export class CuradoriaModule {}

