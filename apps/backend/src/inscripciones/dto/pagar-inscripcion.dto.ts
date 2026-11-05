import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class PagarInscripcionDto {
  @IsBoolean()
  pagado: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  mesesAdelantados?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ArrayUnique()
  @Matches(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/, { each: true })
  periodos?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
