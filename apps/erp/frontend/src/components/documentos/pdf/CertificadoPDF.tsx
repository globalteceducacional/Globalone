import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { camposAplicacao, tiposPrograma } from '../../../constants/certificado';
import { CABECALHO_URL, RODAPE_URL } from '../../../constants/imagensCertificado';

const styles = StyleSheet.create({
  page: {
    fontSize: 12,
    fontFamily: 'Helvetica',
    flexDirection: 'column',
    paddingTop: 80,
    paddingBottom: 100,
  },
  cabecalho: { width: '100%', height: 80, position: 'absolute', top: 0, left: 0, right: 0 },
  rodape: { width: '100%', height: 80, position: 'absolute', bottom: 0, left: 0, right: 0 },
  conteudo: { paddingHorizontal: 32 },
  section: { marginBottom: 12 },
  titulo: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  label: { fontWeight: 'bold', fontFamily: 'Helvetica-Bold' },
  valor: { marginLeft: 6 },
  lista: { marginLeft: 12, marginTop: 2 },
  itemLista: { marginBottom: 1, fontSize: 11 },
  hash: { fontSize: 10, marginTop: 16, textAlign: 'center', color: '#333', marginBottom: 0 },
});

export interface CertificadoFormData {
  dataPublicacao: string;
  dataCriacao: string;
  tituloPrograma: string;
  localProjeto: string;
  linguagem: string[];
  campoAplicacao: string[];
  tipoPrograma: string[];
  algoritmoHash: string;
}

interface Props {
  data: CertificadoFormData;
}

export const CertificadoPDF: React.FC<Props> = ({ data }) => {
  const camposAplicacaoSelecionados = data.campoAplicacao.map((id) => {
    const campo = camposAplicacao.find((c) => c.id === id);
    return campo ? `${campo.id} - ${campo.descricao}` : id;
  });
  const tiposProgramaSelecionados = data.tipoPrograma.map((id) => {
    const tipo = tiposPrograma.find((t) => t.id === id);
    return tipo ? `${tipo.id} - ${tipo.descricao}` : id;
  });

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.cabecalho} fixed>
          <Image src={CABECALHO_URL} style={{ width: '100%', height: '100%' }} />
        </View>
        <View style={styles.conteudo}>
          <Text style={styles.titulo}>CERTIFICADO DE PROGRAMA DE COMPUTADOR</Text>
          <View style={styles.section}>
            <Text style={styles.label}>Data de Publicação:</Text>
            <Text style={styles.valor}>{data.dataPublicacao || 'Ainda não publicado'}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Data de Criação:</Text>
            <Text style={styles.valor}>{data.dataCriacao}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Título do Programa:</Text>
            <Text style={styles.valor}>{data.tituloPrograma}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Local do Projeto:</Text>
            <Text style={styles.valor}>{data.localProjeto}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Linguagem:</Text>
            <Text style={styles.valor}>
              {Array.isArray(data.linguagem) ? data.linguagem.join(', ') : data.linguagem}
            </Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Campo de Aplicação:</Text>
            <View style={styles.lista}>
              {camposAplicacaoSelecionados.map((campo, index) => (
                <Text key={index} style={styles.itemLista}>{campo}</Text>
              ))}
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Tipo de Programa:</Text>
            <View style={styles.lista}>
              {tiposProgramaSelecionados.map((tipo, index) => (
                <Text key={index} style={styles.itemLista}>{tipo}</Text>
              ))}
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Algoritmo Hash:</Text>
            <Text style={styles.valor}>{data.algoritmoHash}</Text>
          </View>
          <Text style={styles.hash}>
            Certificado de autenticação para comprovar a autoria da aplicação.{'\n'}
            Resumo digital hash: Código que comprova a veracidade e a autoria do software utilizado pela empresa.
          </Text>
        </View>
        <View style={styles.rodape} fixed>
          <Image src={RODAPE_URL} style={{ width: '100%', height: '100%' }} />
        </View>
      </Page>
    </Document>
  );
};
