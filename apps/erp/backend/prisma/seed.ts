import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Criar permissões base (granulares)
  const permissionsSeed = [
    // projetos
    { modulo: 'projetos', acao: 'visualizar', descricao: 'Visualizar projetos' },
    { modulo: 'projetos', acao: 'criar', descricao: 'Criar novos projetos' },
    { modulo: 'projetos', acao: 'editar', descricao: 'Editar projetos existentes' },
    { modulo: 'projetos', acao: 'excluir', descricao: 'Excluir projetos' },
    { modulo: 'projetos', acao: 'importar', descricao: 'Importar projetos via Excel' },
    { modulo: 'projetos', acao: 'aprovar', descricao: 'Aprovar etapas e finalizar projetos' },
    // trabalhos
    { modulo: 'trabalhos', acao: 'visualizar', descricao: 'Visualizar tarefas atribuídas' },
    {
      modulo: 'trabalhos',
      acao: 'registrar',
      descricao: 'Registrar progresso e anexos das tarefas',
    },
    { modulo: 'trabalhos', acao: 'avaliar', descricao: 'Avaliar entregas e aprovar objetivos' },
    // compras
    { modulo: 'compras', acao: 'visualizar', descricao: 'Visualizar compras e orçamentos' },
    { modulo: 'compras', acao: 'solicitar', descricao: 'Solicitar compras e orçamentos' },
    { modulo: 'compras', acao: 'aprovar', descricao: 'Aprovar solicitações de compras' },
    { modulo: 'compras', acao: 'excluir', descricao: 'Excluir solicitações de compras' },
    // estoque
    {
      modulo: 'estoque',
      acao: 'visualizar',
      descricao: 'Visualizar itens de estoque (Compras & Estoque)',
    },
    { modulo: 'estoque', acao: 'criar', descricao: 'Criar itens de estoque' },
    {
      modulo: 'estoque',
      acao: 'movimentar',
      descricao: 'Registrar movimentações no módulo Compras & Estoque',
    },
    { modulo: 'estoque', acao: 'excluir', descricao: 'Excluir itens de estoque' },
    // almoxarifado
    {
      modulo: 'almoxarifado',
      acao: 'visualizar',
      descricao: 'Visualizar almoxarifado (listagens e relatórios)',
    },
    {
      modulo: 'almoxarifado',
      acao: 'movimentar',
      descricao: 'Registrar entradas, alocações e baixas no almoxarifado',
    },
    // curadoria
    {
      modulo: 'curadoria',
      acao: 'visualizar',
      descricao: 'Visualizar orçamentos e estoque de curadoria',
    },
    {
      modulo: 'curadoria',
      acao: 'criar',
      descricao: 'Criar orçamentos e importar planilhas de curadoria',
    },
    { modulo: 'curadoria', acao: 'editar', descricao: 'Editar orçamentos e itens de curadoria' },
    { modulo: 'curadoria', acao: 'excluir', descricao: 'Excluir orçamentos e itens de curadoria' },
    {
      modulo: 'curadoria',
      acao: 'gerenciar',
      descricao: 'Criar, editar, importar e ajustar curadoria (legado)',
    },
    // setores
    { modulo: 'setores', acao: 'visualizar', descricao: 'Visualizar setores e equipes' },
    { modulo: 'setores', acao: 'criar', descricao: 'Criar setores' },
    { modulo: 'setores', acao: 'editar', descricao: 'Editar setores e membros' },
    { modulo: 'setores', acao: 'excluir', descricao: 'Excluir setores' },
    {
      modulo: 'setores',
      acao: 'gerenciar',
      descricao: 'Criar e gerenciar setores e membros (legado)',
    },
    // usuarios
    { modulo: 'usuarios', acao: 'visualizar', descricao: 'Visualizar lista de usuários' },
    { modulo: 'usuarios', acao: 'criar', descricao: 'Criar usuários' },
    { modulo: 'usuarios', acao: 'editar', descricao: 'Editar usuários e atribuir cargos' },
    { modulo: 'usuarios', acao: 'excluir', descricao: 'Excluir ou desativar usuários' },
    { modulo: 'usuarios', acao: 'gerenciar', descricao: 'Gerenciar usuários e cargos (legado)' },
    // notificacoes
    { modulo: 'notificacoes', acao: 'enviar', descricao: 'Enviar notificações para usuários' },
    // dashboard
    {
      modulo: 'dashboard',
      acao: 'gerenciar',
      descricao: 'Visão administrativa do dashboard (filtro por usuário, ranking, KPIs globais)',
    },
    // projetos extras
    {
      modulo: 'projetos',
      acao: 'ver_todos',
      descricao: 'Visualizar todos os projetos (sem restrição por participação)',
    },
    {
      modulo: 'projetos',
      acao: 'pontos',
      descricao: 'Definir e alterar pontos de tarefas no checklist',
    },
    // calendario
    { modulo: 'calendario', acao: 'visualizar', descricao: 'Visualizar calendário de etapas' },
    {
      modulo: 'calendario',
      acao: 'ver_todos',
      descricao: 'Ver todas as etapas de todos os projetos no calendário',
    },
    {
      modulo: 'calendario',
      acao: 'eventos',
      descricao: 'Criar e gerenciar eventos de calendário (datas, participantes e notificações)',
    },
    // sistema
    {
      modulo: 'sistema',
      acao: 'administrar',
      descricao: 'Administrar configurações avançadas do sistema',
    },
    // ponto / RH
    { modulo: 'ponto', acao: 'bater', descricao: 'Bater o próprio ponto (entrada/saída)' },
    { modulo: 'ponto', acao: 'ver_proprios', descricao: 'Visualizar o próprio histórico de ponto' },
    {
      modulo: 'ponto',
      acao: 'ver_todos',
      descricao: 'Visualizar registros de ponto de todos os colaboradores',
    },
    {
      modulo: 'ponto',
      acao: 'ajustar',
      descricao: 'Criar, editar ou remover registros de ponto com justificativa',
    },
    { modulo: 'ponto', acao: 'exportar', descricao: 'Exportar relatório de ponto em CSV' },
    {
      modulo: 'ponto',
      acao: 'exportar_afd',
      descricao: 'Exportar Arquivo Fonte de Dados (AFD - Portaria MTE 671/2021)',
    },
    {
      modulo: 'rh',
      acao: 'gerenciar_empregador',
      descricao: 'Gerenciar dados do empregador (CNPJ/CEI/CAEPF) usado em AFD/comprovantes',
    },
    // RH - Fase 1
    { modulo: 'jornada', acao: 'configurar', descricao: 'Definir e atualizar jornada de trabalho dos colaboradores' },
    { modulo: 'jornada', acao: 'ver_propria', descricao: 'Visualizar a própria jornada' },
    { modulo: 'espelho', acao: 'ver_proprio', descricao: 'Visualizar o próprio espelho de ponto' },
    { modulo: 'espelho', acao: 'ver_todos', descricao: 'Visualizar espelho de ponto de todos os colaboradores' },
    { modulo: 'espelho', acao: 'exportar', descricao: 'Exportar espelho de ponto' },
    { modulo: 'solicitacoes_ponto', acao: 'abrir', descricao: 'Abrir solicitações de ajuste de ponto' },
    { modulo: 'solicitacoes_ponto', acao: 'revisar', descricao: 'Aprovar ou reprovar solicitações de ajuste de ponto' },
    // RH - Fase 2
    { modulo: 'banco_horas', acao: 'ver_proprio', descricao: 'Visualizar próprio banco de horas' },
    { modulo: 'banco_horas', acao: 'ver_todos', descricao: 'Visualizar banco de horas de todos os colaboradores' },
    { modulo: 'banco_horas', acao: 'fechar', descricao: 'Fechar mensalmente o banco de horas' },
    {
      modulo: 'banco_horas',
      acao: 'aprovar_uso_extras',
      descricao: 'Aprovar/reprovar solicitação de uso de horas extras pelo colaborador',
    },
    { modulo: 'ferias', acao: 'solicitar', descricao: 'Solicitar férias' },
    { modulo: 'ferias', acao: 'aprovar', descricao: 'Aprovar ou reprovar férias' },
    { modulo: 'afastamentos', acao: 'registrar', descricao: 'Registrar atestados, licenças e afastamentos' },
    { modulo: 'afastamentos', acao: 'ver_todos', descricao: 'Visualizar afastamentos de todos os colaboradores' },
    { modulo: 'documentos_rh', acao: 'gerenciar', descricao: 'Gerenciar documentos do colaborador' },
    { modulo: 'documentos_rh', acao: 'ver_proprios', descricao: 'Visualizar próprios documentos' },
    // RH - Fase 3
    { modulo: 'avaliacoes', acao: 'gerenciar', descricao: 'Criar e gerenciar ciclos e avaliações de desempenho' },
    { modulo: 'avaliacoes', acao: 'responder', descricao: 'Responder avaliações de desempenho' },
    { modulo: 'treinamentos', acao: 'gerenciar', descricao: 'Cadastrar e gerenciar treinamentos' },
    { modulo: 'treinamentos', acao: 'participar', descricao: 'Participar e concluir treinamentos' },
    { modulo: 'rh_dashboard', acao: 'ver', descricao: 'Visualizar dashboard de RH (KPIs e indicadores)' },
    { modulo: 'folha', acao: 'exportar', descricao: 'Exportar dados mensais para folha de pagamento' },
    // financeiro / planejamento (por aba)
    {
      modulo: 'financeiro',
      acao: 'visualizar',
      descricao: 'Acesso completo a todas as abas do Financeiro e Planejamento',
    },
    { modulo: 'financeiro', acao: 'visao', descricao: 'Financeiro — aba Visão geral' },
    { modulo: 'financeiro', acao: 'ponto', descricao: 'Financeiro — aba Horas e valores' },
    { modulo: 'financeiro', acao: 'pagamentos', descricao: 'Financeiro — aba Pagamentos do mês' },
    { modulo: 'financeiro', acao: 'projetos', descricao: 'Financeiro — aba Projetos' },
    { modulo: 'financeiro', acao: 'curadoria', descricao: 'Financeiro — aba Curadoria' },
    { modulo: 'financeiro', acao: 'compras', descricao: 'Financeiro — aba Compras' },
  ];

  const permissionMap = new Map<string, number>();

  for (const permission of permissionsSeed) {
    const created = await prisma.permission.upsert({
      where: {
        modulo_acao: {
          modulo: permission.modulo,
          acao: permission.acao,
        },
      },
      create: permission,
      update: {
        descricao: permission.descricao,
      },
    });
    permissionMap.set(`${created.modulo}:${created.acao}`, created.id);
  }

  // Garantir que o mapa de permissões contenha TODAS as permissões existentes,
  // incluindo aquelas criadas manualmente ou por outras migrações
  const allPermissions = await prisma.permission.findMany();
  for (const perm of allPermissions) {
    const key = `${perm.modulo}:${perm.acao}`;
    if (!permissionMap.has(key)) {
      permissionMap.set(key, perm.id);
    }
  }
  const allPermissionKeys = Array.from(new Set(allPermissions.map((p) => `${p.modulo}:${p.acao}`)));

  // Configurações de cargos e permissões (granulares)
  const cargosSeed = [
    {
      nome: 'EXECUTOR',
      descricao: 'Executor de tarefas',
      paginasPermitidas: [
        '/tasks/my',
        '/calendario',
        '/communications',
        '/notifications',
        '/rh/ponto',
      ],
      permissions: [
        'projetos:visualizar',
        'trabalhos:visualizar',
        'trabalhos:registrar',
        'calendario:visualizar',
        'ponto:bater',
        'ponto:ver_proprios',
      ],
    },
    {
      nome: 'SUPERVISOR',
      descricao: 'Supervisor de projetos',
      paginasPermitidas: [
        '/tasks/my',
        '/calendario',
        '/communications',
        '/notifications',
        '/rh/ponto',
      ],
      permissions: [
        'projetos:visualizar',
        'projetos:criar',
        'projetos:editar',
        'projetos:excluir',
        'projetos:importar',
        'projetos:aprovar',
        'trabalhos:visualizar',
        'trabalhos:registrar',
        'trabalhos:avaliar',
        'calendario:visualizar',
        'notificacoes:enviar',
        'ponto:bater',
        'ponto:ver_proprios',
        'solicitacoes_ponto:abrir',
        'solicitacoes_ponto:revisar',
      ],
    },
    {
      nome: 'COTADOR',
      descricao: 'Responsável por cotações, estoque e curadoria',
      paginasPermitidas: [
        '/tasks/my',
        '/financeiro',
        '/curadoria',
        '/stock',
        '/suppliers',
        '/categories',
        '/communications',
        '/notifications',
        '/rh/ponto',
      ],
      permissions: [
        'projetos:visualizar',
        'compras:visualizar',
        'compras:solicitar',
        'compras:aprovar',
        'compras:excluir',
        'estoque:visualizar',
        'estoque:criar',
        'estoque:movimentar',
        'estoque:excluir',
        'curadoria:visualizar',
        'curadoria:criar',
        'curadoria:editar',
        'curadoria:excluir',
        'curadoria:gerenciar',
        'financeiro:visualizar',
        'ponto:bater',
        'ponto:ver_proprios',
      ],
    },
    {
      nome: 'PAGADOR',
      descricao: 'Responsável por pagamentos e acompanhamento de compras',
      paginasPermitidas: [
        '/tasks/my',
        '/financeiro',
        '/curadoria',
        '/stock',
        '/suppliers',
        '/categories',
        '/communications',
        '/notifications',
        '/rh/ponto',
      ],
      permissions: [
        'projetos:visualizar',
        'compras:visualizar',
        'compras:aprovar',
        'estoque:visualizar',
        'curadoria:visualizar',
        'financeiro:visualizar',
        'ponto:bater',
        'ponto:ver_proprios',
      ],
    },
    {
      nome: 'DIRETOR',
      descricao: 'Diretor com acesso total ao sistema',
      paginasPermitidas: [
        '/dashboard',
        '/projects',
        '/tasks/my',
        '/calendario',
        '/financeiro',
        '/curadoria',
        '/stock',
        '/galpao',
        '/suppliers',
        '/categories',
        '/communications',
        '/users',
        '/cargos',
        '/setores',
        '/notifications',
        '/rh/ponto',
        '/documentos',
        '/patentes-documentos',
      ],
      permissions: allPermissionKeys,
    },
    {
      nome: 'GM',
      descricao: 'Gerente Master com controle total do ERP',
      paginasPermitidas: [
        '/dashboard',
        '/projects',
        '/tasks/my',
        '/calendario',
        '/financeiro',
        '/curadoria',
        '/stock',
        '/galpao',
        '/suppliers',
        '/categories',
        '/communications',
        '/users',
        '/cargos',
        '/setores',
        '/notifications',
        '/rh/ponto',
        '/documentos',
        '/patentes-documentos',
      ],
      permissions: allPermissionKeys,
    },
  ];

  const cargosCriados = new Map<string, { id: number }>();

  for (const cargoSeed of cargosSeed) {
    const permissionIds = Array.from(cargoSeed.permissions, (key) => {
      const id = permissionMap.get(key);
      if (!id) {
        throw new Error(`Permissão não encontrada: ${key}`);
      }
      return id;
    });

    const cargo = await prisma.cargo.upsert({
      where: { nome: cargoSeed.nome },
      update: {
        descricao: cargoSeed.descricao,
        ativo: true,
        paginasPermitidas: cargoSeed.paginasPermitidas,
        permissions: {
          deleteMany: {},
          create: permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      create: {
        nome: cargoSeed.nome,
        descricao: cargoSeed.descricao,
        ativo: true,
        paginasPermitidas: cargoSeed.paginasPermitidas,
        permissions: {
          create: permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
    });

    cargosCriados.set(cargoSeed.nome, cargo);
  }

  const cargoExecutor = cargosCriados.get('EXECUTOR');
  const cargoSupervisor = cargosCriados.get('SUPERVISOR');
  const cargoDiretor = cargosCriados.get('DIRETOR');
  const cargoGerenteMaster = cargosCriados.get('GM');

  if (!cargoExecutor || !cargoSupervisor || !cargoDiretor || !cargoGerenteMaster) {
    throw new Error('Erro ao criar cargos base');
  }

  // Criar usuário administrador padrão
  const senhaHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@globaltec.com' },
    update: {},
    create: {
      nome: 'Administrador',
      email: 'admin@globaltec.com',
      senha: senhaHash,
      cargoId: cargoGerenteMaster.id,
      ativo: true,
    },
  });

  console.log('✅ Usuário administrador criado:', admin.email);

  // Criar usuários de exemplo
  const supervisor = await prisma.usuario.upsert({
    where: { email: 'supervisor@globaltec.com' },
    update: {},
    create: {
      nome: 'Supervisor Exemplo',
      email: 'supervisor@globaltec.com',
      senha: await bcrypt.hash('senha123', 10),
      cargoId: cargoSupervisor.id,
      ativo: true,
    },
  });

  const executor = await prisma.usuario.upsert({
    where: { email: 'executor@globaltec.com' },
    update: {},
    create: {
      nome: 'Executor Exemplo',
      email: 'executor@globaltec.com',
      senha: await bcrypt.hash('senha123', 10),
      cargoId: cargoExecutor.id,
      ativo: true,
    },
  });

  console.log('✅ Usuários de exemplo criados');

  // Criar setores de exemplo e membros
  const setorCuradoria = await prisma.setor.upsert({
    where: { nome: 'Curadoria' },
    update: { ativo: true, descricao: 'Equipe responsável pela curadoria de livros' },
    create: {
      nome: 'Curadoria',
      descricao: 'Equipe responsável pela curadoria de livros',
      ativo: true,
    },
  });

  const setorEstudio = await prisma.setor.upsert({
    where: { nome: 'Estúdio' },
    update: { ativo: true, descricao: 'Equipe de execução e produção' },
    create: {
      nome: 'Estúdio',
      descricao: 'Equipe de execução e produção',
      ativo: true,
    },
  });

  await prisma.setorUsuario.upsert({
    where: { setorId_usuarioId: { setorId: setorCuradoria.id, usuarioId: supervisor.id } },
    update: {},
    create: { setorId: setorCuradoria.id, usuarioId: supervisor.id },
  });
  await prisma.setorUsuario.upsert({
    where: { setorId_usuarioId: { setorId: setorCuradoria.id, usuarioId: executor.id } },
    update: {},
    create: { setorId: setorCuradoria.id, usuarioId: executor.id },
  });
  await prisma.setorUsuario.upsert({
    where: { setorId_usuarioId: { setorId: setorEstudio.id, usuarioId: executor.id } },
    update: {},
    create: { setorId: setorEstudio.id, usuarioId: executor.id },
  });

  console.log('✅ Setores de exemplo criados e membros vinculados');

  // Criar projeto de exemplo
  const projeto = await prisma.projeto.upsert({
    where: { nome: 'Projeto Exemplo' },
    update: {
      resumo: 'Este é um projeto de exemplo para testes',
      objetivo: 'Demonstrar funcionalidades do sistema',
      valorTotal: 50000,
      valorInsumos: 15000,
      supervisorId: supervisor.id,
      setores: {
        set: [{ id: setorCuradoria.id }, { id: setorEstudio.id }],
      },
      responsaveis: {
        deleteMany: {},
        create: [{ usuarioId: supervisor.id }, { usuarioId: executor.id }],
      },
    },
    create: {
      nome: 'Projeto Exemplo',
      resumo: 'Este é um projeto de exemplo para testes',
      objetivo: 'Demonstrar funcionalidades do sistema',
      valorTotal: 50000,
      valorInsumos: 15000,
      supervisorId: supervisor.id,
      setores: {
        connect: [{ id: setorCuradoria.id }, { id: setorEstudio.id }],
      },
      responsaveis: {
        create: [{ usuarioId: supervisor.id }, { usuarioId: executor.id }],
      },
    },
  });

  console.log('✅ Projeto de exemplo criado:', projeto.nome);

  // Criar etapa de exemplo
  const etapaExistente = await prisma.etapa.findFirst({
    where: { projetoId: projeto.id, nome: 'Desenvolvimento Inicial' },
    select: { id: true },
  });

  const etapa = etapaExistente
    ? await prisma.etapa.update({
        where: { id: etapaExistente.id },
        data: {
          descricao: 'Primeira etapa do projeto exemplo',
          executorId: executor.id,
          status: 'PENDENTE',
          valorInsumos: 5000,
          setores: {
            set: [{ id: setorCuradoria.id }, { id: setorEstudio.id }],
          },
        },
      })
    : await prisma.etapa.create({
        data: {
          nome: 'Desenvolvimento Inicial',
          descricao: 'Primeira etapa do projeto exemplo',
          projetoId: projeto.id,
          executorId: executor.id,
          status: 'PENDENTE',
          valorInsumos: 5000,
          setores: {
            connect: [{ id: setorCuradoria.id }, { id: setorEstudio.id }],
          },
        },
      });

  await prisma.etapaIntegrante.upsert({
    where: { etapaId_usuarioId: { etapaId: etapa.id, usuarioId: supervisor.id } },
    update: {},
    create: { etapaId: etapa.id, usuarioId: supervisor.id },
  });
  await prisma.etapaIntegrante.upsert({
    where: { etapaId_usuarioId: { etapaId: etapa.id, usuarioId: executor.id } },
    update: {},
    create: { etapaId: etapa.id, usuarioId: executor.id },
  });

  console.log('✅ Etapa de exemplo criada:', etapa.nome);

  // Criar orçamento de curadoria ENTREGUE de exemplo (gera estoque na aba Curadoria)
  const curadoriaExistente = await prisma.curadoriaOrcamento.findFirst({
    where: { nome: 'Curadoria Seed - Estoque Inicial' },
    select: { id: true },
  });

  const curadoria = curadoriaExistente
    ? await prisma.curadoriaOrcamento.update({
        where: { id: curadoriaExistente.id },
        data: {
          status: 'ENTREGUE',
          projetoId: projeto.id,
          setorId: setorCuradoria.id,
          descontoAplicadoEm: 'ITEM',
          descontoTotal: 0,
        },
      })
    : await prisma.curadoriaOrcamento.create({
        data: {
          nome: 'Curadoria Seed - Estoque Inicial',
          observacao: 'Orçamento de seed para validar fluxo de estoque da curadoria.',
          status: 'ENTREGUE',
          projetoId: projeto.id,
          setorId: setorCuradoria.id,
          criadoPorId: admin.id,
          descontoAplicadoEm: 'ITEM',
          descontoTotal: 0,
        },
      });

  const categoriaLivro = await prisma.categoriaCompra.findFirst({
    where: { tipo: 'LIVRO', ativo: true },
    select: { id: true, nome: true },
  });

  if (categoriaLivro) {
    const isbn = '9788579802201';
    const itemExistente = await prisma.curadoriaItem.findFirst({
      where: {
        orcamentoId: curadoria.id,
        isbn,
        categoriaId: categoriaLivro.id,
      },
      select: { id: true },
    });

    const itemPayload = {
      nome: '360 dias de sucesso',
      isbn,
      quantidade: 50,
      categoriaId: categoriaLivro.id,
      valor: 14.76,
      desconto: 0,
      valorLiquido: 14.76,
      autor: 'Autor Seed',
      editora: 'Editora Seed',
      anoPublicacao: '2024',
    };

    if (itemExistente) {
      await prisma.curadoriaItem.update({
        where: { id: itemExistente.id },
        data: itemPayload,
      });
    } else {
      await prisma.curadoriaItem.create({
        data: {
          orcamentoId: curadoria.id,
          ...itemPayload,
        },
      });
    }

    console.log(`✅ Curadoria/estoque de exemplo criado com gênero ${categoriaLivro.nome}`);
  } else {
    console.log(
      '⚠️ Nenhuma categoria LIVRO ativa encontrada para criar item de curadoria no seed.',
    );
  }

  // Criar notificação de exemplo
  await prisma.notificacao.create({
    data: {
      titulo: 'Bem-vindo ao ERP Globaltec!',
      mensagem: 'Sistema inicializado com sucesso. Comece criando seus projetos!',
      tipo: 'SUCCESS',
      usuarioId: admin.id,
    },
  });

  console.log('✅ Notificação de exemplo criada');

  console.log('\n🎉 Seed concluído com sucesso!');
  console.log('\n📋 Credenciais de acesso:');
  console.log('   Administrador: admin@globaltec.com / admin123');
  console.log('   Supervisor: supervisor@globaltec.com / senha123');
  console.log('   Executor: executor@globaltec.com / senha123');
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
