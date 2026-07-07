import React from 'react';
import { View, Image, StyleSheet } from '@react-pdf/renderer';
import { CABECALHO_URL, RODAPE_URL } from '../../../constants/imagensCertificado';

/** Alturas alinhadas às imagens em /public/documentos/ */
export const PDF_CABECALHO_H = 80;
export const PDF_RODAPE_H = 80;

export const documentoPdfPageStyle = {
  fontSize: 12,
  fontFamily: 'Helvetica',
  flexDirection: 'column' as const,
  paddingTop: PDF_CABECALHO_H,
  paddingBottom: PDF_RODAPE_H,
};

export const documentoPdfLayoutStyles = StyleSheet.create({
  cabecalho: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: PDF_CABECALHO_H,
  },
  rodape: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: PDF_RODAPE_H,
  },
  fill: { width: '100%', height: '100%' },
  conteudo: { paddingHorizontal: 32 },
});

/** Cabeçalho e rodapé fixos em todas as páginas (usar dentro de `<Page wrap>`). */
export function PdfCabecalhoRodape({ children }: { children: React.ReactNode }) {
  return (
    <>
      <View style={documentoPdfLayoutStyles.cabecalho} fixed>
        <Image src={CABECALHO_URL} style={documentoPdfLayoutStyles.fill} />
      </View>
      {children}
      <View style={documentoPdfLayoutStyles.rodape} fixed>
        <Image src={RODAPE_URL} style={documentoPdfLayoutStyles.fill} />
      </View>
    </>
  );
}
