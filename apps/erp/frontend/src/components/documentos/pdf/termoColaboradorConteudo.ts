import type { TipoVinculoColaborador } from '../../../constants/documentosLabels';

export interface ColaboradorTermoData {
  nome: string;
  tipoVinculo: TipoVinculoColaborador;
  ies: string;
  estadoCivil: string;
  cpf: string;
  rg: string;
  orgaoExpedidor: string;
  cidade: string;
  estado: string;
}

export type TermoBloco = {
  titulo?: string;
  linhas: string[];
};

const EMPRESA =
  'GLOBALTEC TECNOLOGIAS EDUCACIONAIS LTDA., com sede na cidade de São Luís - MA, na Rua Dois, Nº 05, Lote 02 Loteamento Angelim, Bairro Angelim, CEP nº 65.060-641, inscrita no CNPJ 30.570.278/0001-65';

export function montarQualificacaoPartes(d: ColaboradorTermoData): string {
  const nome = d.nome?.trim() || '[NOME COMPLETO DO COLABORADOR]';
  const cpf = d.cpf?.trim() || '______________';
  return `Pelo presente instrumento particular, de um lado:\n${EMPRESA}, doravante denominada EMPRESA; e, de outro lado, ${nome}, inscrito(a) no CPF nº ${cpf}, doravante denominado(a) COLABORADOR(A); resolvem firmar o presente TERMO AUTÔNOMO DE CONFIDENCIALIDADE, SIGILO, PROTEÇÃO DE INFORMAÇÕES, SEGREDO DE NEGÓCIO, PROPRIEDADE INTELECTUAL, PROPRIEDADE INDUSTRIAL E SEGURANÇA DA INFORMAÇÃO, que se regerá pelas cláusulas e condições seguintes.`;
}

/** @deprecated Mantido para compatibilidade com imports antigos. */
export function montarTextoIntroducaoTermo(d: ColaboradorTermoData): string {
  return montarQualificacaoPartes(d);
}

export const TITULO_TERMO_COLABORADOR =
  'TERMO AUTÔNOMO DE CONFIDENCIALIDADE, SIGILO, PROTEÇÃO DE INFORMAÇÕES, SEGREDO DE NEGÓCIO, PROPRIEDADE INTELECTUAL, PROPRIEDADE INDUSTRIAL E SEGURANÇA DA INFORMAÇÃO';

