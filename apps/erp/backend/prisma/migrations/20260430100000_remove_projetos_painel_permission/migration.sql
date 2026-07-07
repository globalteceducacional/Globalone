-- Remove permissão legada projetos:painel (painel visual embutido no ERP; substituído por Erp_Painel).

DELETE FROM "CargoPermission"
WHERE "permissionId" IN (
  SELECT "id" FROM "Permission" WHERE "modulo" = 'projetos' AND "acao" = 'painel'
);

DELETE FROM "Permission"
WHERE "modulo" = 'projetos' AND "acao" = 'painel';
