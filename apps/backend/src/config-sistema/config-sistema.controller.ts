import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ConfigSistemaService } from './config-sistema.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { Rol } from '@prisma/client';

@Controller('config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN)
export class ConfigSistemaController {
  constructor(private readonly configService: ConfigSistemaService) {}

  @Get()
  get() {
    return this.configService.get();
  }

  @Patch()
  update(
    @Body()
    data: {
      clasesGracia?: number;
      diaVencimiento?: number;
      clasesUnaVez?: number;
      clasesDosVeces?: number;
      clasesTresVeces?: number;
      clasesLibre?: number;
      tiempoVerde?: number;
      tiempoAmarillo?: number;
      tiempoRojo?: number;
      codigosComodin?: string;
    },
  ) {
    return this.configService.update(data);
  }
}
