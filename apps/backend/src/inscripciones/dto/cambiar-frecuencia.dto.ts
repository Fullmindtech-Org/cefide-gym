import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Frecuencia } from '@prisma/client';

export class CambiarFrecuenciaDto {
  @IsEnum(Frecuencia)
  frecuencia: Frecuencia;

  @IsOptional()
  @IsInt()
  @Min(0)
  clasesUsadas?: number;
}