export function blocosCorpoTermoColaborador(): TermoBloco[] {
  return [
    {
      titulo: 'CLÁUSULA PRELIMINAR – AUTONOMIA E FINALIDADE DO INSTRUMENTO',
      linhas: [
        'O presente instrumento constitui documento autônomo destinado à proteção das informações confidenciais, segredos de negócio, ativos tecnológicos, propriedade intelectual, propriedade industrial, dados pessoais, metodologias, processos internos e demais ativos estratégicos da EMPRESA.',
        'Sua celebração não altera remuneração, cargo, função, jornada, benefícios ou quaisquer condições essenciais da relação contratual eventualmente existente entre as PARTES.',
        'As disposições aqui previstas deverão ser interpretadas em conjunto com a legislação brasileira aplicável, especialmente a Constituição Federal, a Consolidação das Leis do Trabalho, o Código Civil, a Lei nº 9.610/1998, a Lei nº 9.609/1998, a Lei nº 9.279/1996, a Lei nº 13.709/2018 e demais normas pertinentes.',
        'O presente instrumento não constitui pacto de não concorrência, restrição ao exercício profissional lícito ou renúncia a direitos legalmente assegurados, destinando-se exclusivamente à proteção dos ativos materiais e imateriais da EMPRESA.',
        'As obrigações que, por sua natureza, devam subsistir após o término da relação profissional permanecerão plenamente válidas e exigíveis, observados os limites da legislação aplicável.',
      ],
    },
    {
      titulo: 'CLÁUSULA 1ª – OBJETO',
      linhas: [
        'O presente Termo tem por objeto disciplinar as obrigações de confidencialidade, sigilo, proteção de informações, segurança da informação, proteção de dados, propriedade intelectual, propriedade industrial e proteção de ativos estratégicos da EMPRESA.',
      ],
    },
    {
      titulo: 'CLÁUSULA 2ª – DEFINIÇÕES',
      linhas: [
        'Para os fins deste instrumento:',
        'I – Informação Confidencial: toda informação não pública relacionada à EMPRESA, independentemente do meio em que esteja armazenada.',
        'II – Segredo Industrial: toda informação estratégica, técnica ou operacional que possua valor econômico em razão de seu caráter sigiloso.',
        'III – Know-how: conhecimentos técnicos, científicos, metodológicos, operacionais ou comerciais desenvolvidos ou utilizados pela EMPRESA.',
        'IV – Ativos Tecnológicos: softwares, algoritmos, modelos de inteligência artificial, códigos-fonte, bancos de dados, APIs, integrações, arquiteturas de sistemas, documentações técnicas e demais ativos digitais.',
        'V – Propriedade Intelectual: toda criação protegida pela Lei nº 9.610/1998, Lei nº 9.609/1998 e legislação correlata.',
        'VI – Propriedade Industrial: patentes, modelos de utilidade, desenhos industriais, marcas, segredos industriais e demais ativos protegidos pela Lei nº 9.279/1996.',
      ],
    },
    {
      titulo: 'CLÁUSULA 3ª – DEVER GERAL DE SIGILO',
      linhas: [
        'O (A) COLABORADOR (A) obriga-se a manter absoluto sigilo sobre todas as Informações Confidenciais às quais tenha acesso.',
        'A obrigação de confidencialidade permanecerá válida durante toda a relação contratual e após seu encerramento, pelo prazo máximo admitido pela legislação aplicável ou enquanto a informação mantiver caráter confidencial.',
      ],
    },
    {
      titulo: 'CLÁUSULA 4ª – INFORMAÇÕES ABRANGIDAS',
      linhas: [
        'Consideram-se confidenciais, entre outras:',
        'I – Estratégias empresariais; II – Planos de negócios; III – Dados financeiros; IV – Listas de clientes; V – Listas de fornecedores; VI – Pesquisas; VII – Projetos; VIII – Documentos internos; IX – Relatórios; X – Códigos-fonte; XI – Softwares; XII – Algoritmos; XIII – Modelos de inteligência artificial; XIV – Datasets; XV – Metodologias; XVI – Documentação técnica; XVII – Processos operacionais; XVIII – Segredos industriais; XIX – Know-how; XX – Informações protegidas pela LGPD.',
        'A presente lista possui natureza exemplificativa e não exaustiva.',
      ],
    },
    {
      titulo: 'CLÁUSULA 5ª – OBRIGAÇÕES DO COLABORADOR',
      linhas: [
        'O (A) COLABORADOR (A) compromete-se a:',
        'I – Utilizar as informações exclusivamente para execução de suas atividades;',
        'II – Proteger credenciais de acesso;',
        'III – Observar as políticas internas de segurança da informação;',
        'IV – Comunicar incidentes de segurança imediatamente;',
        'V – Impedir acessos não autorizados;',
        'VI – Preservar a integridade dos ativos corporativos.',
      ],
    },
    {
      titulo: 'CLÁUSULA 6ª – VEDAÇÕES EXPRESSAS',
      linhas: [
        'É expressamente proibido ao (à) COLABORADOR (A):',
        'I – Copiar informações sem necessidade funcional;',
        'II – Compartilhar documentos internos sem autorização;',
        'III – Encaminhar arquivos corporativos para contas pessoais;',
        'IV – Armazenar documentos corporativos em dispositivos particulares sem autorização;',
        'V – Divulgar informações a terceiros;',
        'VI – Utilizar informações para benefício próprio ou de terceiros;',
        'VII – Reproduzir ou explorar economicamente ativos da EMPRESA.',
      ],
    },
    {
      titulo: 'CLÁUSULA 7ª – PROTEÇÃO DE DADOS PESSOAIS',
      linhas: [
        'O (A) COLABORADOR (A) compromete-se a cumprir integralmente a Lei nº 13.709/2018 (LGPD). É vedado:',
        'I – Compartilhar dados pessoais sem autorização;',
        'II – Tratar dados para finalidades não autorizadas;',
        'III – Transferir dados a terceiros sem autorização formal;',
        'IV – Descumprir políticas internas de privacidade e proteção de dados.',
      ],
    },
    {
      titulo: 'CLÁUSULA 8ª – USO DE INTELIGÊNCIA ARTIFICIAL E FERRAMENTAS EXTERNAS',
      linhas: [
        'O (A) COLABORADOR (A) fica expressamente proibido(a) de inserir, reproduzir, transferir, processar, treinar, alimentar ou disponibilizar em plataformas externas de inteligência artificial, aprendizado de máquina, processamento automatizado ou serviços de terceiros quaisquer:',
        'I – Informações confidenciais; II – Códigos-fonte; III – Documentos internos; IV – Segredos industriais; V – Informações estratégicas; VI – Dados pessoais; VII – Dados sensíveis; VIII – Projetos internos; IX – Algoritmos; X – Modelos proprietários; XI – Pesquisas; XII – Metodologias; XIII – Materiais protegidos por propriedade intelectual;',
        'Salvo autorização prévia, expressa e formal da EMPRESA. Nenhuma autorização tácita poderá ser presumida. O descumprimento desta cláusula será considerado infração grave.',
      ],
    },
    {
      titulo: 'CLÁUSULA 9ª – PROPRIEDADE INTELECTUAL, INDUSTRIAL E TECNOLÓGICA',
      linhas: [
        'Observadas as disposições da CLT, da Lei nº 9.610/1998, da Lei nº 9.609/1998 e da Lei nº 9.279/1996, toda criação desenvolvida pelo(a) COLABORADOR(A) no exercício de suas funções ou mediante utilização de recursos, informações, infraestrutura ou conhecimentos da EMPRESA pertencerá exclusivamente à EMPRESA.',
        'Incluem-se: I – Softwares; II – Códigos-fonte; III – Algoritmos; IV – Modelos de IA; V – Documentos técnicos; VI – Invenções; VII – Melhorias técnicas; VIII – Processos; IX – Metodologias; X – Segredos industriais.',
      ],
    },
    {
      titulo: 'CLÁUSULA 10ª – AUSÊNCIA DE LICENÇA IMPLÍCITA',
      linhas: [
        'O acesso do(a) COLABORADOR(A) a qualquer ativo da EMPRESA não constitui:',
        'I – Cessão; II – Transferência; III – Licença; IV – Autorização de exploração econômica; V – Compartilhamento de titularidade.',
        'Todos os direitos permanecerão de titularidade exclusiva da EMPRESA.',
      ],
    },
    {
      titulo: 'CLÁUSULA 11ª – NÃO RETENÇÃO DE INFORMAÇÕES',
      linhas: [
        'Ao término do vínculo contratual, o(a) COLABORADOR(A) deverá devolver imediatamente:',
        'I – Documentos; II – Equipamentos; III – Credenciais; IV – Arquivos; V – Materiais físicos ou digitais; VI – Informações corporativas.',
        'O(A) COLABORADOR(A) declara que não manterá cópias ou reproduções após o desligamento.',
      ],
    },
    {
      titulo: 'CLÁUSULA 12ª – TENTATIVA DE VAZAMENTO OU APROPRIAÇÃO INDEVIDA',
      linhas: [
        'Constituirá infração grave a tentativa comprovada de:',
        'I – Copiar informações sigilosas; II – Exportar dados sem autorização; III – Compartilhar informações estratégicas; IV – Criar cópias paralelas de ativos corporativos; V – Armazenar informações em ambientes não autorizados; VI – Transferir informações para terceiros.',
        'A tentativa poderá ser comprovada por logs, auditorias, metadados, registros eletrônicos, relatórios técnicos, registros de acesso e evidências digitais legalmente admitidas.',
      ],
    },
    {
      titulo: 'CLÁUSULA 13ª – RESPONSABILIDADE CIVIL E INDENIZAÇÃO',
      linhas: [
        'Sem prejuízo das medidas disciplinares e legais cabíveis, o(a) COLABORADOR(A) responderá pelos danos comprovadamente causados à EMPRESA em decorrência da violação deste Termo.',
        'A indenização poderá compreender: I – Danos materiais; II – Danos emergentes; III – Lucros cessantes; IV – Despesas de investigação; V – Auditorias técnicas; VI – Perícias especializadas; VII – Recuperação de sistemas; VIII – Medidas de contenção de incidentes; IX – Despesas judiciais e administrativas.',
        'PARÁGRAFO ÚNICO. A indenização observará os limites e requisitos estabelecidos pela legislação brasileira aplicável, especialmente a Constituição Federal, a CLT e o Código Civil.',
      ],
    },
    {
      titulo: 'CLÁUSULA 14ª – PROVAS DIGITAIS',
      linhas: [
        'As PARTES reconhecem como meios legítimos de prova:',
        'I – Logs de acesso; II – Registros de autenticação; III – Metadados; IV – Auditorias; V – Registros em sistemas corporativos; VI – E-mails corporativos; VII – Registros eletrônicos; VIII – Assinaturas digitais.',
      ],
    },
    {
      titulo: 'CLÁUSULA 15ª – ASSINATURA ELETRÔNICA',
      linhas: [
        'As PARTES reconhecem a validade jurídica das assinaturas realizadas por meio da plataforma GOV.BR, nos termos da Lei nº 14.063/2020, da Medida Provisória nº 2.200-2/2001 e demais normas aplicáveis. Assinaturas GOV.BR nível Prata ou Ouro produzirão os mesmos efeitos das assinaturas físicas.',
      ],
    },
    {
      titulo: 'CLÁUSULA 16ª – SOBREVIVÊNCIA DAS OBRIGAÇÕES',
      linhas: [
        'As obrigações de confidencialidade, sigilo, proteção de dados, propriedade intelectual, propriedade industrial, segredo industrial e não utilização de informações permanecerão válidas após o encerramento do vínculo empregatício.',
      ],
    },
    {
      titulo: 'CLÁUSULA 17ª – DISPOSIÇÕES FINAIS',
      linhas: [
        'Este Termo constitui instrumento complementar ao contrato de trabalho. A eventual nulidade de qualquer disposição não afetará as demais cláusulas.',
        'O presente instrumento será interpretado em conformidade com a Constituição Federal, CLT, Código Civil, Lei nº 9.610/1998, Lei nº 9.609/1998, Lei nº 9.279/1996, Lei nº 13.709/2018, Lei nº 14.063/2020 e demais normas aplicáveis.',
        'O(A) COLABORADOR(A) declara que leu integralmente este instrumento, compreendeu seu conteúdo e concorda livremente com todas as suas disposições.',
      ],
    },
    {
      titulo: 'CLÁUSULA 18 – DO FORO',
      linhas: [
        '18.1. Fica eleito o foro da comarca de São Luís - MA, para dirimir quaisquer dúvidas ou litígios oriundos deste contrato, renunciando-se a qualquer outro por mais privilegiado que seja, conforme faculta o art. 39 da Lei nº 4.886/65.',
        'E por se acharem em perfeito acordo em tudo quanto neste instrumento particular foi lavrado, obrigam-se as partes a cumprir o presente contrato, assinando-o na presença das duas testemunhas abaixo, e quatro vias de igual teor.',
      ],
    },
  ];
}

