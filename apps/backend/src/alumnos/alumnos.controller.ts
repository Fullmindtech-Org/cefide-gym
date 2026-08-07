import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  BadRequestException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AlumnosService } from './alumnos.service';
import { CreateAlumnoDto } from './dto/create-alumno.dto';
import { UpdateAlumnoDto } from './dto/update-alumno.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { Rol } from '@prisma/client';

/** Subconjunto de Express.Multer.File que usa el endpoint de importación. */
interface UploadedCsv {
  originalname: string;
  buffer: Buffer;
  size: number;
}

@Controller('alumnos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AlumnosController {
  constructor(private readonly alumnosService: AlumnosService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('activo') activo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.alumnosService.findAll({
      search,
      activo: activo !== undefined ? activo === 'true' : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      profesorId:
        user.rol === Rol.PROFESOR ? (user.profesorId ?? '__none__') : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.alumnosService.findOne(id);
  }

  @Post()
  @Roles(Rol.ADMIN)
  create(@Body() dto: CreateAlumnoDto) {
    return this.alumnosService.create(dto);
  }

  /**
   * Importa alumnos desde un CSV (multipart/form-data, campo `file`).
   * Columnas: dni, nombre, apellido, domicilio, telefono, localidad,
   * actividad, activo (acepta separador tab, `;` o `,`).
   * Idempotente: upsert por DNI; crea Actividad + Inscripción si la fila
   * trae `actividad`.
   */
  @Post('import')
  @Roles(Rol.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  importCsv(@UploadedFile() file?: UploadedCsv) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException(
        'Falta el archivo CSV (campo multipart "file")',
      );
    }
    return this.alumnosService.importFromCsv(file.buffer);
  }

  @Put(':id')
  @Roles(Rol.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateAlumnoDto) {
    return this.alumnosService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles(Rol.ADMIN)
  deactivate(@Param('id') id: string) {
    return this.alumnosService.deactivate(id);
  }

  @Patch(':id/activate')
  @Roles(Rol.ADMIN)
  activate(@Param('id') id: string) {
    return this.alumnosService.activate(id);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  remove(@Param('id') id: string) {
    return this.alumnosService.remove(id);
  }
}
