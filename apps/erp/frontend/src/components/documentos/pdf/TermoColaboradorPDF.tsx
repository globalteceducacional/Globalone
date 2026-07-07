import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import {
  PdfCabecalhoRodape,
  documentoPdfPageStyle,
  documentoPdfLayoutStyles,
} from './documentoPdfLayout';
import {
  TITULO_TERMO_COLABORADOR,
  blocosAnexosTermoColaborador,
  blocosCorpoTermoColaborador,
  montarQualificacaoPartes,
  type ColaboradorTermoData,
  type TermoBloco,
} from './termoColaboradorConteudo';

export type { ColaboradorTermoData };
export { montarQualificacaoPartes as montarTextoIntroducaoTermo } from './termoColaboradorConteudo';

interface Props {
  colaborador: ColaboradorTermoData;
  assinatura?: string | null;
  dataAtual: string;
}

const styles = StyleSheet.create({
  conteudo: {
    paddingHorizontal: 40,
    paddingTop: 8,
  },
  section: { marginBottom: 14 },
  tituloDoc: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 18,
    marginTop: 4,
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.35,
  },
  subtitulo: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 10,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'left',
    lineHeight: 1.35,
  },
  text: {
    fontSize: 11,
    marginBottom: 8,
    lineHeight: 1.55,
    textAlign: 'justify',
    fontFamily: 'Helvetica',
  },
  textoItem: {
    fontSize: 11,
    marginBottom: 6,
    marginLeft: 20,
    lineHeight: 1.55,
    textAlign: 'justify',
    fontFamily: 'Helvetica',
  },
  assinatura: { marginTop: 28, marginBottom: 10, textAlign: 'center' },
  img: { maxWidth: 200, maxHeight: 60, margin: '0 auto' },
  assinaturaTexto: { fontSize: 11, marginBottom: 6, textAlign: 'center', lineHeight: 1.4 },
});

function estiloLinha(linha: string) {
  const t = linha.trim();
  if (
    /^([IVX]+|\d+)\s*[–\-—.]/.test(t) ||
    /^ANEXO\s+[IVX]+/i.test(t) ||
    /^☐/.test(t) ||
    /^PARÁGRAFO/i.test(t)
  ) {
    return styles.textoItem;
  }
  return styles.text;
}

function RenderBloco({ bloco }: { bloco: TermoBloco }) {
  return (
    <View style={styles.section}>
      {bloco.titulo ? <Text style={styles.subtitulo}>{bloco.titulo}</Text> : null}
      {bloco.linhas.map((linha, i) => (
        <Text key={`${bloco.titulo}-${i}`} style={estiloLinha(linha)}>
          {linha}
        </Text>
      ))}
    </View>
  );
}

function RenderBlocos({ blocos }: { blocos: TermoBloco[] }) {
  return (
    <>
      {blocos.map((bloco) => (
        <RenderBloco key={bloco.titulo} bloco={bloco} />
      ))}
    </>
  );
}

function PaginaAnexo({ bloco }: { bloco: TermoBloco }) {
  return (
    <Page size="A4" style={documentoPdfPageStyle} wrap>
      <PdfCabecalhoRodape>
        <View style={[documentoPdfLayoutStyles.conteudo, styles.conteudo]}>
          <RenderBloco bloco={bloco} />
        </View>
      </PdfCabecalhoRodape>
    </Page>
  );
}

export const TermoColaboradorPDF: React.FC<Props> = ({ colaborador, assinatura, dataAtual }) => {
  const nome = colaborador.nome?.trim() || '[NOME COMPLETO DO COLABORADOR]';
  const cpf = colaborador.cpf?.trim() || 'xxxxxxxxxxxx';
  const blocosAnexos = blocosAnexosTermoColaborador(colaborador, dataAtual);
  const indiceAnexos = blocosAnexos[0];
  const anexosPorPagina = blocosAnexos.slice(1);

  return (
    <Document>
      <Page size="A4" style={documentoPdfPageStyle} wrap>
        <PdfCabecalhoRodape>
          <View style={[documentoPdfLayoutStyles.conteudo, styles.conteudo]}>
            <Text style={styles.tituloDoc}>{TITULO_TERMO_COLABORADOR}</Text>
            <View style={styles.section}>
              {montarQualificacaoPartes(colaborador)
                .split('\n')
                .filter(Boolean)
                .map((linha, i) => (
                  <Text key={`intro-${i}`} style={styles.text}>
                    {linha}
                  </Text>
                ))}
            </View>
            <RenderBlocos blocos={blocosCorpoTermoColaborador()} />
            <View style={styles.section} wrap={false}>
              <Text style={styles.text}>{dataAtual || 'São Luís – MA, ___ de _________ de 20__.'}</Text>
              <View style={styles.assinatura}>
                <Text style={styles.assinaturaTexto}>________________________________________________</Text>
                <Text style={styles.assinaturaTexto}>GLOBALTEC TECNOLOGIAS EDUCACIONAIS LTDA</Text>
                <Text style={styles.assinaturaTexto}>CNPJ 30.570.278/0001-65</Text>
              </View>
              <View style={styles.assinatura}>
                {assinatura ? <Image src={assinatura} style={styles.img} /> : null}
                <Text style={styles.assinaturaTexto}>_______________________________________________</Text>
                <Text style={styles.assinaturaTexto}>{nome}</Text>
                <Text style={styles.assinaturaTexto}>CPF {cpf}</Text>
              </View>
            </View>
          </View>
        </PdfCabecalhoRodape>
      </Page>

      {indiceAnexos ? <PaginaAnexo bloco={indiceAnexos} /> : null}
      {anexosPorPagina.map((bloco) => (
        <PaginaAnexo key={bloco.titulo} bloco={bloco} />
      ))}
    </Document>
  );
};
