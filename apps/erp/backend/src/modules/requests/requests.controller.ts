import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequestsService } from './requests.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateRequestDto } from './dto/create-request.dto';
import { RespondRequestDto } from './dto/respond-request.dto';

@Controller('requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  create(@CurrentUser() user: { userId: number }, @Body() body: CreateRequestDto) {
    return this.requestsService.create(user.userId, body);
  }

  @Get('sent')
  listSent(@CurrentUser() user: { userId: number }) {
    return this.requestsService.listSent(user.userId);
  }

  @Get('received')
  listReceived(@CurrentUser() user: { userId: number }) {
    return this.requestsService.listReceived(user.userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.requestsService.findOne(id, user.userId);
  }

  @Post(':id/respond')
  respond(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { userId: number },
    @Body() body: RespondRequestDto,
  ) {
    return this.requestsService.respond(id, user.userId, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.requestsService.remove(id, user.userId);
  }
}
