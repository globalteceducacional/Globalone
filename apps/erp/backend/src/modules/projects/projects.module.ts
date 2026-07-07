import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsImportService } from './projects-import.service';
import { ProjectsController } from './projects.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [PrismaModule, TasksModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectsImportService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
