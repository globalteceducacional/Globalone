import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PatentesDocumentosController } from './patentes-documentos.controller';
import { PatentesDocumentosService } from './patentes-documentos.service';

@Module({
  imports: [PrismaModule],
  controllers: [PatentesDocumentosController],
  providers: [PatentesDocumentosService],
  exports: [PatentesDocumentosService],
})
export class PatentesDocumentosModule {}
