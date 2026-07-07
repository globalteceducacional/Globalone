import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  ForbiddenException,
  Res,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ProjectsService } from './projects.service';
import { ProjectsImportService } from './projects-import.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateResponsiblesDto } from './dto/update-responsibles.dto';
import { ReorderEtapasDto } from './dto/reorder-etapas.dto';
import { DeleteAbaDto, RenameAbaDto } from './dto/update-aba.dto';
import { CreateSessaoDto } from './dto/create-sessao.dto';
import { UpdateSessaoDto } from './dto/update-sessao.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ProjetoStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import { join, extname } from 'path';
import { hasGlobalProjectsAccess, type ProjectAccessActor } from '../../common/utils/project-scope.util';
import { UPLOAD_LIMITS } from '../../common/constants/upload-limits';

type JwtUser = { userId: number; permissions?: string[] };

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly projectsImportService: ProjectsImportService,
  ) {}

  private projectActor(user: JwtUser): ProjectAccessActor {
    return { userId: user.userId, permissions: user.permissions ?? [] };
  }

  @Get('options')
  listOptions(
    @CurrentUser() user: JwtUser,
    @Query('todas') todas?: string,
  ) {
    const todasAtivo = todas === '1' || todas === 'true' || todas === 'sim';
    return this.projectsService.listOptions(this.projectActor(user), todasAtivo);
  }

  @Get()
  @Permissions('projetos:visualizar', 'projetos:editar', 'projetos:aprovar')
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('status') status?: ProjetoStatus,
    @Query('search') search?: string,
  ) {
    return this.projectsService.findAll({ status, search }, this.projectActor(user));
  }

  @Get('tasks-em-analise')
  @Permissions('projetos:visualizar', 'projetos:editar', 'projetos:aprovar', 'trabalhos:avaliar')
  findTasksEmAnalise(@CurrentUser() user: JwtUser) {
    return this.projectsService.findTasksEmAnaliseByProject(this.projectActor(user));
  }

  @Get('export')
  @Permissions('projetos:visualizar', 'projetos:editar', 'projetos:aprovar')
  async export(@Res() res: Response, @CurrentUser() user: JwtUser) {
    const buffer = await this.projectsImportService.exportToExcel(this.projectActor(user));
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="projetos.xlsx"',
    );
    res.send(buffer);
  }

  @Get(':id/export')
  @Permissions('projetos:visualizar', 'projetos:editar', 'projetos:aprovar')
  async exportOne(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
    @CurrentUser() user: JwtUser,
  ) {
    const buffer = await this.projectsImportService.exportToExcel(this.projectActor(user), id);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="projeto-${id}.xlsx"`,
    );
    res.send(buffer);
  }

  @Post(':id/sessoes')
  @Permissions('projetos:editar')
  createSessao(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateSessaoDto,
  ) {
    return this.projectsService.createSessao(id, body, this.projectActor(user));
  }

  @Patch(':id/sessoes/:sessaoId')
  @Permissions('projetos:editar')
  updateSessao(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('sessaoId', ParseIntPipe) sessaoId: number,
    @Body() body: UpdateSessaoDto,
  ) {
    return this.projectsService.updateSessao(id, sessaoId, body, this.projectActor(user));
  }

  @Delete(':id/sessoes/:sessaoId')
  @Permissions('projetos:editar')
  @HttpCode(204)
  deleteSessao(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('sessaoId', ParseIntPipe) sessaoId: number,
  ) {
    return this.projectsService.deleteSessao(id, sessaoId, this.projectActor(user));
  }

  @Get(':id')
  @Permissions(
    'projetos:visualizar',
    'projetos:editar',
    'projetos:aprovar',
    'trabalhos:registrar',
    'trabalhos:avaliar',
  )
  findOne(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findOne(id, this.projectActor(user));
  }

  @Post()
  @Permissions('projetos:criar')
  create(@CurrentUser() user: JwtUser, @Body() body: CreateProjectDto) {
    return this.projectsService.create(body, this.projectActor(user));
  }

  @Patch(':id')
  @Permissions('projetos:editar')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateProjectDto,
  ) {
    return this.projectsService.update(id, body, this.projectActor(user));
  }

  @Patch(':id/responsibles')
  @Permissions('projetos:editar')
  updateResponsibles(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateResponsiblesDto,
  ) {
    return this.projectsService.updateResponsibles(id, body, this.projectActor(user));
  }

  @Patch(':id/etapas/reorder')
  @Permissions('projetos:editar')
  reorderEtapas(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReorderEtapasDto,
  ) {
    return this.projectsService.reorderEtapas(id, body, this.projectActor(user));
  }

  @Patch(':id/abas/rename')
  @Permissions('projetos:editar')
  renameAba(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RenameAbaDto,
  ) {
    return this.projectsService.renameAba(id, body, this.projectActor(user));
  }

  @Patch(':id/abas/delete')
  @Permissions('projetos:editar')
  deleteAba(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: DeleteAbaDto,
  ) {
    return this.projectsService.deleteAba(id, body, this.projectActor(user));
  }

  @Patch(':id/finalize')
  @Permissions('projetos:editar', 'projetos:aprovar')
  finalize(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.projectsService.finalize(id, this.projectActor(user));
  }

  @Delete(':id')
  @Permissions('projetos:excluir')
  @HttpCode(204)
  remove(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.projectsService.remove(id, this.projectActor(user));
  }

  @Post('import')
  @Permissions('projetos:importar')
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não fornecido');
    }

    if (!hasGlobalProjectsAccess(user.permissions ?? [])) {
      throw new ForbiddenException(
        'Importação em massa exige a permissão projetos:ver_todos (ou sistema:administrar).',
      );
    }

    // Validar extensão do arquivo
    const allowedExtensions = ['.xlsx', '.xls'];
    const fileExtension = file.originalname
      .toLowerCase()
      .substring(file.originalname.lastIndexOf('.'));
    
    if (!allowedExtensions.includes(fileExtension)) {
      throw new BadRequestException('Formato de arquivo inválido. Use .xlsx ou .xls');
    }

    return this.projectsImportService.importFromExcel(file.buffer, this.projectActor(user));
  }
  /**
   * Novo fluxo de anexos de projeto:
   * - Upload já vincula diretamente no projeto (campo descricaoArquivos).
   * - O frontend NÃO precisa mais mandar descricaoArquivos no PATCH/POST do projeto.
   */

  @Post(':id/descricao-files')
  @Permissions('projetos:editar')
  @UseInterceptors(
    FilesInterceptor('files', UPLOAD_LIMITS.maxFilesPerRequest, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const baseDir = process.env.UPLOADS_DIR && !/^https?:\/\//i.test(process.env.UPLOADS_DIR)
            ? (process.env.UPLOADS_DIR.startsWith('.')
                ? join(process.cwd(), process.env.UPLOADS_DIR)
                : process.env.UPLOADS_DIR)
            : join(process.cwd(), 'uploads');
          const uploadPath = join(baseDir, 'projects');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const timestamp = Date.now();
          const random = Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname) || '';
          cb(null, `${timestamp}-${random}${ext}`);
        },
      }),
      limits: {
        fileSize: UPLOAD_LIMITS.descricaoProjeto.maxBytes,
        files: UPLOAD_LIMITS.maxFilesPerRequest,
      },
    }),
  )
  async uploadDescricaoFiles(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    return this.projectsService.addDescricaoArquivos(id, files, this.projectActor(user));
  }

  @Delete(':id/descricao-files')
  @Permissions('projetos:editar')
  async deleteDescricaoFile(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body('url') url: string,
  ) {
    return this.projectsService.removeDescricaoArquivo(id, url, this.projectActor(user));
  }
}
