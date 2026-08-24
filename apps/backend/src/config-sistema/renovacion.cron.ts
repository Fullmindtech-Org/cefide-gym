import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AlumnosService } from '../alumnos/alumnos.service';

@Injectable()
export class RenovacionCron {
  private readonly logger = new Logger(RenovacionCron.name);

  constructor(
    private readonly alumnosService: AlumnosService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleRenovacion() {
    const hoy = new Date();
    const diaDelMes = hoy.getDate();

    const config = await this.prisma.configSistema.findUnique({
      where: { id: 'global' },
    });

    const diaVencimiento = config?.diaVencimiento ?? 5;

    if (diaDelMes < diaVencimiento) {
      return;
    }

    // Idempotencia: solo una vez por mes
    if (config?.ultimaRenovacion) {
      const ultima = config.ultimaRenovacion;
      if (
        ultima.getFullYear() === hoy.getFullYear() &&
        ultima.getMonth() === hoy.getMonth()
      ) {
        this.logger.log('Renovación ya ejecutada este mes, saltando.');
        return;
      }
    }

    this.logger.log('Ejecutando renovación mensual...');
    const resultado = await this.alumnosService.renovacionMensual();
    this.logger.log(`Renovación completada: ${resultado.renovados} alumnos renovados`);
  }
}
