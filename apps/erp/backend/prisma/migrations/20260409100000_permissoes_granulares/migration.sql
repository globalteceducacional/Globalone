-- Novas permissões granulares

-- projetos: split editar → criar, excluir, importar
INSERT INTO "Permission" ("modulo", "acao", "descricao")
VALUES
  ('projetos', 'criar',    'Criar novos projetos'),
  ('projetos', 'excluir',  'Excluir projetos'),
  ('projetos', 'importar', 'Importar projetos via Excel')
ON CONFLICT ("modulo", "acao") DO NOTHING;

-- compras: novo visualizar e excluir
INSERT INTO "Permission" ("modulo", "acao", "descricao")
VALUES
  ('compras', 'visualizar', 'Visualizar compras e orçamentos'),
  ('compras', 'excluir',    'Excluir solicitações de compras')
ON CONFLICT ("modulo", "acao") DO NOTHING;

-- estoque: novo criar e excluir
INSERT INTO "Permission" ("modulo", "acao", "descricao")
VALUES
  ('estoque', 'criar',   'Criar itens de estoque'),
  ('estoque', 'excluir', 'Excluir itens de estoque')
ON CONFLICT ("modulo", "acao") DO NOTHING;

-- curadoria: split gerenciar → criar, editar, excluir
INSERT INTO "Permission" ("modulo", "acao", "descricao")
VALUES
  ('curadoria', 'criar',   'Criar orçamentos e importar planilhas de curadoria'),
  ('curadoria', 'editar',  'Editar orçamentos e itens de curadoria'),
  ('curadoria', 'excluir', 'Excluir orçamentos e itens de curadoria')
ON CONFLICT ("modulo", "acao") DO NOTHING;

-- setores: split gerenciar → criar, editar, excluir
INSERT INTO "Permission" ("modulo", "acao", "descricao")
VALUES
  ('setores', 'criar',   'Criar setores'),
  ('setores', 'editar',  'Editar setores e membros'),
  ('setores', 'excluir', 'Excluir setores')
ON CONFLICT ("modulo", "acao") DO NOTHING;

-- usuarios: split gerenciar → visualizar, criar, editar, excluir
INSERT INTO "Permission" ("modulo", "acao", "descricao")
VALUES
  ('usuarios', 'visualizar', 'Visualizar lista de usuários'),
  ('usuarios', 'criar',      'Criar usuários'),
  ('usuarios', 'editar',     'Editar usuários e atribuir cargos'),
  ('usuarios', 'excluir',    'Excluir ou desativar usuários')
ON CONFLICT ("modulo", "acao") DO NOTHING;

-- notificacoes: nova permissão própria
INSERT INTO "Permission" ("modulo", "acao", "descricao")
VALUES
  ('notificacoes', 'enviar', 'Enviar notificações para usuários')
ON CONFLICT ("modulo", "acao") DO NOTHING;

-- dashboard: visão administrativa
INSERT INTO "Permission" ("modulo", "acao", "descricao")
VALUES
  ('dashboard', 'gerenciar', 'Visão administrativa do dashboard (filtro por usuário, ranking, KPIs globais)')
ON CONFLICT ("modulo", "acao") DO NOTHING;

-- projetos: ver todos os projetos + editar pontos
INSERT INTO "Permission" ("modulo", "acao", "descricao")
VALUES
  ('projetos', 'ver_todos', 'Visualizar todos os projetos (sem restrição por participação)'),
  ('projetos', 'pontos',    'Definir e alterar pontos de tarefas no checklist')
ON CONFLICT ("modulo", "acao") DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Expandir CargoPermission para cargos existentes que tinham a permissão-mãe
-- ═══════════════════════════════════════════════════════════════════════════

-- Quem tinha projetos:editar ganha projetos:criar, projetos:excluir, projetos:importar
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT cp."cargoId", p."id"
FROM "CargoPermission" cp
JOIN "Permission" parent ON parent."id" = cp."permissionId"
  AND parent."modulo" = 'projetos' AND parent."acao" = 'editar'
CROSS JOIN "Permission" p
WHERE p."modulo" = 'projetos' AND p."acao" IN ('criar', 'excluir', 'importar')
ON CONFLICT DO NOTHING;

