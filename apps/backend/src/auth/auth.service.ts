import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
      include: { profesor: true },
    });

    if (!usuario) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValid = await bcrypt.compare(dto.password, usuario.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const base: Omit<JwtPayload, 'type'> = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      tokenVersion: usuario.tokenVersion,
    };

    return {
      accessToken: this.generateAccessToken(base),
      refreshToken: this.generateRefreshToken(base),
      usuario: {
        id: usuario.id,
        email: usuario.email,
        rol: usuario.rol,
        profesorId: usuario.profesorId,
        nombre: usuario.profesor?.nombre ?? null,
        apellido: usuario.profesor?.apellido ?? null,
      },
    };
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // A1: solo refresh tokens pueden refrescar.
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Tipo de token inválido');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
    });

    if (!usuario) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // C3: verifica que el token no haya sido revocado.
    if (payload.tokenVersion !== usuario.tokenVersion) {
      throw new UnauthorizedException('Sesión revocada');
    }

    const base: Omit<JwtPayload, 'type'> = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      tokenVersion: usuario.tokenVersion,
    };

    return {
      accessToken: this.generateAccessToken(base),
      refreshToken: this.generateRefreshToken(base),
    };
  }

  /** Invalida todas las sesiones activas del usuario incrementando tokenVersion. */
  async logout(userId: string) {
    await this.prisma.usuario.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    return { message: 'Sesión cerrada' };
  }

  private generateAccessToken(base: Omit<JwtPayload, 'type'>): string {
    return this.jwt.sign(
      { ...base, type: 'access' } satisfies JwtPayload,
      { expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '7d') as any },
    );
  }

  private generateRefreshToken(base: Omit<JwtPayload, 'type'>): string {
    return this.jwt.sign(
      { ...base, type: 'refresh' } satisfies JwtPayload,
      { expiresIn: '30d' as any },
    );
  }
}