export function blocosAnexosTermoColaborador(
  d: ColaboradorTermoData,
  dataAtual: string,
): TermoBloco[] {
  const nome = d.nome?.trim() || '_____________________________________________________________';
  const cpf = d.cpf?.trim() || '________________________';
  const localData = `Local: São Luís - MA\nData: ${dataAtual}`;

  return [
    {
      titulo: 'ANEXOS INTEGRANTES',
      linhas: [
        'ANEXO I – Declaração de Ciência e Recebimento da Política de Confidencialidade',
        'ANEXO II – Declaração de Não Retenção de Dados e Informações',
        'ANEXO III – Termo de Entrega de Ativos e Informações no Desligamento',
        'ANEXO IV – Declaração de Uso Adequado de Recursos Tecnológicos',
        'ANEXO V – Termo de Ciência sobre Propriedade Intelectual e Industrial',
        'ANEXO VI – Termo de Uso de Inteligência Artificial e Ferramentas Externas',
        'ANEXO VII – Termo de Classificação e Tratamento das Informações',
        'ANEXO VIII – Termo de Monitoramento, Auditoria e Segurança dos Ativos Corporativos',
      ],
    },
    {
      titulo: 'ANEXO I – DECLARAÇÃO DE CIÊNCIA, RECEBIMENTO E COMPROMISSO DE OBSERVÂNCIA DAS POLÍTICAS CORPORATIVAS',
      linhas: [
        `Eu, ${nome}, CPF nº ${cpf}, declaro que recebi, tive acesso, li, compreendi e me comprometo a observar integralmente as políticas, normas, regulamentos, manuais e procedimentos internos da EMPRESA relacionados à confidencialidade e sigilo; segurança da informação; proteção de dados pessoais; propriedade intelectual e industrial; uso de recursos tecnológicos; inteligência artificial e ferramentas digitais; e compliance e governança corporativa.`,
        'Declaro ainda que todas as dúvidas eventualmente existentes foram esclarecidas; que o desconhecimento das normas internas não poderá ser utilizado como justificativa para seu descumprimento; e que comprometo-me a observar futuras atualizações das políticas corporativas regularmente disponibilizadas pela EMPRESA.',
        localData,
        'ASSINATURA: ____________________________',
      ],
    },
    {
      titulo: 'ANEXO II – DECLARAÇÃO DE NÃO RETENÇÃO DE DADOS, DOCUMENTOS E INFORMAÇÕES',
      linhas: [
        `Eu, ${nome}, CPF nº ${cpf}, declaro que não mantenho sob minha posse, guarda, controle ou disponibilidade documentos físicos ou eletrônicos corporativos, bancos de dados, códigos-fonte, algoritmos, modelos de inteligência artificial, credenciais de acesso, informações estratégicas, segredos de negócio ou informações protegidas por confidencialidade.`,
        'Declaro adicionalmente que não mantive cópias em contas pessoais de e-mail, serviços de armazenamento em nuvem, dispositivos móveis, mídias removíveis, ferramentas de inteligência artificial, aplicativos de mensagens, plataformas colaborativas, backups automáticos ou quaisquer ambientes digitais sob meu controle direto ou indireto.',
        'Comprometo-me a informar imediatamente a EMPRESA caso identifique a existência de qualquer informação corporativa ainda armazenada inadvertidamente.',
        localData,
        'ASSINATURA: ____________________________',
      ],
    },
    {
      titulo: 'ANEXO III – TERMO DE ENTREGA DE ATIVOS, ACESSOS E INFORMAÇÕES NO DESLIGAMENTO',
      linhas: [
        'O(A) COLABORADOR(A) declara ter devolvido integralmente os ativos corporativos sob sua responsabilidade: ☐ Notebook ☐ Computador ☐ Celular Corporativo ☐ Token ☐ Cartão de Acesso ☐ Chaves ☐ Dispositivos de Armazenamento ☐ Documentação Física ☐ Documentação Digital ☐ Outros',
        'Declara ainda que não mantém cópias de informações corporativas; não possui acessos ativos a sistemas da EMPRESA; não reteve documentos, dados ou informações protegidas; e não realizou transferência não autorizada de informações.',
        'DECLARAÇÃO DE REVOGAÇÃO DE ACESSOS: O(A) COLABORADOR(A) declara ter informado à EMPRESA a existência de todas as credenciais, certificados digitais, chaves criptográficas, tokens, APIs, acessos privilegiados e mecanismos de autenticação eventualmente utilizados durante suas atividades.',
        localData,
        'ASSINATURA: ____________________________',
      ],
    },
    {
      titulo: 'ANEXO IV – DECLARAÇÃO DE USO ADEQUADO DE RECURSOS TECNOLÓGICOS',
      linhas: [
        'O(A) COLABORADOR(A) compromete-se a utilizar os recursos tecnológicos disponibilizados pela EMPRESA de forma adequada, segura e compatível com as políticas corporativas, protegendo credenciais, não compartilhando senhas, não instalando softwares não autorizados, não contornando mecanismos de segurança e comunicando incidentes imediatamente.',
        'USO DE DISPOSITIVOS PARTICULARES (BYOD): Caso utilize equipamentos próprios para fins profissionais, compromete-se a observar integralmente as políticas corporativas de segurança da informação, segregação de dados corporativos e proteção dos ativos digitais da EMPRESA. Reconhece que os recursos corporativos poderão ser monitorados e auditados nos limites da legislação aplicável.',
        localData,
        'ASSINATURA: ____________________________',
      ],
    },
    {
      titulo: 'ANEXO V – TERMO DE CIÊNCIA SOBRE PROPRIEDADE INTELECTUAL, INDUSTRIAL E TECNOLÓGICA',
      linhas: [
        'Declaro ter ciência de que os direitos relativos às criações desenvolvidas no exercício de minhas atividades profissionais serão tratados na forma da legislação aplicável e das disposições contratuais vigentes.',
        'Comprometo-me a cooperar com registros perante o INPI, Biblioteca Nacional e demais órgãos competentes; não registrar ativos pertencentes à EMPRESA em meu nome ou em nome de terceiros; não utilizar ativos corporativos para fins particulares ou concorrenciais; e preservar integralmente os direitos de propriedade intelectual, industrial e tecnológica da EMPRESA.',
        'COOPERAÇÃO PÓS-DESLIGAMENTO: Mesmo após o encerramento da relação profissional, comprometo-me a praticar os atos razoavelmente necessários para formalização, registro, averbação, complementação, correção ou defesa de direitos de propriedade intelectual e industrial relacionados às atividades desenvolvidas durante o vínculo, desde que tais atos não impliquem ônus desproporcional ou prejuízo injustificado.',
        localData,
        'ASSINATURA: ____________________________',
      ],
    },
    {
      titulo: 'ANEXO VI – TERMO DE USO DE INTELIGÊNCIA ARTIFICIAL E FERRAMENTAS EXTERNAS',
      linhas: [
        'O(A) COLABORADOR(A) reconhece que a utilização de ferramentas de inteligência artificial deverá observar integralmente as políticas da EMPRESA. Sem autorização prévia e formal, é vedado inserir informações confidenciais, códigos-fonte, documentos internos, dados pessoais, segredos industriais ou utilizar ativos corporativos para treinamento de modelos externos.',
        'VALIDAÇÃO DE CONTEÚDO GERADO POR IA: O(A) COLABORADOR(A) reconhece que conteúdos, códigos, documentos, imagens, análises, modelos ou resultados produzidos por sistemas de inteligência artificial não poderão ser incorporados a produtos, pesquisas, serviços ou ativos da EMPRESA sem a devida validação técnica, jurídica, regulatória e de conformidade definida pela EMPRESA.',
        localData,
        'ASSINATURA: ____________________________',
      ],
    },
    {
      titulo: 'ANEXO VII – TERMO DE CLASSIFICAÇÃO E TRATAMENTO DAS INFORMAÇÕES',
      linhas: [
        'O(A) COLABORADOR(A) reconhece as classificações corporativas: Informação Pública; Informação de Uso Interno; Informação Confidencial; e Informação Restrita ou Estratégica.',
        'Compromete-se a tratar cada categoria conforme as políticas corporativas vigentes.',
        localData,
        'ASSINATURA: ____________________________',
      ],
    },
    {
      titulo: 'ANEXO VIII – TERMO DE MONITORAMENTO, AUDITORIA E SEGURANÇA DOS ATIVOS CORPORATIVOS',
      linhas: [
        'O(A) COLABORADOR(A) declara ciência de que, observados os limites legais, os recursos corporativos poderão gerar registros de auditoria, logs de acesso, registros de autenticação, trilhas de auditoria, registros de utilização de sistemas e demais evidências técnicas necessárias à segurança dos ativos da EMPRESA.',
        'Reconhece que tais registros poderão ser utilizados para prevenção de incidentes de segurança; investigação de violações; proteção do patrimônio empresarial; cumprimento de obrigações legais e regulatórias; e produção de prova em procedimentos administrativos, arbitrais ou judiciais.',
        'A EMPRESA compromete-se a realizar tais atividades em conformidade com a legislação brasileira aplicável, especialmente a Constituição Federal, a LGPD e demais normas pertinentes.',
        localData,
        'ASSINATURA: ____________________________',
      ],
    },
  ];
}

