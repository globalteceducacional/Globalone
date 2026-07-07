import { BadRequestException } from '@nestjs/common';
import * as forge from 'node-forge';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const verifyHelpers = require('@jonz94/verify-pdf/lib/helpers') as {
  extractSignature: (pdf: Buffer) => {
    signatureStr: string[];
    signedData: Buffer[];
  };
  getMessageFromSignature: (signature: string) => {
    certificates: forge.pki.Certificate[];
    rawCapture: {
      signature: string;
      authenticatedAttributes: forge.asn1.Asn1[];
      digestAlgorithm: string;
    };
  };
  isCertsExpired: (certs: forge.pki.Certificate[]) => boolean;
  getClientCertificate: (certs: forge.pki.Certificate[]) => forge.pki.Certificate;
  sortCertificateChain: (certs: forge.pki.Certificate[]) => forge.pki.Certificate[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { extractCertificatesDetails } = require('@jonz94/verify-pdf/lib/certificateDetails') as {
  extractCertificatesDetails: (certs: forge.pki.Certificate[]) => CertMeta[];
};

const CPF_OID = '2.16.76.1.3.1';
/** Bytes DER do OID 2.16.76.1.3.1 (CPF ICP-Brasil). */
const CPF_OID_BYTES = '\x60\x4c\x01\x03\x01';

const SUBFILTERS_SUPORTADOS = new Set([
  'adbe.pkcs7.detached',
  'adbe.pkcs7.sha1',
  'etsi.cades.detached',
]);

type CertMeta = {
  clientCertificate?: boolean;
  issuedTo?: Record<string, string>;
  pemCertificate?: string;
};

export type ResultadoValidacaoAssinatura = {
  valida: boolean;
  motivo?: string;
  signatario?: string;
  cpfCertificado?: string;
};

export function normalizarCpf(cpf: string | null | undefined): string {
  return String(cpf ?? '').replace(/\D/g, '');
}

function pdfComoLatin1(buffer: Buffer): string {
  return buffer.toString('latin1');
}

/** Detecta campo de assinatura embutido (Gov.br, e-CPF, Adobe PPKLite, PAdES). */
function pdfTemCampoAssinatura(buffer: Buffer): boolean {
  const pdf = pdfComoLatin1(buffer);
  return (
    /\/Type\s*\/Sig\b/.test(pdf) &&
    /\/ByteRange\s*\[/.test(pdf) &&
    /\/Contents\s*[\(<]/.test(pdf)
  );
}

function extrairSubFilters(buffer: Buffer): string[] {
  const pdf = pdfComoLatin1(buffer);
  const matches = pdf.match(/\/SubFilter\s*\/?\s*([A-Za-z0-9._-]+)/g) ?? [];
  return matches.map((m) =>
    m
      .replace(/\/SubFilter\s*\/?\s*/i, '')
      .trim()
      .toLowerCase(),
  );
}

function subFilterSuportado(buffer: Buffer): boolean {
  const filters = extrairSubFilters(buffer);
  if (filters.length === 0) {
    // Alguns assinadores omiten SubFilter mas mantêm /Type /Sig + ByteRange
    return pdfTemCampoAssinatura(buffer);
  }
  return filters.some((f) => {
    if (SUBFILTERS_SUPORTADOS.has(f)) return true;
    return f.includes('pkcs7') || f.includes('cades') || f.includes('pades');
  });
}

function cpfDeValorBruto(raw: string): string | null {
  const digits = normalizarCpf(raw);
  if (digits.length === 11) return digits;
  const embedded = raw.replace(/[^\d]/g, '');
  if (embedded.length >= 11) {
    const candidate = embedded.length === 11 ? embedded : embedded.slice(-11);
    if (candidate.length === 11) return candidate;
  }
  return null;
}

/** CPF no otherName ICP-Brasil: 8 dígitos nascimento (DDMMAAAA) + 11 dígitos CPF. */
function cpfDeOtherNameIcpBrasil(raw: string): string | null {
  if (raw.length >= 19) {
    const cpf = raw.slice(8, 19);
    if (/^\d{11}$/.test(cpf)) return cpf;
  }
  return cpfDeValorBruto(raw);
}

function oidEhCpfIcpBrasil(oidBytes: string): boolean {
  if (!oidBytes) return false;
  if (oidBytes === CPF_OID_BYTES || oidBytes.toLowerCase() === CPF_OID_BYTES.toLowerCase()) {
    return true;
  }
  try {
    const oidAsn1 = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.OID,
      false,
      oidBytes,
    );
    return forge.asn1.derToOid(forge.asn1.toDer(oidAsn1).getBytes()) === CPF_OID;
  } catch {
    return false;
  }
}

function extrairOctetStringAninhado(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const asn1 = node as forge.asn1.Asn1;
  if (asn1.type === forge.asn1.Type.OCTETSTRING && typeof asn1.value === 'string') {
    return asn1.value;
  }
  if (Array.isArray(asn1.value)) {
    for (const child of asn1.value) {
      const found = extrairOctetStringAninhado(child);
      if (found) return found;
    }
  }
  return null;
}

function extrairCpfDeSubjectAltName(cert: forge.pki.Certificate): string | null {
  const san = cert.getExtension('subjectAltName') as
    | { altNames?: Array<{ type: number; value: unknown }> }
    | undefined;
  if (!san?.altNames?.length) return null;

  for (const alt of san.altNames) {
    if (alt.type !== 0 || !Array.isArray(alt.value) || alt.value.length < 2) continue;
    const oidNode = alt.value[0] as { value?: string };
    if (!oidEhCpfIcpBrasil(String(oidNode?.value ?? ''))) continue;
    const raw = extrairOctetStringAninhado(alt.value[1]);
    if (!raw) continue;
    const cpf = cpfDeOtherNameIcpBrasil(raw);
    if (cpf) return cpf;
  }
  return null;
}

function extrairCpfDeCertForge(cert: forge.pki.Certificate): string | null {
  for (const attr of cert.subject.attributes) {
    const cpf = cpfDeValorBruto(String(attr.value ?? ''));
    if (cpf) return cpf;
  }

  for (const ext of cert.extensions ?? []) {
    if (ext.id !== CPF_OID && ext.name !== 'cpf') continue;
    if (!ext.value) continue;
    const raw =
      typeof ext.value === 'string'
        ? ext.value
        : forge.util.createBuffer(ext.value as string).toString();
    const cpf = cpfDeOtherNameIcpBrasil(raw) ?? cpfDeValorBruto(raw);
    if (cpf) return cpf;
  }

  return extrairCpfDeSubjectAltName(cert);
}

function extrairCpfDePem(pem: string): string | null {
  try {
    const cert = forge.pki.certificateFromPem(pem);
    return extrairCpfDeCertForge(cert);
  } catch {
    // ignora
  }
  return null;
}

function extrairCpfsDeCertMeta(certs: CertMeta[]): string[] {
  const cpfs = new Set<string>();
  for (const cert of certs) {
    for (const valor of Object.values(cert.issuedTo ?? {})) {
      const cpf = cpfDeValorBruto(String(valor));
      if (cpf) cpfs.add(cpf);
    }
    if (cert.pemCertificate) {
      const doPem = extrairCpfDePem(cert.pemCertificate);
      if (doPem) cpfs.add(doPem);
    }
  }
  return [...cpfs];
}

function extrairCpfsDeCertificadosForge(certificates: forge.pki.Certificate[]): string[] {
  const cpfs = new Set<string>();
  for (const cert of certificates) {
    const cpf = extrairCpfDeCertForge(cert);
    if (cpf) cpfs.add(cpf);
  }
  return [...cpfs];
}

function extrairNomeSignatario(certs: CertMeta[]): string | undefined {
  const client = certs.find((c) => c.clientCertificate);
  if (!client?.issuedTo) return undefined;
  return (
    client.issuedTo.commonName ??
    client.issuedTo.CN ??
    client.issuedTo.organizationName ??
    undefined
  );
}

function verificarIntegridadeAssinatura(
  signature: string,
  signedData: Buffer,
): { integrity: boolean; certs: CertMeta[]; expired: boolean; certificates: forge.pki.Certificate[] } {
  const message = verifyHelpers.getMessageFromSignature(signature);
  const {
    certificates,
    rawCapture: { signature: sig, authenticatedAttributes: attrs, digestAlgorithm },
  } = message;

  const hashAlgorithmOid = forge.asn1.derToOid(digestAlgorithm);
  const hashAlgorithm = forge.pki.oids[hashAlgorithmOid]?.toLowerCase();
  if (!hashAlgorithm || !forge.md[hashAlgorithm as keyof typeof forge.md]) {
    throw new Error('Algoritmo de hash da assinatura não suportado.');
  }

  const md = forge.md[hashAlgorithm as keyof typeof forge.md] as forge.md.MessageDigest;
  const clientCertificate = verifyHelpers.getClientCertificate(certificates);
  if (!clientCertificate?.publicKey) {
    throw new Error('Certificado do signatário não encontrado na assinatura.');
  }

  const set = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs);
  const digest = md.create().update(forge.asn1.toDer(set).data).digest().getBytes();
  const validAuthenticatedAttributes = clientCertificate.publicKey.verify(digest, sig);
  if (!validAuthenticatedAttributes) {
    return {
      integrity: false,
      certs: extractCertificatesDetails(certificates),
      expired: false,
      certificates,
    };
  }

  const messageDigestAttr = forge.pki.oids.messageDigest;
  const fullAttrDigest = attrs.find(
    (attr) => forge.asn1.derToOid(attr.value[0].value) === messageDigestAttr,
  );
  if (!fullAttrDigest) {
    throw new Error('Atributo messageDigest ausente na assinatura.');
  }

  const attrDigest = fullAttrDigest.value[1].value[0].value;
  const dataDigest = md.create().update(signedData.toString('latin1')).digest().getBytes();
  const integrity = dataDigest === attrDigest;
  const expired = verifyHelpers.isCertsExpired(certificates);
  const cadeiaOrdenada = verifyHelpers.sortCertificateChain(certificates);

  return {
    integrity,
    certs: extractCertificatesDetails(cadeiaOrdenada),
    expired,
    certificates: cadeiaOrdenada,
  };
}

function traduzirErroValidacao(msg: string): string {
  const lower = msg.toLowerCase();
  if (
    lower.includes('cannot find subfilter') ||
    lower.includes('failed to locate byterange') ||
    lower.includes('byterange')
  ) {
    return 'Este PDF não contém assinatura digital. Assine com Gov.br ou e-CPF e envie o arquivo assinado — não envie o PDF "para assinar" sem assinatura.';
  }
  if (lower.includes('not supported') || lower.includes('subfilter')) {
    return 'Tipo de assinatura digital não reconhecido. Use Gov.br, e-CPF ou certificado ICP-Brasil (PAdES).';
  }
  if (lower.includes('wrong authenticated')) {
    return 'A assinatura digital é inválida ou o documento foi alterado após a assinatura.';
  }
  return msg;
}

/**
 * Valida assinatura digital embutida em PDF (integridade, certificado e CPF opcional).
 * Compatível com Gov.br / e-CPF (ETSI.CAdES.detached e adbe.pkcs7.detached).
 */
export function validarAssinaturaDigitalPdf(
  buffer: Buffer,
  cpfEsperado?: string | null,
): ResultadoValidacaoAssinatura {
  if (!pdfTemCampoAssinatura(buffer)) {
    return {
      valida: false,
      motivo:
        'Este PDF não contém assinatura digital. Assine com Gov.br ou e-CPF e envie o arquivo assinado — não envie o PDF "para assinar" sem assinatura.',
    };
  }

  if (!subFilterSuportado(buffer)) {
    return {
      valida: false,
      motivo:
        'Tipo de assinatura digital não reconhecido. Use Gov.br, e-CPF ou certificado ICP-Brasil.',
    };
  }

  try {
    const { signatureStr, signedData } = verifyHelpers.extractSignature(buffer);
    if (!signatureStr.length) {
      return {
        valida: false,
        motivo: 'Não foi possível ler a assinatura digital do PDF.',
      };
    }

    let algumaIntegridadeOk = false;
    let algumExpirado = false;
    let certsReferencia: CertMeta[] = [];
    let certsForgeReferencia: forge.pki.Certificate[] = [];

    for (let i = 0; i < signatureStr.length; i++) {
      const { integrity, certs, expired, certificates } = verificarIntegridadeAssinatura(
        signatureStr[i],
        signedData[i],
      );
      if (expired) algumExpirado = true;
      if (integrity) {
        algumaIntegridadeOk = true;
        certsReferencia = certs;
        certsForgeReferencia = certificates;
      }
    }

    if (algumExpirado) {
      return {
        valida: false,
        motivo: 'O certificado digital utilizado na assinatura está expirado.',
      };
    }

    if (!algumaIntegridadeOk) {
      return {
        valida: false,
        motivo:
          'A assinatura digital não pôde ser validada. O documento pode ter sido alterado após a assinatura ou a assinatura é inválida.',
      };
    }

    const cpfs = [
      ...extrairCpfsDeCertificadosForge(certsForgeReferencia),
      ...extrairCpfsDeCertMeta(certsReferencia),
    ].filter((cpf, i, arr) => arr.indexOf(cpf) === i);
    const cpfCertificado = cpfs[0];
    const signatario = extrairNomeSignatario(certsReferencia);

    const cpfNorm = normalizarCpf(cpfEsperado);
    if (cpfNorm.length === 11) {
      if (cpfs.length === 0) {
        return {
          valida: false,
          motivo:
            'Não foi possível identificar o CPF no certificado digital. Confirme que assinou com e-CPF ou Gov.br.',
          signatario,
        };
      }
      if (!cpfs.includes(cpfNorm)) {
        const cpfFmt = cpfCertificado
          ? cpfCertificado.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
          : undefined;
        return {
          valida: false,
          motivo: cpfFmt
            ? `O CPF do certificado digital (${cpfFmt}) não confere com o CPF informado no formulário. Corrija o CPF no passo "Dados" e tente novamente.`
            : 'O CPF do certificado digital não confere com o CPF informado no formulário.',
          signatario,
          cpfCertificado,
        };
      }
    }

    return { valida: true, signatario, cpfCertificado };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao validar assinatura do PDF.';
    return { valida: false, motivo: traduzirErroValidacao(msg) };
  }
}

export function assertAssinaturaDigitalPdf(
  buffer: Buffer,
  cpfEsperado?: string | null,
): ResultadoValidacaoAssinatura {
  const resultado = validarAssinaturaDigitalPdf(buffer, cpfEsperado);
  if (!resultado.valida) {
    throw new BadRequestException(resultado.motivo ?? 'Assinatura digital inválida.');
  }
  return resultado;
}
