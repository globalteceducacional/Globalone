import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploadsController } from './uploads.controller';
import { UploadsProtegidosController } from './uploads-protegidos.controller';

@Module({
  imports: [PrismaModule],
  controllers: [UploadsController, UploadsProtegidosController],
})
export class UploadsModule {}
