import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.fornecedor.findMany({
      where: { ativo: true },
      orderBy: { razaoSocial: 'asc' },
    });
  }

  async findAllIncludingInactive() {
    return this.prisma.fornecedor.findMany({
      orderBy: { razaoSocial: 'asc' },
    });
  }

  async findOne(id: number) {
    const fornecedor = await this.prisma.fornecedor.findUnique({
      where: { id },
    });

    if (!fornecedor) {
      throw new NotFoundException(`Fornecedor com ID ${id} não encontrado`);
    }

    return fornecedor;
  }

  async create(data: CreateSupplierDto) {
    // Verificar se CNPJ já existe
    const existingSupplier = await this.prisma.fornecedor.findUnique({
      where: { cnpj: data.cnpj },
    });

    if (existingSupplier) {
      throw new BadRequestException('CNPJ já cadastrado');
    }

    return this.prisma.fornecedor.create({
      data: {
        razaoSocial: data.razaoSocial,
        nomeFantasia: data.nomeFantasia,
        cnpj: data.cnpj,
        endereco: data.endereco,
        contato: data.contato,
        ativo: data.ativo ?? true,
      },
    });
  }

  async update(id: number, data: UpdateSupplierDto) {
    const fornecedor = await this.findOne(id);

    // Se estiver atualizando o CNPJ, verificar se já existe
    if (data.cnpj && data.cnpj !== fornecedor.cnpj) {
      const existingSupplier = await this.prisma.fornecedor.findUnique({
        where: { cnpj: data.cnpj },
      });

      if (existingSupplier) {
        throw new BadRequestException('CNPJ já cadastrado');
      }
    }

    return this.prisma.fornecedor.update({
      where: { id },
      data: {
        ...data,
        dataAtualizacao: new Date(),
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.fornecedor.delete({
      where: { id },
    });
  }

  async toggleActive(id: number) {
    const fornecedor = await this.findOne(id);

    return this.prisma.fornecedor.update({
      where: { id },
      data: {
        ativo: !fornecedor.ativo,
        dataAtualizacao: new Date(),
      },
    });
  }

  async fetchCNPJData(cnpj: string) {
    // Limpar CNPJ (remover caracteres não numéricos)
    const cleaned = cnpj.replace(/\D/g, '');

    if (cleaned.length !== 14) {
      throw new BadRequestException('CNPJ inválido. Deve conter 14 dígitos.');
    }

    try {
      // Usando a API ReceitaWS (gratuita e sem necessidade de autenticação)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos de timeout

      const response = await fetch(`https://www.receitaws.com.br/v1/cnpj/${cleaned}`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new BadRequestException('Erro ao buscar dados do CNPJ na ReceitaWS');
      }

      const data = await response.json();

      // Verificar se a API retornou erro
      if (data.status === 'ERROR' || data.status === 'INVALID') {
        throw new BadRequestException(data.message || 'CNPJ não encontrado ou inválido');
      }

      // Formatar endereço
      const enderecoParts: string[] = [];
      if (data.logradouro) {
        enderecoParts.push(String(data.logradouro));
        if (data.numero) {
          enderecoParts.push(`Nº ${data.numero}`);
        }
      }
      if (data.bairro) {
        enderecoParts.push(String(data.bairro));
      }
      if (data.municipio) {
        enderecoParts.push(String(data.municipio));
      }
      if (data.uf) {
        enderecoParts.push(String(data.uf));
      }
      if (data.cep) {
        enderecoParts.push(`CEP: ${data.cep}`);
      }

      const endereco = enderecoParts.length > 0 ? enderecoParts.join(', ') : null;

      // Retornar dados formatados
      return {
        razaoSocial: data.nome || null,
        nomeFantasia: data.fantasia || data.nome || null,
        endereco: endereco,
        contato: data.telefone || data.email || null,
        cnpj: cleaned,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new BadRequestException('Tempo de espera excedido ao buscar dados do CNPJ');
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        error.message || 'Erro ao buscar dados do CNPJ. Verifique se o CNPJ está correto.',
      );
    }
  }
}
