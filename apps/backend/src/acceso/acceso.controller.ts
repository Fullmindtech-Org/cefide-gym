import { Controller, Post, Get, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsOptional, IsInt, Matches } from 'class-validator';
import { AccesoService } from './acceso.service';

class ConsultarAccesoDto {
  @Matches(/^\d{7,8}$/, { message: 'El DNI debe tener 7 u 8 dígitos numéricos' })
  dni: string;
}

class ValidarAccesoDto {
  @IsString()
  dni: string;

  @IsOptional()
  @IsString()
  inscripcionId?: string;

  @IsOptional()
  @IsInt()
  molinete?: number;
}

@Controller('acceso')
export class AccesoController {
  constructor(private readonly accesoService: AccesoService) {}

  /**
   * GET /api/acceso/config
   * Config pública para el kiosco: tiempos de pantalla por estado (segundos).
   * No requiere auth — el kiosco corre sin sesión.
   */
  @Get('config')
  config() {
    return this.accesoService.getKioscoConfig();
  }

  /**
   * POST /api/acceso/consultar
   * Paso 1: busca el alumno y devuelve sus inscripciones activas.
   * No registra ingreso ni abre molinete.
   */
  // 30 consultas/min por IP — frena enumeración de socios (M1).
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('consultar')
  consultar(@Body() dto: ConsultarAccesoDto) {
    return this.accesoService.consultarAcceso(dto.dni);
  }

  /**
   * POST /api/acceso/validar
   * Paso 2: valida la inscripción seleccionada y registra el ingreso.
   *
   * La apertura física la dispara el navegador del kiosco contra su driver
   * local (localhost). El backend en la nube NO puede alcanzar el molinete.
   */
  // 20 validaciones/min por IP — un kiosco real nunca supera esto.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('validar')
  validar(@Body() dto: ValidarAccesoDto) {
    return this.accesoService.validarYRegistrarAcceso(
      dto.dni,
      dto.inscripcionId ?? null,
      dto.molinete ?? 1,
    );
  }
}
