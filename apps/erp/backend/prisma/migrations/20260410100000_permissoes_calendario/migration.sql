-- Permissões do módulo Calendário

INSERT INTO "Permission" ("modulo", "acao", "descricao")
VALUES
  ('calendario', 'visualizar', 'Visualizar calendário de etapas'),
  ('calendario', 'ver_todos',  'Ver todas as etapas de todos os projetos no calendário')
ON CONFLICT ("modulo", "acao") DO NOTHING;

-- Quem tinha sistema:administrar ganha calendario:visualizar e calendario:ver_todos
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT cp."cargoId", p."id"
FROM "CargoPermission" cp
JOIN "Permission" parent ON parent."id" = cp."permissionId"
  AND parent."modulo" = 'sistema' AND parent."acao" = 'administrar'
CROSS JOIN "Permission" p
WHERE p."modulo" = 'calendario' AND p."acao" IN ('visualizar', 'ver_todos')
ON CONFLICT DO NOTHING;

-- Quem tinha projetos:visualizar ganha calendario:visualizar
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT DISTINCT cp."cargoId", p."id"
FROM "CargoPermission" cp
JOIN "Permission" parent ON parent."id" = cp."permissionId"
  AND parent."modulo" = 'projetos' AND parent."acao" = 'visualizar'
CROSS JOIN "Permission" p
WHERE p."modulo" = 'calendario' AND p."acao" = 'visualizar'
ON CONFLICT DO NOTHING;
