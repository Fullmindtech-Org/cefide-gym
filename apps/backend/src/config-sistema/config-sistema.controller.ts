import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ConfigSistemaService } from './config-sistema.service';
import { UpdateConfigDto } from './update-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { Rol } from '@prisma/client';

@Controller('config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN)
export class ConfigSistemaController {
  constructor(private readonly configService: ConfigSistemaService) {}

  @Get()
  get() {
    return this.configService.get();
  }

  @Patch()
  update(@Body() dto: UpdateConfigDto) {
    return this.configService.update(dto);
  }
}
