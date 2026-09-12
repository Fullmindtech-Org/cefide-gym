import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AlumnosService } from '../alumnos/alumnos.service';

@Injectable()
export class RenovacionCron {
  private readonly logger = new Logger(RenovacionCron.name);
  private readonly renovacionAutomaticaHabilitada: boolean;

  constructor(
    private readonly alumnosService: AlumnosService,
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    // Contencion segura: ante una variable ausente o invalida, el cron no
    // puede modificar datos. Para habilitarlo se requiere el valor exacto true.
    this.renovacionAutomaticaHabilitada =
      configService.get<string>('RENOVACION_AUTOMATICA_HABILITADA') === 'true';

    if (this.renovacionAutomaticaHabilitada) {
      this.logger.warn('Renovacion mensual automatica HABILITADA.');
    } else {
      this.logger.warn(
        'Renovacion mensual automatica DESHABILITADA. No se modificaran inscripciones desde el cron.',
      );
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleRenovacion() {
    if (!this.renovacionAutomaticaHabilitada) {
      this.logger.warn(
        'Ejecucion automatica omitida: RENOVACION_AUTOMATICA_HABILITADA no es true.',
      );
      return;
    }

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
