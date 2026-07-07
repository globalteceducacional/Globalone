import * as fs from 'fs';
import { TipoDocumento } from './documentos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertAssinaturaDigitalPdf, normalizarCpf } from './pdf-assinatura.util';

const TIPOS_COM_ASSINATURA_DIGITAL = new Set<TipoDocumento>(['fornecedor', 'estagiario']);

export function tipoRequerAssinaturaDigital(tipo: string): boolean {
  return TIPOS_COM_ASSINATURA_DIGITAL.has(tipo as TipoDocumento);
}

export async function validarUploadAssinadoSeNecessario(
  file: Express.Multer.File,
  tipo: TipoDocumento,
  opts: {
    cpfEsperado?: string | null;
    usuarioId?: number;
    prisma?: PrismaService;
  },
): Promise<void> {
  if (!TIPOS_COM_ASSINATURA_DIGITAL.has(tipo)) return;
  if (!file.path) {
    throw new Error('Arquivo temporário não encontrado.');
  }

  let cpfEsperado = normalizarCpf(opts.cpfEsperado);
  if (cpfEsperado.length !== 11 && opts.usuarioId && opts.prisma) {
    const usuario = await opts.prisma.usuario.findUnique({
      where: { id: opts.usuarioId },
      select: { cpf: true },
    });
    if (usuario?.cpf) {
      cpfEsperado = normalizarCpf(usuario.cpf);
    }
  }

  const buffer = fs.readFileSync(file.path);
  try {
    assertAssinaturaDigitalPdf(
      buffer,
      cpfEsperado.length === 11 ? cpfEsperado : null,
    );
  } catch (err) {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    throw err;
  }
}
