import { IsString, IsOptional, IsBoolean, IsDateString, MinLength, MaxLength } from 'class-validator';

export class UpdateAlumnoDto {
  @IsOptional()
  @IsString()
  @MinLength(7)
  @MaxLength(8)
  dni?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  apellido?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsDateString()
  fechaNacimiento?: string;

  @IsOptional()
  @IsDateString()
  fechaIngreso?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
