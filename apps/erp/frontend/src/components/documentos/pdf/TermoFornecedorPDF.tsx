import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import {
  PdfCabecalhoRodape,
  documentoPdfPageStyle,
  documentoPdfLayoutStyles,
} from './documentoPdfLayout';

export interface EmpresaData {
  razaoSocial: string;
  tipoEmpresa: string;
  cidade: string;
  estado: string;
  rua: string;
  numero: string;
  cep: string;
  bairro: string;
  cnpj: string;
  nomeRepresentante: string;
  identidade: string;
  orgaoExpedidor: string;
  cpf: string;
  denominacao: string;
}

interface Props {
  empresa: EmpresaData;
  assinatura?: string | null;
  dataAtual: string;
}

const styles = StyleSheet.create({
  section: { marginBottom: 14 },
  titulo: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
  },
  subtitulo: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    fontFamily: 'Helvetica-Bold',
  },
  text: { fontSize: 12, marginBottom: 8, lineHeight: 1.6, textAlign: 'justify' },
  assinatura: { marginTop: 24, marginBottom: 8, textAlign: 'center' },
  img: { maxWidth: 200, maxHeight: 60, margin: '0 auto' },
  assinaturaTexto: { fontSize: 12, marginBottom: 6, textAlign: 'center' },
});

