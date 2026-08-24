import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IngresosService } from './ingresos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { EstadoIngreso, Rol } from '@prisma/client';

@Controller('ingresos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IngresosController {
  constructor(private readonly ingresosService: IngresosService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('alumnoId') alumnoId?: string,
    @Query('estado') estado?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ingresosService.findAll({
      desde,
      hasta,
      alumnoId,
      estado: estado as EstadoIngreso | undefined,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 30,
      profesorId: user.rol === Rol.PROFESOR ? (user.profesorId ?? '__none__') : undefined,
    });
  }
}
