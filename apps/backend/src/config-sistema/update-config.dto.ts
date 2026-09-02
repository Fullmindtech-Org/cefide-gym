import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class UpdateConfigDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  clasesGracia?: number;

  /** 1-28: evita que un valor fuera de rango desactive el cron de renovación (A3). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  diaVencimiento?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  clasesUnaVez?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  clasesDosVeces?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  clasesTresVeces?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  clasesLibre?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  tiempoVerde?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  tiempoAmarillo?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  tiempoRojo?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  reingresoVentanaMinutos?: number;

  /** DNIs separados por coma, cada uno de 7-8 dígitos. Ej: "00000000,99999999" */
  @IsOptional()
  @IsString()
  @Matches(/^$|^(\d{7,8})(,\d{7,8})*$/, {
    message: 'codigosComodin debe ser una lista de DNIs de 7-8 dígitos separados por coma',
  })
  codigosComodin?: string;
}
