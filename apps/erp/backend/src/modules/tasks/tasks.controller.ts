import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ChangeTaskStatusDto } from './dto/change-task-status.dto';
import { FilterMyTasksDto } from './dto/filter-my-tasks.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { RejectTaskDto } from './dto/reject-task.dto';
import { SubmitDeliveryDto } from './dto/submit-delivery.dto';
import { ReviewDeliveryDto } from './dto/review-delivery.dto';
import { SubmitChecklistItemDto } from './dto/submit-checklist-item.dto';
import { ReviewChecklistItemDto } from './dto/review-checklist-item.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import { join, extname } from 'path';
import type { ProjectAccessActor } from '../../common/utils/project-scope.util';
import { UPLOAD_LIMITS } from '../../common/constants/upload-limits';

type JwtUser = { userId: number; permissions?: string[] };

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  private taskActor(user: JwtUser): ProjectAccessActor {
    return { userId: user.userId, permissions: user.permissions ?? [] };
  }

  @Get('my')
  findMyTasks(@CurrentUser() user: { userId: number }, @Query() filter: FilterMyTasksDto) {
    return this.tasksService.listMyTasks(user.userId, filter);
  }

  @Post()
  @Permissions('projetos:criar', 'projetos:editar')
  create(@CurrentUser() user: JwtUser, @Body() body: CreateTaskDto) {
    return this.tasksService.create(body, this.taskActor(user));
  }

  @Post('uploads')
  @UseInterceptors(
    FilesInterceptor('files', UPLOAD_LIMITS.maxFilesPerRequest, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const baseDir = process.env.UPLOADS_DIR && !/^https?:\/\//i.test(process.env.UPLOADS_DIR)
            ? (process.env.UPLOADS_DIR.startsWith('.')
                ? join(process.cwd(), process.env.UPLOADS_DIR)
                : process.env.UPLOADS_DIR)
            : join(process.cwd(), 'uploads');
          const uploadPath = join(baseDir, 'tasks');
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
        fileSize: UPLOAD_LIMITS.tarefa.maxBytes,
        files: UPLOAD_LIMITS.maxFilesPerRequest,
      },
    }),
  )
  async uploadFiles(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      return [];
    }

    const basePrefix = process.env.UPLOADS_URL_PREFIX || '/uploads';
    const baseUrl = `${basePrefix.replace(/\/+$/, '')}/tasks`;

    return files.map((file) => ({
      originalName: file.originalname,
      url: `${baseUrl}/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
    }));
  }

  @Patch(':id')
  @Permissions('projetos:editar')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasksService.update(id, body, this.taskActor(user));
  }

  @Patch(':id/status')
  @Permissions('projetos:editar', 'projetos:aprovar')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Body() body: ChangeTaskStatusDto,
  ) {
    return this.tasksService.changeStatus(id, body, this.taskActor(user));
  }

  @Post(':id/deliver')
  @Permissions('trabalhos:registrar', 'trabalhos:avaliar')
  deliver(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
    @Body() body: SubmitDeliveryDto,
  ) {
    return this.tasksService.deliver(id, user.userId, body);
  }

  @Patch(':id/deliver/:entregaId')
  @Permissions('trabalhos:registrar', 'trabalhos:avaliar')
  updateDelivery(
    @Param('id', ParseIntPipe) etapaId: number,
    @Param('entregaId', ParseIntPipe) entregaId: number,
    @CurrentUser() user: { userId: number },
    @Body() body: SubmitDeliveryDto,
  ) {
    return this.tasksService.updateDelivery(etapaId, entregaId, user.userId, body);
  }

  @Post(':id/approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
    @Body() body: ReviewDeliveryDto,
  ) {
    return this.tasksService.approve(id, user.userId, body.comentario);
  }

  @Post(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
    @Body() body: RejectTaskDto,
  ) {
    return this.tasksService.reject(id, user.userId, body.reason);
  }

  @Post(':id/subtasks')
  @Permissions('trabalhos:registrar', 'projetos:editar')
  createSubtask(
    @Param('id', ParseIntPipe) etapaId: number,
    @Body() body: CreateSubtaskDto,
  ) {
    return this.tasksService.createSubtask({ ...body, etapaId });
  }

  @Patch(':id/subtasks/:subtaskId')
  @Permissions('trabalhos:registrar', 'projetos:editar')
  updateSubtask(
    @Param('subtaskId', ParseIntPipe) subtaskId: number,
    @Body() body: UpdateSubtaskDto,
  ) {
    return this.tasksService.updateSubtask(subtaskId, body);
  }

  @Patch(':id/checklist')
  updateChecklist(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
    @Body() body: UpdateChecklistDto,
  ) {
    return this.tasksService.updateChecklist(id, user.userId, body.checklist);
  }

  @Post(':id/checklist/:index/submit')
  submitChecklistItem(
    @Param('id', ParseIntPipe) etapaId: number,
    @Param('index', ParseIntPipe) checklistIndex: number,
    @CurrentUser() user: { userId: number },
    @Body() body: SubmitChecklistItemDto,
    @Query('subitemIndex') subitemIndex?: string,
  ) {
    const subitemIndexNum = subitemIndex ? parseInt(subitemIndex, 10) : undefined;
    return this.tasksService.submitChecklistItem(etapaId, checklistIndex, user.userId, body, subitemIndexNum);
  }

  @Patch(':id/checklist/:index/review')
  reviewChecklistItem(
    @Param('id', ParseIntPipe) etapaId: number,
    @Param('index', ParseIntPipe) checklistIndex: number,
    @CurrentUser() user: { userId: number },
    @Body() body: ReviewChecklistItemDto,
    @Query('subitemIndex') subitemIndex?: string,
  ) {
    const subitemIndexNum = subitemIndex ? parseInt(subitemIndex, 10) : undefined;
    return this.tasksService.reviewChecklistItem(etapaId, checklistIndex, user.userId, body, subitemIndexNum);
  }

  @Delete(':id/subtasks/:subtaskId')
  @Permissions('trabalhos:registrar', 'projetos:editar')
  deleteSubtask(@Param('subtaskId', ParseIntPipe) subtaskId: number) {
    return this.tasksService.deleteSubtask(subtaskId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Permissions('projetos:excluir', 'projetos:editar')
  remove(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.tasksService.remove(id, this.taskActor(user));
  }
}
