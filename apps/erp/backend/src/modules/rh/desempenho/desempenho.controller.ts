import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CicloAvaliacaoStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { DesempenhoService } from './desempenho.service';

@Controller('rh/desempenho')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DesempenhoController {
  constructor(private readonly service: DesempenhoService) {}

  // ─── Ciclos ─────────────────────────────────────────────────────────────

  @Get('ciclos')
  @Permissions('avaliacoes:gerenciar', 'avaliacoes:responder')
  ciclos() {
    return this.service.listarCiclos();
  }

  @Post('ciclos')
  @Permissions('avaliacoes:gerenciar')
  criarCiclo(
    @CurrentUser() user: { userId: number },
    @Body() dto: { nome: string; descricao?: string; dataInicio: string; dataFim: string; roteiroJson?: any },
  ) {
    return this.service.criarCiclo(user.userId, dto);
  }

  @Patch('ciclos/:id/status')
  @Permissions('avaliacoes:gerenciar')
  mudarStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: { status: CicloAvaliacaoStatus }) {
    return this.service.mudarStatusCiclo(id, dto.status);
  }

  @Post('ciclos/:id/distribuir')
  @Permissions('avaliacoes:gerenciar')
  distribuir(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { pares: { avaliadorId: number; avaliadoId: number }[] },
  ) {
    return this.service.distribuirAvaliacoes(id, dto.pares ?? []);
  }

  // ─── Avaliações do usuário ──────────────────────────────────────────────

  @Get('me')
  @Permissions('avaliacoes:responder', 'avaliacoes:gerenciar')
  minhas(@CurrentUser() user: { userId: number }) {
    return this.service.minhasAvaliacoes(user.userId);
  }

  @Post('avaliacoes/:id/responder')
  @Permissions('avaliacoes:responder')
  responder(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { respostasJson: any; notaFinal?: number; comentario?: string },
  ) {
    return this.service.responder(user.userId, id, dto);
  }

  // ─── Metas / PDI ────────────────────────────────────────────────────────

  @Get('metas/me')
  @Permissions('avaliacoes:responder', 'avaliacoes:gerenciar')
  minhasMetas(@CurrentUser() user: { userId: number }) {
    return this.service.listarMetas(user.userId);
  }

  @Get('metas/usuario/:usuarioId')
  @Permissions('avaliacoes:gerenciar')
  metasUsuario(@Param('usuarioId', ParseIntPipe) usuarioId: number) {
    return this.service.listarMetas(usuarioId);
  }

  @Post('metas/usuario/:usuarioId')
  @Permissions('avaliacoes:gerenciar')
  criarMeta(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Body() dto: { titulo: string; descricao?: string; peso?: number; prazo?: string },
  ) {
    return this.service.criarMeta(usuarioId, dto);
  }

  @Patch('metas/:id')
  @Permissions('avaliacoes:gerenciar')
  atualizarMeta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { titulo?: string; descricao?: string; peso?: number; status?: string; prazo?: string | null },
  ) {
    return this.service.atualizarMeta(id, dto);
  }

  @Delete('metas/:id')
  @Permissions('avaliacoes:gerenciar')
  removerMeta(@Param('id', ParseIntPipe) id: number) {
    return this.service.removerMeta(id);
  }
}
