-- Permissões granulares por aba do Financeiro e Planejamento
INSERT INTO "Permission" ("modulo", "acao", "descricao")
VALUES
  ('financeiro', 'visualizar', 'Acesso completo a todas as abas do Financeiro e Planejamento'),
  ('financeiro', 'visao', 'Financeiro — aba Visão geral'),
  ('financeiro', 'ponto', 'Financeiro — aba Horas e valores'),
  ('financeiro', 'pagamentos', 'Financeiro — aba Pagamentos do mês'),
  ('financeiro', 'projetos', 'Financeiro — aba Projetos'),
  ('financeiro', 'curadoria', 'Financeiro — aba Curadoria'),
  ('financeiro', 'compras', 'Financeiro — aba Compras')
ON CONFLICT ("modulo", "acao") DO UPDATE SET
  "descricao" = EXCLUDED."descricao";

-- Quem já tinha financeiro:visualizar recebe todas as abas granulares
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT cp."cargoId", p."id"
FROM "CargoPermission" cp
JOIN "Permission" parent ON parent."id" = cp."permissionId"
  AND parent."modulo" = 'financeiro' AND parent."acao" = 'visualizar'
CROSS JOIN "Permission" p
WHERE p."modulo" = 'financeiro'
  AND p."acao" IN ('visao', 'ponto', 'pagamentos', 'projetos', 'curadoria', 'compras')
ON CONFLICT DO NOTHING;
