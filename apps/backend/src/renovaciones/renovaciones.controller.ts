import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { ModoRenovacion, ProgramacionRenovacion, Rol } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { RenovacionesService } from './renovaciones.service';

class ConfiguracionRenovacionDto {
  @IsEnum(ModoRenovacion) modo!: ModoRenovacion;
  @IsEnum(ProgramacionRenovacion) programacion!: ProgramacionRenovacion;
}

@Controller('renovaciones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN)
export class RenovacionesController {
  constructor(private readonly renovaciones: RenovacionesService) {}
  @Get('estado') estado() { return this.renovaciones.estado(); }
  @Get('proxima') proxima(@Query('programacion') programacion: ProgramacionRenovacion) { return this.renovaciones.proxima(programacion); }
  @Get('vista-previa') vistaPrevia() { return this.renovaciones.vistaPrevia(); }
  @Patch('configuracion') configuracion(@CurrentUser() user: AuthUser, @Body() dto: ConfiguracionRenovacionDto) { return this.renovaciones.actualizarConfiguracion(user.id, dto); }
  @Post('ejecutar') ejecutar(@CurrentUser() user: AuthUser) { return this.renovaciones.ejecutarManual(user.id); }
}