export type ResumoParteTermo = {
  titulo: string;
  resumo: string;
};

export const RESUMO_CLAUSULAS_TERMO: ResumoParteTermo[] = [
  {
    titulo: 'Preliminar',
    resumo: 'Termo autônomo de proteção de informações; não altera salário, cargo ou benefícios.',
  },
  {
    titulo: 'Cláusula 1ª – Objeto',
    resumo: 'Disciplina confidencialidade, sigilo, segurança da informação, LGPD e propriedade intelectual.',
  },
  {
    titulo: 'Cláusula 2ª – Definições',
    resumo: 'Explica o que são informação confidencial, segredo industrial, know-how e ativos tecnológicos.',
  },
  {
    titulo: 'Cláusula 3ª – Dever de sigilo',
    resumo: 'Obrigação de manter sigilo durante o vínculo e depois do desligamento.',
  },
  {
    titulo: 'Cláusula 4ª – Informações abrangidas',
    resumo: 'Lista exemplos do que é confidencial (estratégias, códigos, dados, projetos, IA etc.).',
  },
  {
    titulo: 'Cláusula 5ª – Obrigações',
    resumo: 'Uso só para o trabalho, proteção de senhas, políticas internas e aviso de incidentes.',
  },
  {
    titulo: 'Cláusula 6ª – Vedações',
    resumo: 'Proíbe copiar, compartilhar ou usar informações da empresa sem autorização.',
  },
  {
    titulo: 'Cláusula 7ª – LGPD',
    resumo: 'Cumprimento da lei de proteção de dados pessoais e das políticas de privacidade.',
  },
  {
    titulo: 'Cláusula 8ª – Inteligência artificial',
    resumo: 'Veda enviar dados ou materiais corporativos a ferramentas de IA externas sem autorização.',
  },
  {
    titulo: 'Cláusula 9ª – Propriedade intelectual',
    resumo: 'Criações feitas no trabalho pertencem à empresa (software, códigos, invenções, processos).',
  },
  {
    titulo: 'Cláusula 10ª – Sem licença implícita',
    resumo: 'Acesso aos sistemas não concede direito de uso ou exploração dos ativos da empresa.',
  },
  {
    titulo: 'Cláusula 11ª – Não retenção',
    resumo: 'No desligamento, devolver documentos, equipamentos, credenciais e não guardar cópias.',
  },
  {
    titulo: 'Cláusula 12ª – Infrações graves',
    resumo: 'Tentativa de vazamento ou cópia indevida é infração grave, comprovável por logs e auditoria.',
  },
  {
    titulo: 'Cláusula 13ª – Responsabilidade',
    resumo: 'Indenização por danos causados em caso de violação do termo, nos limites da lei.',
  },
  {
    titulo: 'Cláusula 14ª – Provas digitais',
    resumo: 'Logs, e-mails corporativos e registros eletrônicos são meios válidos de prova.',
  },
  {
    titulo: 'Cláusula 15ª – Assinatura eletrônica',
    resumo: 'Validade de assinaturas Gov.br (nível Prata ou Ouro) conforme a legislação.',
  },
  {
    titulo: 'Cláusula 16ª – Sobrevivência',
    resumo: 'Obrigações de sigilo e confidencialidade continuam válidas após o desligamento.',
  },
  {
    titulo: 'Cláusula 17ª – Disposições finais',
    resumo: 'Termo complementar ao contrato; declaração de que o colaborador leu e concordou.',
  },
  {
    titulo: 'Cláusula 18ª – Foro',
    resumo: 'Comarca de São Luís/MA para resolver disputas sobre este instrumento.',
  },
];

