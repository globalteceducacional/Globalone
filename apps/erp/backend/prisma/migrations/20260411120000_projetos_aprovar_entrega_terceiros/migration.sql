-- Permissão: aprovar entregas de terceiros no projeto (a própria entrega é bloqueada na aplicação, exceto administrador).

INSERT INTO "Permission" ("modulo", "acao", "descricao")
VALUES
  (
    'projetos',
    'aprovar_entrega_terceiros',
    'Aprovar ou reprovar entregas de outras pessoas no projeto (não a própria)'
  )
ON CONFLICT ("modulo", "acao") DO NOTHING;

-- Quem já avalia ou aprova projetos recebe a permissão granular automaticamente.
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT cp."cargoId", p."id"
FROM "CargoPermission" cp
JOIN "Permission" parent ON parent."id" = cp."permissionId"
  AND (
    (parent."modulo" = 'trabalhos' AND parent."acao" = 'avaliar')
    OR (parent."modulo" = 'projetos' AND parent."acao" = 'aprovar')
  )
CROSS JOIN "Permission" p
WHERE p."modulo" = 'projetos' AND p."acao" = 'aprovar_entrega_terceiros'
ON CONFLICT ("cargoId", "permissionId") DO NOTHING;
