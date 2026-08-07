import { IsInt, IsOptional, Min } from 'class-validator';

export class AjustarClasesDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  clasesUsadas?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  clasesTotal?: number;
}
