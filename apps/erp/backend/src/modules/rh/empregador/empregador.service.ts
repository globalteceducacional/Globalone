import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Empregador (CNPJ/CEI/CAEPF) usado como cabeçalho de comprovantes REP-P
 * e do AFD (Portaria 671/2021). Suporta múltiplos cadastros, mas apenas um
 * pode estar marcado como `principal = true` por vez (default do AFD).
 */
@Injectable()
export class EmpregadorService {
  constructor(private readonly prisma: PrismaService) {}

  private apenasDigitos(v: string | null | undefined): string | null {
    if (!v) return null;
    const d = v.replace(/\D/g, '');
    return d.length ? d : null;
  }

  listar() {
    return this.prisma.empregador.findMany({ orderBy: [{ principal: 'desc' }, { id: 'asc' }] });
  }

  async obterPrincipal() {
    return this.prisma.empregador.findFirst({
      where: { principal: true },
      orderBy: { id: 'asc' },
    });
  }

  async criar(dto: {
    tipoIdentificador?: number;
    identificador: string;
    razaoSocial: string;
    cei?: string | null;
    endereco?: string | null;
    principal?: boolean;
    latitudeReferencia?: number | null;
    longitudeReferencia?: number | null;
    raioMetros?: number | null;
  }) {
    const identificador = this.apenasDigitos(dto.identificador);
    if (!identificador) {
      throw new BadRequestException('identificador (CNPJ/CPF/CAEPF/CNO) é obrigatório.');
    }
    const tipo = dto.tipoIdentificador ?? 1;
    if (![1, 2, 3, 4].includes(tipo)) {
      throw new BadRequestException('tipoIdentificador deve ser 1=CNPJ, 2=CPF, 3=CAEPF, 4=CNO.');
    }
    if (!dto.razaoSocial?.trim()) {
      throw new BadRequestException('razaoSocial é obrigatória.');
    }
    this.validarGeocercaPayload(dto);

    return this.prisma.$transaction(async (tx) => {
      if (dto.principal) {
        // Apenas um principal por vez.
        await tx.empregador.updateMany({
          where: { principal: true },
          data: { principal: false },
        });
      }
      return tx.empregador.create({
        data: {
          tipoIdentificador: tipo,
          identificador,
          razaoSocial: dto.razaoSocial.trim(),
          cei: dto.cei?.trim() || null,
          endereco: dto.endereco?.trim() || null,
          principal: dto.principal ?? true,
          latitudeReferencia: dto.latitudeReferencia ?? null,
          longitudeReferencia: dto.longitudeReferencia ?? null,
          raioMetros: dto.raioMetros ?? null,
        },
      });
    });
  }

  /**
   * Garante que os 3 campos da geocerca (lat/lon/raio) sejam preenchidos
   * em conjunto. Permite os 3 nulos (geocerca desativada) ou os 3 preenchidos.
   */
  private validarGeocercaPayload(dto: {
    latitudeReferencia?: number | null;
    longitudeReferencia?: number | null;
    raioMetros?: number | null;
  }): void {
    const tem = (v: unknown) => v !== undefined && v !== null;
    const total = [
      tem(dto.latitudeReferencia),
      tem(dto.longitudeReferencia),
      tem(dto.raioMetros),
    ].filter(Boolean).length;
    if (total !== 0 && total !== 3) {
      throw new BadRequestException(
        'Para ativar a geocerca, informe latitude, longitude e raio (em metros). Para desativar, deixe os 3 campos em branco.',
      );
    }
  }

  async atualizar(
    id: number,
    dto: {
      tipoIdentificador?: number;
      identificador?: string;
      razaoSocial?: string;
      cei?: string | null;
      endereco?: string | null;
      principal?: boolean;
      latitudeReferencia?: number | null;
      longitudeReferencia?: number | null;
      raioMetros?: number | null;
    },
  ) {
    const existente = await this.prisma.empregador.findUnique({ where: { id } });
    if (!existente) throw new NotFoundException('Empregador não encontrado.');

    const data: Record<string, unknown> = {};
    if (dto.razaoSocial !== undefined) {
      if (!dto.razaoSocial.trim()) {
        throw new BadRequestException('razaoSocial não pode ser vazia.');
      }
      data.razaoSocial = dto.razaoSocial.trim();
    }
    if (dto.identificador !== undefined) {
      const novo = this.apenasDigitos(dto.identificador);
      if (!novo) throw new BadRequestException('identificador inválido.');
      data.identificador = novo;
    }
    if (dto.tipoIdentificador !== undefined) {
      if (![1, 2, 3, 4].includes(dto.tipoIdentificador)) {
        throw new BadRequestException('tipoIdentificador inválido.');
      }
      data.tipoIdentificador = dto.tipoIdentificador;
    }
    if (dto.cei !== undefined) data.cei = dto.cei?.trim() || null;
    if (dto.endereco !== undefined) data.endereco = dto.endereco?.trim() || null;

    // Geocerca: valida que os 3 campos vão juntos (todos nulos ou todos preenchidos).
    const algumGeocerca =
      dto.latitudeReferencia !== undefined ||
      dto.longitudeReferencia !== undefined ||
      dto.raioMetros !== undefined;
    if (algumGeocerca) {
      const lat =
        dto.latitudeReferencia !== undefined
          ? dto.latitudeReferencia
          : existente.latitudeReferencia;
      const lon =
        dto.longitudeReferencia !== undefined
          ? dto.longitudeReferencia
          : existente.longitudeReferencia;
      const raio =
        dto.raioMetros !== undefined ? dto.raioMetros : existente.raioMetros;
      this.validarGeocercaPayload({
        latitudeReferencia: lat,
        longitudeReferencia: lon,
        raioMetros: raio,
      });
      if (dto.latitudeReferencia !== undefined) data.latitudeReferencia = dto.latitudeReferencia;
      if (dto.longitudeReferencia !== undefined) data.longitudeReferencia = dto.longitudeReferencia;
      if (dto.raioMetros !== undefined) data.raioMetros = dto.raioMetros;
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.principal === true) {
        await tx.empregador.updateMany({
          where: { principal: true, id: { not: id } },
          data: { principal: false },
        });
        data.principal = true;
      } else if (dto.principal === false) {
        data.principal = false;
      }
      return tx.empregador.update({ where: { id }, data });
    });
  }

  async remover(id: number) {
    const existente = await this.prisma.empregador.findUnique({ where: { id } });
    if (!existente) throw new NotFoundException('Empregador não encontrado.');
    if (existente.principal) {
      throw new BadRequestException('Não é possível remover o empregador principal.');
    }
    await this.prisma.empregador.delete({ where: { id } });
    return { ok: true };
  }
}
