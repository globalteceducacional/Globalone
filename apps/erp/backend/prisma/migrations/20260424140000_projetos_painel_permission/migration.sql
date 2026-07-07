-- Permissão: abrir o painel visual do projeto (/dashboard/projeto/:id).

INSERT INTO "Permission" ("modulo", "acao", "descricao")
VALUES (
  'projetos',
  'painel',
  'Abrir painel visual do projeto (dashboard por projeto)'
)
ON CONFLICT ("modulo", "acao") DO NOTHING;

-- Cargos GM e DIRETOR recebem por padrão (demais perfis: atribuir em Cargos).
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT c."id", p."id"
FROM "Cargo" c
CROSS JOIN "Permission" p
WHERE c."nome" IN ('GM', 'DIRETOR')
  AND p."modulo" = 'projetos'
  AND p."acao" = 'painel'
ON CONFLICT ("cargoId", "permissionId") DO NOTHING;
