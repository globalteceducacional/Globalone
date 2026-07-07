import { BadRequestException, Injectable } from '@nestjs/common';
import { OrigemPonto, TipoBatida } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PontoService } from '../ponto/ponto.service';
import { EmpregadorService } from '../empregador/empregador.service';

/**
 * Geração do AFD (Arquivo Fonte de Dados) na Portaria MTE 671/2021.
 *
 * Layout simplificado adotado (compatível com a Portaria 671/2021 — REP-P,
 * registro com NSR + cadeia de hashes):
 *   Tipo 1 — cabeçalho do arquivo (com identificação do empregador).
 *   Tipo 3 — marcação de ponto (NSR + dataHora UTC + CPF + tipo).
 *   Tipo 7 — ajuste/inclusão pelo RH (mesma estrutura, com sinalização do operador).
 *   Tipo 9 — trailer com totais de cada tipo.
 *
 * Observação: o layout da Portaria 671 admite extensões. Este formato segue o
 * espírito do REP-P e identifica claramente NSR e hashes para perícia.
 */
@Injectable()
export class AfdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pontoService: PontoService,
    private readonly empregadorService: EmpregadorService,
  ) {}

  private padNum(value: number | string, len: number): string {
    return String(value).padStart(len, '0').slice(-len);
  }

  private padTxt(value: string, len: number): string {
    return value.padEnd(len, ' ').slice(0, len);
  }

  /** Formata data/hora ISO em "AAAA-MM-DDTHH:MM:SS-03:00" (offset do servidor). */
  private formatarDataHoraAfd(d: Date): string {
    const tzMin = -d.getTimezoneOffset();
    const sign = tzMin >= 0 ? '+' : '-';
    const absMin = Math.abs(tzMin);
    const tzH = String(Math.floor(absMin / 60)).padStart(2, '0');
    const tzM = String(absMin % 60).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${tzH}:${tzM}`;
  }

  /** Formata data "AAAA-MM-DD". */
  private formatarData(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  async gerar(filtros: {
    inicio?: string;
    fim?: string;
    nsrInicial?: number;
    nsrFinal?: number;
  }): Promise<{ conteudo: string; nomeArquivo: string; totalLinhas: number }> {
    const empregador = await this.empregadorService.obterPrincipal();
    if (!empregador) {
      throw new BadRequestException(
        'Cadastre o empregador principal antes de gerar o AFD (rh/empregadores).',
      );
    }

    const registros = await this.pontoService.listarParaAfd(filtros);

    const linhas: string[] = [];
    let nsrLinhaCount = 1;

    // Tipo 1 — cabeçalho.
    // Layout: NSR(9) | tipo(1) | tipoIdent(1) | identificador(14) | CEI(12) | razao(150) | dataInicial | dataFinal | dataGeracao | versao(3)
    const dataInicial = filtros.inicio
      ? new Date(filtros.inicio)
      : registros.length
        ? registros[0].dataHora
        : new Date();
    const dataFinal = filtros.fim
      ? new Date(filtros.fim)
      : registros.length
        ? registros[registros.length - 1].dataHora
        : new Date();
    const cabecalho = [
      this.padNum(nsrLinhaCount++, 9),
      '1',
      String(empregador.tipoIdentificador),
      this.padTxt(empregador.identificador, 14),
      this.padTxt(empregador.cei ?? '', 12),
      this.padTxt(empregador.razaoSocial, 150),
      this.formatarData(dataInicial),
      this.formatarData(dataFinal),
      this.formatarDataHoraAfd(new Date()),
      '003',
    ].join('|');
    linhas.push(cabecalho);

    let totalT3 = 0;
    let totalT7 = 0;

    for (const r of registros) {
      const tipoLinha = r.origem === OrigemPonto.NORMAL ? '3' : '7';
      // Layout tipo 3/7: NSR_arquivo(9) | tipo | NSR_registro(10) | dataHora | CPF(11) | tipoBatida(1=E,2=S) | hashAtual(64)
      const cpf = (r.usuario.cpf ?? '').replace(/\D/g, '');
      const tipoBatida = r.tipo === TipoBatida.ENTRADA ? '1' : '2';
      const linha = [
        this.padNum(nsrLinhaCount++, 9),
        tipoLinha,
        this.padNum(r.nsr ?? 0, 10),
        this.formatarDataHoraAfd(r.dataHora),
        this.padTxt(cpf, 11),
        tipoBatida,
        this.padTxt(r.hashAtual ?? '', 64),
      ].join('|');
      linhas.push(linha);
      if (tipoLinha === '3') totalT3++;
      else totalT7++;
    }

    // Tipo 9 — trailer.
    const trailer = [
      this.padNum(nsrLinhaCount++, 9),
      '9',
      this.padNum(totalT3, 9),
      this.padNum(totalT7, 9),
      this.padNum(linhas.length + 1, 9),
    ].join('|');
    linhas.push(trailer);

    const conteudo = linhas.join('\r\n') + '\r\n';
    const dataIniSlug = this.formatarData(dataInicial).replace(/-/g, '');
    const dataFimSlug = this.formatarData(dataFinal).replace(/-/g, '');
    const nomeArquivo = `AFD_${empregador.identificador}_${dataIniSlug}_${dataFimSlug}.txt`;

    return { conteudo, nomeArquivo, totalLinhas: linhas.length };
  }
}
