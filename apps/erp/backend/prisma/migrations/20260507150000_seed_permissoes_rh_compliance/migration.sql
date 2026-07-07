-- Reforço idempotente das permissões introduzidas em `20260505140000_rh_compliance_rep_p`.
-- Alguns ambientes ficaram sem essas permissões (insert silencioso pulado / conflito anterior),
-- então repetimos a inserção e já vinculamos aos cargos que têm `sistema:administrar`
-- (DIRETOR, GM, ADMINISTRADOR e similares), garantindo que admins enxerguem as novas abas
-- (Local da unidade, AFD, aprovação de uso de horas extras).

-- 1) Garante que as 3 permissões existem no catálogo.
INSERT INTO "Permission" ("modulo", "acao", "descricao") VALUES
    ('ponto', 'exportar_afd', 'Exportar Arquivo Fonte de Dados (Portaria MTE 671/2021).'),
    ('banco_horas', 'aprovar_uso_extras', 'Aprovar/reprovar solicitação de uso de horas extras.'),
    ('rh', 'gerenciar_empregador', 'Gerenciar dados do empregador (CNPJ/CEI/CAEPF) usado em AFD/comprovantes.')
ON CONFLICT ("modulo", "acao") DO NOTHING;

-- 2) Atribui as 3 novas permissões a TODO cargo que já possua `sistema:administrar`
--    (compatível com os cargos do seed -- DIRETOR, GM -- e com cargos custom do tipo
--    ADMINISTRADOR criados em runtime). É idempotente: usa ON CONFLICT na PK composta.
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT cargos_admin.cargo_id, p.id
FROM (
    SELECT cp."cargoId" AS cargo_id
    FROM "CargoPermission" cp
    JOIN "Permission" p_admin ON p_admin.id = cp."permissionId"
    WHERE p_admin.modulo = 'sistema'
      AND p_admin.acao = 'administrar'
) AS cargos_admin
CROSS JOIN "Permission" p
WHERE (p.modulo, p.acao) IN (
    ('ponto', 'exportar_afd'),
    ('banco_horas', 'aprovar_uso_extras'),
    ('rh', 'gerenciar_empregador')
)
ON CONFLICT ("cargoId", "permissionId") DO NOTHING;

-- 3) Atribui também a quem já tem `rh_dashboard:ver` ou `ponto:ver_todos` (perfis de RH/Gestor)
--    -- esses cargos costumam ser quem mexe na configuração da unidade e do AFD,
--    mesmo sem a permissão raiz `sistema:administrar`.
INSERT INTO "CargoPermission" ("cargoId", "permissionId")
SELECT DISTINCT cp."cargoId", p_nova.id
FROM "CargoPermission" cp
JOIN "Permission" p_base ON p_base.id = cp."permissionId"
                        AND (
                            (p_base.modulo = 'rh_dashboard' AND p_base.acao = 'ver') OR
                            (p_base.modulo = 'ponto' AND p_base.acao = 'ver_todos')
                        ),
     "Permission" p_nova
WHERE (p_nova.modulo, p_nova.acao) IN (
    ('ponto', 'exportar_afd'),
    ('banco_horas', 'aprovar_uso_extras'),
    ('rh', 'gerenciar_empregador')
)
ON CONFLICT ("cargoId", "permissionId") DO NOTHING;
