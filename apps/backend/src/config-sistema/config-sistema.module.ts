import { Module } from '@nestjs/common';
import { ConfigSistemaService } from './config-sistema.service';
import { ConfigSistemaController } from './config-sistema.controller';
import { RenovacionCron } from './renovacion.cron';
import { RenovacionesModule } from '../renovaciones/renovaciones.module';

@Module({
  imports: [RenovacionesModule],
  controllers: [ConfigSistemaController],
  providers: [ConfigSistemaService, RenovacionCron],
  exports: [ConfigSistemaService],
})
export class ConfigSistemaModule {}
