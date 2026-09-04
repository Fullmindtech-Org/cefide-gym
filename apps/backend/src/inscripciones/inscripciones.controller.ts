import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InscripcionesService } from './inscripciones.service';
import { AlumnosService } from '../alumnos/alumnos.service';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { CreateInscripcionDto } from './dto/create-inscripcion.dto';
import { PagarInscripcionDto } from './dto/pagar-inscripcion.dto';
import { AgregarClasesDto } from './dto/agregar-clases.dto';
import { AjustarClasesDto } from './dto/ajustar-clases.dto';
import { CambiarFrecuenciaDto } from './dto/cambiar-frecuencia.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { Rol } from '@prisma/client';

@Controller('inscripciones')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InscripcionesController {
  constructor(
    private readonly inscripcionesService: InscripcionesService,
    private readonly alumnosService: AlumnosService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('actividadId') actividadId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.inscripcionesService.findAll({
      search,
      actividadId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      sortBy,
      sortOrder: sortOrder === 'desc' ? 'desc' : 'asc',
      profesorId: user.rol === Rol.PROFESOR ? (user.profesorId ?? '__none__') : undefined,
    });
  }

  @Get('alumno/:alumnoId')
  findByAlumno(@Param('alumnoId') alumnoId: string, @CurrentUser() user: AuthUser) {
    return this.inscripcionesService.findByAlumno(
      alumnoId,
      user.rol === Rol.PROFESOR ? (user.profesorId ?? '__none__') : undefined,
    );
  }

  @Post()
  @Roles(Rol.ADMIN)
  create(@Body() dto: CreateInscripcionDto) {
    return this.inscripcionesService.create(dto);
  }

  @Patch(':id/pagar')
  @Roles(Rol.ADMIN)
  pagar(@Param('id') id: string, @Body() dto: PagarInscripcionDto) {
    return this.inscripcionesService.pagar(id, dto.pagado);
  }

  @Patch(':id/clases-sueltas')
  @Roles(Rol.ADMIN)
  agregarClasesSueltas(@Param('id') id: string, @Body() dto: AgregarClasesDto) {
    return this.inscripcionesService.agregarClasesSueltas(id, dto.clases);
  }

  @Patch(':id/clases')
  @Roles(Rol.ADMIN)
  ajustarClases(@Param('id') id: string, @Body() dto: AjustarClasesDto) {
    return this.inscripcionesService.ajustarClases(id, dto);
  }

  @Patch(':id/frecuencia')
  @Roles(Rol.ADMIN)
  cambiarFrecuencia(@Param('id') id: string, @Body() dto: CambiarFrecuenciaDto) {
    return this.inscripcionesService.cambiarFrecuencia(id, dto.frecuencia);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  remove(@Param('id') id: string) {
    return this.inscripcionesService.remove(id);
  }

  @Post('renovacion-mensual')
  @Roles(Rol.ADMIN)
  renovacionMensual() {
    return this.alumnosService.renovacionMensual();
  }
}
