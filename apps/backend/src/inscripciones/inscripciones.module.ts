import { Module } from '@nestjs/common';
import { InscripcionesService } from './inscripciones.service';
import { InscripcionesController } from './inscripciones.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AlumnosModule } from '../alumnos/alumnos.module';

@Module({
  imports: [PrismaModule, AlumnosModule],
  controllers: [InscripcionesController],
  providers: [InscripcionesService],
  exports: [InscripcionesService],
})
export class InscripcionesModule {}
