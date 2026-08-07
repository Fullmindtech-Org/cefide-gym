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
import { ActividadesService } from './actividades.service';
import { CreateActividadDto } from './dto/create-actividad.dto';
import { UpdateActividadDto } from './dto/update-actividad.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { Rol } from '@prisma/client';

@Controller('actividades')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActividadesController {
  constructor(private readonly actividadesService: ActividadesService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('soloActivas') soloActivas?: string,
  ) {
    return this.actividadesService.findAll(
      soloActivas === 'true',
      user.rol === Rol.PROFESOR ? (user.profesorId ?? '__none__') : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.actividadesService.findOne(id);
  }

  @Post()
  @Roles(Rol.ADMIN)
  create(@Body() dto: CreateActividadDto) {
    return this.actividadesService.create(dto);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateActividadDto) {
    return this.actividadesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  remove(@Param('id') id: string) {
    return this.actividadesService.remove(id);
  }
}
