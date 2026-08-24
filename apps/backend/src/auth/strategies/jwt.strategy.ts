import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  rol: string;
  type: 'access' | 'refresh';
  tokenVersion: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // A1: solo access tokens valen en endpoints protegidos.
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Tipo de token inválido');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      include: { profesor: true },
    });

    if (!usuario) {
      throw new UnauthorizedException();
    }

    // C3: tokenVersion revocado por logout o cambio de contraseña.
    if (payload.tokenVersion !== usuario.tokenVersion) {
      throw new UnauthorizedException('Sesión revocada');
    }

    return {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      profesorId: usuario.profesorId,
    };
  }
}
