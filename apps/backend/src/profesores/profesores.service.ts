import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfesorDto } from './dto/create-profesor.dto';
import { UpdateProfesorDto } from './dto/update-profesor.dto';

@Injectable()
export class ProfesoresService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const [profesores, countRows] = await Promise.all([
      this.prisma.profesor.findMany({
        include: {
          usuario: { select: { id: true, email: true } },
          actividades: { select: { id: true, nombre: true } },
        },
        orderBy: { apellido: 'asc' },
      }),
      // One query: count distinct alumnos per actividad, grouped.
      this.prisma.inscripcionActividad.groupBy({
        by: ['actividadId'],
        _count: { alumnoId: true },
        where: { alumno: { activo: true } },
      }),
    ]);

    const alumnosByActividad = new Map(
      countRows.map((r) => [r.actividadId, r._count.alumnoId]),
    );

    return profesores.map((p) => {
      const actividadIds = p.actividades.map((a) => a.id);
      const alumnos = actividadIds.reduce(
        (sum, id) => sum + (alumnosByActividad.get(id) ?? 0),
        0,
      );
      return { ...p, _count: { alumnos } };
    });
  }

  async findOne(id: string) {
    const profesor = await this.prisma.profesor.findUnique({
      where: { id },
      include: {
        usuario: { select: { id: true, email: true } },
        actividades: { select: { id: true, nombre: true } },
      },
    });

    if (!profesor) {
      throw new NotFoundException('Profesor no encontrado');
    }

    return profesor;
  }

  async create(dto: CreateProfesorDto) {
    const exists = await this.prisma.profesor.findUnique({
      where: { dni: dto.dni },
    });

    if (exists) {
      throw new ConflictException('Ya existe un profesor con ese DNI');
    }

    const { email, password, actividadIds, ...profesorData } = dto;

    return this.prisma.$transaction(async (tx) => {
      const profesor = await tx.profesor.create({
        data: {
          ...profesorData,
          ...(actividadIds
            ? { actividades: { connect: actividadIds.map((id) => ({ id })) } }
            : {}),
        },
      });

      if (email && password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await tx.usuario.create({
          data: {
            email,
            password: hashedPassword,
            rol: 'PROFESOR',
            profesorId: profesor.id,
          },
        });
      }

      return tx.profesor.findUnique({
        where: { id: profesor.id },
        include: {
          usuario: { select: { id: true, email: true } },
          actividades: { select: { id: true, nombre: true } },
        },
      });
    });
  }

  async update(id: string, dto: UpdateProfesorDto) {
    const profesor = await this.findOne(id);
    const { email, password, actividadIds, ...profesorData } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(profesorData).length > 0 || actividadIds !== undefined) {
        await tx.profesor.update({
          where: { id },
          data: {
            ...profesorData,
            ...(actividadIds !== undefined
              ? { actividades: { set: actividadIds.map((aid) => ({ id: aid })) } }
              : {}),
          },
        });
      }

      if (email || password) {
        if (profesor.usuario) {
          const updateData: Record<string, string> = {};
          if (email) updateData.email = email;
          if (password) updateData.password = await bcrypt.hash(password, 10);
          await tx.usuario.update({
            where: { id: profesor.usuario.id },
            data: updateData,
          });
        } else if (email && password) {
          await tx.usuario.create({
            data: {
              email,
              password: await bcrypt.hash(password, 10),
              rol: 'PROFESOR',
              profesorId: id,
            },
          });
        }
      }

      return tx.profesor.findUnique({
        where: { id },
        include: {
          usuario: { select: { id: true, email: true } },
          actividades: { select: { id: true, nombre: true } },
        },
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      await tx.usuario.deleteMany({ where: { profesorId: id } });
      return tx.profesor.delete({ where: { id } });
    });
  }
}
