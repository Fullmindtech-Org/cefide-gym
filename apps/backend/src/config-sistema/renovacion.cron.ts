import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RenovacionesService } from '../renovaciones/renovaciones.service';

@Injectable()
export class RenovacionCron {
  private readonly logger = new Logger(RenovacionCron.name);
  constructor(private readonly renovaciones: RenovacionesService) {}

  // Cada instancia verifica la hora argentina; la base de datos arbitra el período.
  @Cron(CronExpression.EVERY_MINUTE, { timeZone: 'America/Argentina/Buenos_Aires' })
  async handleRenovacion() {
    try {
      const resultado = await this.renovaciones.ejecutarAutomatica();
      if (resultado && !resultado.yaCompletada) {
        this.logger.log(`Renovación ${resultado.periodo} completada: ${resultado.renovados} inscripciones.`);
      }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falló la renovación automática; se reintentará en el próximo minuto: ${mensaje}`);
    }
  }
}
