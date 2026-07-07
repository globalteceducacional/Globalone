import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { UPLOAD_LIMITS } from '../../common/constants/upload-limits';
import { UsersService } from './users.service';
import { FilterUsersDto } from './dto/filter-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

function ensureProfilesUploadDir(): string {
  const uploadsDirEnv = process.env.UPLOADS_DIR;
  const base =
    uploadsDirEnv && !/^https?:\/\//i.test(uploadsDirEnv)
      ? uploadsDirEnv.startsWith('.')
        ? join(process.cwd(), uploadsDirEnv)
        : uploadsDirEnv
      : join(process.cwd(), 'uploads');
  const dir = join(base, 'profiles');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('usuarios:visualizar', 'usuarios:criar', 'usuarios:editar', 'usuarios:gerenciar')
  findAll(@Query() filter: FilterUsersDto) {
    return this.usersService.findAll(filter);
  }

  /**
   * Lista básica de usuários ativos para selects (retorna apenas id, nome e cargo.nome).
   * Acessível a qualquer usuário autenticado — dados mínimos sem informação sensível.
   */
  @Get('options')
  findOptions() {
    return this.usersService.findOptions();
  }

  @Get('ranking')
  @Permissions(
    'usuarios:visualizar',
    'usuarios:gerenciar',
    'projetos:visualizar',
    'projetos:aprovar',
    'sistema:administrar',
  )
  ranking() {
    return this.usersService.ranking();
  }

  @Post()
  @Permissions('usuarios:criar', 'usuarios:gerenciar')
  create(@Body() body: CreateUserDto) {
    return this.usersService.create(body);
  }

  /** Rotas `me/*` antes de `:id` para não conflitar com ParseIntPipe. */

  @Patch('me/profile')
  updateMyProfile(
    @CurrentUser() user: { userId: number },
    @Body() body: UpdateMyProfileDto,
  ) {
    return this.usersService.updateMyProfile(user.userId, body);
  }

  @Patch('me/password')
  changePassword(@CurrentUser() user: { userId: number }, @Body() body: ChangePasswordDto) {
    return this.usersService.changePassword(user.userId, body.senhaAtual, body.novaSenha);
  }

  @Post('me/profile-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, ensureProfilesUploadDir());
        },
        filename: (req, file, cb) => {
          const userId = (req as { user?: { userId: number } }).user?.userId ?? 0;
          const ext = extname(file.originalname).toLowerCase();
          const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
          const e = allowed.includes(ext) ? ext : '.jpg';
          cb(null, `profile-${userId}-${Date.now()}${e}`);
        },
      }),
      limits: { fileSize: UPLOAD_LIMITS.generic.maxBytes },
      fileFilter: (_req, file, cb) => {
        const ok = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype);
        if (!ok) {
          cb(new BadRequestException('Envie uma imagem (JPEG, PNG, GIF ou WebP).'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadMyProfilePhoto(
    @CurrentUser() user: { userId: number },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.setMyProfilePhoto(user.userId, file);
  }

  @Delete('me/profile-photo')
  removeMyProfilePhoto(@CurrentUser() user: { userId: number }) {
    return this.usersService.removeMyProfilePhoto(user.userId);
  }

  @Post(':id/profile-photo')
  @Permissions('usuarios:editar', 'usuarios:gerenciar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, ensureProfilesUploadDir());
        },
        filename: (req, file, cb) => {
          const id = Number((req as { params?: { id?: string } }).params?.id) || 0;
          const ext = extname(file.originalname).toLowerCase();
          const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
          const e = allowed.includes(ext) ? ext : '.jpg';
          cb(null, `profile-${id}-${Date.now()}${e}`);
        },
      }),
      limits: { fileSize: UPLOAD_LIMITS.generic.maxBytes },
      fileFilter: (_req, file, cb) => {
        const ok = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype);
        if (!ok) {
          cb(new BadRequestException('Envie uma imagem (JPEG, PNG, GIF ou WebP).'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadUserProfilePhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.setMyProfilePhoto(id, file);
  }

  @Delete(':id/profile-photo')
  @Permissions('usuarios:editar', 'usuarios:gerenciar')
  removeUserProfilePhoto(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.removeMyProfilePhoto(id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() requester: { userId: number; permissions?: string[] },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.findOneAuthorized(id, requester);
  }

  @Patch(':id')
  @Permissions('usuarios:editar', 'usuarios:gerenciar')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateUserDto) {
    return this.usersService.update(id, body);
  }

  @Patch(':id/activate')
  @Permissions('usuarios:editar', 'usuarios:gerenciar')
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.activate(id);
  }

  @Patch(':id/deactivate')
  @Permissions('usuarios:editar', 'usuarios:gerenciar')
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.deactivate(id);
  }

  @Patch(':id/role')
  @Permissions('usuarios:editar', 'usuarios:gerenciar')
  assignRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateRoleDto,
  ) {
    return this.usersService.assignRole(id, body.cargoId);
  }

  @Delete(':id')
  @Permissions('usuarios:excluir', 'usuarios:gerenciar')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }
}
