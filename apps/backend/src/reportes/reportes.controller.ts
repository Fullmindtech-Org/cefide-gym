import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportesService } from './reportes.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { Prisma, Rol } from '@prisma/client';
import { buildAlumnoSearch } from '../common/alumno-search';
import { filtroFechaPagos } from './filtro-fecha-pagos';

@Controller('reportes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportesController {
  constructor(
    private readonly reportesService: ReportesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('actividad')
  reporteActividad(
    @CurrentUser() user: AuthUser,
    @Query('actividadId') actividadId?: string,
  ) {
    return this.reportesService.reporteActividad(
      actividadId,
      user.rol === Rol.PROFESOR ? (user.profesorId ?? '__none__') : undefined,
    );
  }

  @Get('deudores')
  @Roles(Rol.ADMIN)
  reporteDeudores(
    @Query('actividadId') actividadId?: string,
    @Query('periodo') periodo?: string,
  ) {
    return this.reportesService.reporteDeudores(actividadId, periodo);
  }

  @Get('deudores/periodos')
  @Roles(Rol.ADMIN)
  periodosDeudores() {
    return this.reportesService.periodosDeudores();
  }

  @Get('deudores/csv')
  @Roles(Rol.ADMIN)
  async exportDeudoresCsv(
    @Res() res: Response,
    @Query('actividadId') actividadId?: string,
    @Query('periodo') periodo?: string,
  ) {
    const datos = await this.reportesService.reporteDeudores(actividadId, periodo);
    const csv = this.reportesService.generarCsvDeudores(datos, periodo);
    const fecha = periodo ?? new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-deudores-${fecha}.csv"`);
    res.send(csv);
  }

  @Get('deudores/excel')
  @Roles(Rol.ADMIN)
  async exportDeudoresExcel(
    @Res() res: Response,
    @Query('actividadId') actividadId?: string,
    @Query('periodo') periodo?: string,
  ) {
    const datos = await this.reportesService.reporteDeudores(actividadId, periodo);
    const excel = this.reportesService.generarExcelDeudores(datos, periodo);
    const fecha = periodo ?? new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-deudores-${fecha}.xls"`);
    res.send(excel);
  }

  @Get('actividad/csv')
  @Roles(Rol.ADMIN)
  async exportCsv(
    @Res() res: Response,
    @Query('actividadId') actividadId?: string,
  ) {
    const datos = await this.reportesService.reporteActividad(actividadId);
    const csv = this.reportesService.generarCsv(datos);

    const fecha = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="reporte-cefide-${fecha}.csv"`,
    );
    res.send(csv);
  }

  @Get('pagos')
  @Roles(Rol.ADMIN)
  async historialPagos(
    @Query('search') search?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('periodo') periodo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.PagoWhereInput = filtroFechaPagos(periodo, desde, hasta);
    const alumnoSearch = buildAlumnoSearch(search);
    if (alumnoSearch) where.alumno = alumnoSearch;

    const direction: Prisma.SortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy = sortBy === 'dni' ? { alumno: { dni: direction } }
      : sortBy === 'alumno' ? [{ alumno: { apellido: direction } }, { alumno: { nombre: direction } }]
      : sortBy === 'tipo' ? { tipo: direction }
      : [{ registradoEn: { sort: direction, nulls: 'last' as const } }, { fecha: direction }, { id: direction }];

    const [data, total] = await Promise.all([
      this.prisma.pago.findMany({
        where,
        include: {
          alumno: { select: { dni: true, nombre: true, apellido: true } },
          inscripcion: { include: { actividad: { select: { nombre: true } } } },
        },
        orderBy,
        skip,
        take: limitNum,
      }),
      this.prisma.pago.count({ where }),
    ]);

    return {
      data: data.map((pago) => ({
        ...pago,
        // Un adelanto legado sin fecha recuperable no debe mostrarse como cobro futuro.
        fechaImpacto: pago.registradoEn ?? (pago.nota?.startsWith('Pago adelantado ') ? null : pago.fecha),
      })),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  @Get('pagos/periodos')
  @Roles(Rol.ADMIN)
  async periodosPagos() {
    const rows = await this.prisma.$queryRaw<Array<{ periodo: string }>>`
      SELECT DISTINCT to_char("fecha" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM') AS periodo
      FROM "Pago"
      ORDER BY periodo DESC
    `;
    return rows.map((row) => row.periodo);
  }

  @Get('pagos/estadisticas')
  @Roles(Rol.ADMIN)
  async estadisticasPagos(
    @Query('periodo') periodo?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    const where = filtroFechaPagos(periodo, desde, hasta);
    const [pagos, anulaciones] = await Promise.all([
      this.prisma.pago.count({ where: { ...where, tipo: 'PAGO' } }),
      this.prisma.pago.count({ where: { ...where, tipo: 'ANULACION' } }),
    ]);
    return { pagos, anulaciones };
  }

  /** Borra un registro del historial de pagos (solo log; no afecta la inscripción). */
  @Delete('pagos/:id')
  @Roles(Rol.ADMIN)
  async deletePago(@Param('id') id: string) {
    await this.prisma.pago.delete({ where: { id } });
    return { ok: true };
  }
}
