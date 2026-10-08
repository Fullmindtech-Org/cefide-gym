import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class PagarInscripcionDto {
  @IsBoolean()
  pagado: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  mesesAdelantados?: number;
}
