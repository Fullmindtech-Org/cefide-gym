import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { Rol } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EstadoIngreso } from '@prisma/client';

@Controller('molinete')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN)
export class MolineteController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /api/molinete/:num/contingencia
   * Registra una apertura manual de contingencia (log/auditoría).
   * Solo ADMIN.
   *
   * La apertura física la dispara el navegador del admin contra su driver
   * local (localhost). El backend en la nube NO alcanza el molinete; este
   * endpoint solo deja registro del ingreso.
   */
  @Post(':num/contingencia')
  async contingencia(
    @Param('num', ParseIntPipe) num: number,
    @Body() body: { dni?: string; motivo?: string },
  ) {
    // Registrar ingreso de contingencia si viene DNI
    if (body.dni) {
      const alumno = await this.prisma.alumno.findUnique({
        where: { dni: body.dni },
      });

      if (alumno) {
        await this.prisma.ingreso.create({
          data: {
            alumnoId: alumno.id,
            estado: EstadoIngreso.VERDE,
            molinete: num,
          },
        });
      }
    }

    return {
      ok: true,
      contingencia: true,
      molinete: num,
      motivo: body.motivo || 'Apertura de contingencia',
    };
  }
}