export const TermoFornecedorPDF: React.FC<Props> = ({ empresa, assinatura, dataAtual }) => (
  <Document>
    <Page size="A4" style={documentoPdfPageStyle} wrap>
      <PdfCabecalhoRodape>
        <View style={documentoPdfLayoutStyles.conteudo}>
          <Text style={styles.titulo}>ACORDO DE CONFIDENCIALIDADE, PROTEÇÃO DE DADOS E NÃO CONCORRÊNCIA</Text>
          <View style={styles.section}>
            <Text style={styles.subtitulo}>PARTES</Text>
            <Text style={styles.text}>
              {`De um lado, ${empresa.razaoSocial}, pessoa jurídica de direito público ou privado, enquadrada como ${empresa.tipoEmpresa}, inscrita no CNPJ sob o nº ${empresa.cnpj}, com sede na ${empresa.rua}, nº ${empresa.numero}, Bairro ${empresa.bairro}, CEP ${empresa.cep}, ${empresa.cidade}/${empresa.estado}, neste ato representada por seu Sócio Administrador, Sr. ${empresa.nomeRepresentante}, portador da Cédula de Identidade nº ${empresa.identidade}, expedida por ${empresa.orgaoExpedidor}, inscrito no CPF sob o nº ${empresa.cpf}, doravante denominada simplesmente CONTRATADA.`}
            </Text>
            <Text style={styles.text}>
              E, de outro lado, GLOBALTEC TECNOLOGIAS EDUCACIONAIS LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 30.570.278/0001-65, com sede na Rua Dois, nº 5, Bairro Angelim, CEP 65.060-641, São Luís/MA, neste ato representada por seu Sócio Administrador, Sr. RAIMUNDO KLEBER CASTRO SANTOS, doravante denominada GLOBALTEC.
            </Text>
            <Text style={styles.text}>
              As partes, de comum acordo, celebram o presente Acordo de Confidencialidade, Proteção de Dados e Não Concorrência.
            </Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.subtitulo}>CLÁUSULA PRIMEIRA — INFORMAÇÕES CONFIDENCIAIS</Text>
            <Text style={styles.text}>1.1. Entendem-se como Informações Confidenciais todas as informações acessadas, recebidas ou conhecidas pelas partes, de qualquer natureza (técnica, operacional, financeira, jurídica, estratégica ou pessoal), relativas às atividades, projetos, colaboradores, clientes e fornecedores da outra parte, bem como quaisquer dados pessoais protegidos nos termos da LGPD.</Text>
            <Text style={styles.text}>1.2. As Informações Confidenciais permanecem de propriedade exclusiva da parte reveladora e não poderão ser utilizadas, copiadas, reproduzidas ou divulgadas sem autorização expressa e escrita.</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.subtitulo}>CLÁUSULA SEGUNDA — PROTEÇÃO DE DADOS</Text>
            <Text style={styles.text}>2.1. As partes obrigam-se a proteger os dados pessoais e sensíveis acessados em decorrência deste acordo, observando os princípios e obrigações previstos na LGPD.</Text>
            <Text style={styles.text}>2.2. A CONTRATADA compromete-se a adotar todas as medidas técnicas e organizacionais aptas a proteger os dados pessoais contra acessos não autorizados.</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.subtitulo}>CLÁUSULA TERCEIRA — NÃO CONCORRÊNCIA</Text>
            <Text style={styles.text}>a) A não divulgar, reproduzir ou utilizar segredos comerciais e industriais da GLOBALTEC.</Text>
            <Text style={styles.text}>b) A não contratar, diretamente ou por interposta pessoa, qualquer funcionário ou colaborador da GLOBALTEC pelo prazo de 5 anos após o término do contrato.</Text>
            <Text style={styles.text}>c) A não prestar serviços em atividades concorrentes às da GLOBALTEC pelo prazo de 5 anos contados do encerramento do vínculo contratual.</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.subtitulo}>CLÁUSULA QUARTA — VIGÊNCIA</Text>
            <Text style={styles.text}>O presente acordo terá vigência de 10 (dez) anos a partir da data de sua assinatura.</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.subtitulo}>CLÁUSULA QUINTA — PENALIDADES</Text>
            <Text style={styles.text}>5.1. O descumprimento de qualquer cláusula ensejará indenização integral por perdas e danos diretos, indiretos e lucros cessantes.</Text>
            <Text style={styles.text}>5.2. Além disso, a parte infratora estará sujeita ao pagamento de multa equivalente a 5 vezes o valor total do contrato, sem prejuízo das medidas judiciais cabíveis.</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.subtitulo}>CLÁUSULA SEXTA — FORO</Text>
            <Text style={styles.text}>Fica eleito o foro da Comarca de São Luís/MA para dirimir quaisquer controvérsias oriundas deste instrumento.</Text>
          </View>
          <Text style={styles.text}>
            E por estarem assim justas e contratadas, firmam o presente instrumento em 02 (duas) vias de igual teor e forma, juntamente com 02 (duas) testemunhas.
          </Text>
          <Text style={styles.text}>{dataAtual}</Text>
          <View style={styles.assinatura} wrap={false}>
            {assinatura ? <Image src={assinatura} style={styles.img} /> : null}
            <Text style={styles.assinaturaTexto}>_____________________________________________________</Text>
            <Text style={styles.assinaturaTexto}>{empresa.razaoSocial}</Text>
            <Text style={styles.assinaturaTexto}>CNPJ Nº {empresa.cnpj}</Text>
          </View>
          <View style={styles.assinatura} wrap={false}>
            <Text style={styles.assinaturaTexto}>_________________________________________________</Text>
            <Text style={styles.assinaturaTexto}>GLOBALTEC TECNOLOGIAS EDUCACIONAIS LTDA</Text>
            <Text style={styles.assinaturaTexto}>CNPJ: 30.570.278/0001-65</Text>
          </View>
          <View style={styles.assinatura} wrap={false}>
            <Text style={styles.assinaturaTexto}>_________________________________________________</Text>
            <Text style={styles.assinaturaTexto}>Testemunha 01: _________________________ CPF: _______________</Text>
            <Text style={styles.assinaturaTexto}> </Text>
            <Text style={styles.assinaturaTexto}>_________________________________________________</Text>
            <Text style={styles.assinaturaTexto}>Testemunha 02: _________________________ CPF: _______________</Text>
          </View>
        </View>
      </PdfCabecalhoRodape>
    </Page>
  </Document>
);