export const RESUMO_ANEXOS_TERMO: ResumoParteTermo[] = [
  {
    titulo: 'Anexo I – Políticas corporativas',
    resumo: 'Declaração de que recebeu e se compromete a seguir as políticas internas da empresa.',
  },
  {
    titulo: 'Anexo II – Não retenção',
    resumo: 'Confirma que não guarda documentos, dados ou cópias corporativas em lugar algum.',
  },
  {
    titulo: 'Anexo III – Entrega no desligamento',
    resumo: 'Checklist de devolução de equipamentos, acessos e revogação de credenciais.',
  },
  {
    titulo: 'Anexo IV – Recursos tecnológicos',
    resumo: 'Uso seguro de TI corporativa e regras para dispositivos pessoais (BYOD).',
  },
  {
    titulo: 'Anexo V – Propriedade intelectual',
    resumo: 'Ciência sobre titularidade de criações e cooperação em registros (INPI etc.).',
  },
  {
    titulo: 'Anexo VI – Uso de IA',
    resumo: 'Regras para ferramentas de IA e validação de conteúdo gerado automaticamente.',
  },
  {
    titulo: 'Anexo VII – Classificação',
    resumo: 'Níveis de informação (pública, interna, confidencial, restrita) e como tratá-los.',
  },
  {
    titulo: 'Anexo VIII – Auditoria',
    resumo: 'Ciência de que sistemas podem ser monitorados para segurança, dentro da lei.',
  },
];
