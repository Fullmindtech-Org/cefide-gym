import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Rol } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Crea (o actualiza) un usuario ADMIN al arrancar la app a partir de las
 * credenciales definidas en las envs. Es idempotente: si el admin ya existe
 * sincroniza su password/rol; si no existe lo crea.
 *
 * Envs:
 *   ADMIN_EMAIL    — email del admin (requerido para crear el usuario)
 *   ADMIN_PASSWORD — password en texto plano (requerido)
 */
@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const email = (
      this.config.get<string>('ADMIN_EMAIL') ?? process.env.ADMIN_EMAIL ?? ''
    ).trim();
    const password = (
      this.config.get<string>('ADMIN_PASSWORD') ??
      process.env.ADMIN_PASSWORD ??
      ''
    ).trim();

    if (!email || !password) {
      this.logger.warn(
        `ADMIN_EMAIL/ADMIN_PASSWORD no definidos — se omite la creacion del admin. ` +
          `(email=${email ? 'set' : 'vacio'}, password=${password ? 'set' : 'vacio'})`,
      );
      return;
    }

    const existing = await this.prisma.usuario.findUnique({ where: { email } });

    if (!existing) {
      const passwordHash = await bcrypt.hash(password, 10);
      await this.prisma.usuario.create({
        data: { email, password: passwordHash, rol: Rol.ADMIN },
      });
      this.logger.log(`Usuario ADMIN creado: ${email}`);
    } else {
      // M3: no pisar la contraseña en cada boot — solo garantizar el rol.
      if (existing.rol !== Rol.ADMIN) {
        await this.prisma.usuario.update({
          where: { email },
          data: { rol: Rol.ADMIN },
        });
      }
      this.logger.log(`Usuario ADMIN existente: ${email}`);
    }
  }
}