-- Quem tinha compras:solicitar OU compras:aprovar ganha compras:visualizar
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT DISTINCT cp."cargoId", p."id"
FROM "CargoPermission" cp
JOIN "Permission" parent ON parent."id" = cp."permissionId"
  AND parent."modulo" = 'compras' AND parent."acao" IN ('solicitar', 'aprovar')
CROSS JOIN "Permission" p
WHERE p."modulo" = 'compras' AND p."acao" = 'visualizar'
ON CONFLICT DO NOTHING;

-- Quem tinha compras:solicitar ganha compras:excluir
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT cp."cargoId", p."id"
FROM "CargoPermission" cp
JOIN "Permission" parent ON parent."id" = cp."permissionId"
  AND parent."modulo" = 'compras' AND parent."acao" = 'solicitar'
CROSS JOIN "Permission" p
WHERE p."modulo" = 'compras' AND p."acao" = 'excluir'
ON CONFLICT DO NOTHING;

-- Quem tinha estoque:movimentar ganha estoque:criar, estoque:excluir
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT cp."cargoId", p."id"
FROM "CargoPermission" cp
JOIN "Permission" parent ON parent."id" = cp."permissionId"
  AND parent."modulo" = 'estoque' AND parent."acao" = 'movimentar'
CROSS JOIN "Permission" p
WHERE p."modulo" = 'estoque' AND p."acao" IN ('criar', 'excluir')
ON CONFLICT DO NOTHING;

-- Quem tinha curadoria:gerenciar ganha curadoria:criar, curadoria:editar, curadoria:excluir
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT cp."cargoId", p."id"
FROM "CargoPermission" cp
JOIN "Permission" parent ON parent."id" = cp."permissionId"
  AND parent."modulo" = 'curadoria' AND parent."acao" = 'gerenciar'
CROSS JOIN "Permission" p
WHERE p."modulo" = 'curadoria' AND p."acao" IN ('criar', 'editar', 'excluir')
ON CONFLICT DO NOTHING;

-- Quem tinha setores:gerenciar ganha setores:criar, setores:editar, setores:excluir
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT cp."cargoId", p."id"
FROM "CargoPermission" cp
JOIN "Permission" parent ON parent."id" = cp."permissionId"
  AND parent."modulo" = 'setores' AND parent."acao" = 'gerenciar'
CROSS JOIN "Permission" p
WHERE p."modulo" = 'setores' AND p."acao" IN ('criar', 'editar', 'excluir')
ON CONFLICT DO NOTHING;

-- Quem tinha usuarios:gerenciar ganha usuarios:visualizar, usuarios:criar, usuarios:editar, usuarios:excluir
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT cp."cargoId", p."id"
FROM "CargoPermission" cp
JOIN "Permission" parent ON parent."id" = cp."permissionId"
  AND parent."modulo" = 'usuarios' AND parent."acao" = 'gerenciar'
CROSS JOIN "Permission" p
WHERE p."modulo" = 'usuarios' AND p."acao" IN ('visualizar', 'criar', 'editar', 'excluir')
ON CONFLICT DO NOTHING;

-- Quem tinha sistema:administrar ganha dashboard:gerenciar, projetos:ver_todos, projetos:pontos
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT cp."cargoId", p."id"
FROM "CargoPermission" cp
JOIN "Permission" parent ON parent."id" = cp."permissionId"
  AND parent."modulo" = 'sistema' AND parent."acao" = 'administrar'
CROSS JOIN "Permission" p
WHERE (p."modulo" = 'dashboard' AND p."acao" = 'gerenciar')
   OR (p."modulo" = 'projetos' AND p."acao" IN ('ver_todos', 'pontos'))
ON CONFLICT DO NOTHING;

-- Corrigir descrição de projetos:editar (separado de criar)
UPDATE "Permission"
SET "descricao" = 'Editar projetos existentes'
WHERE "modulo" = 'projetos' AND "acao" = 'editar';

-- Quem tinha projetos:editar OU projetos:aprovar ganha notificacoes:enviar
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT DISTINCT cp."cargoId", p."id"
FROM "CargoPermission" cp
JOIN "Permission" parent ON parent."id" = cp."permissionId"
  AND parent."modulo" = 'projetos' AND parent."acao" IN ('editar', 'aprovar')
CROSS JOIN "Permission" p
WHERE p."modulo" = 'notificacoes' AND p."acao" = 'enviar'
ON CONFLICT DO NOTHING;
