# Arquitetura da G.One Suite

```
Internet
  ↓
Caddy Gateway :80/:443
  ├─ one.seudominio.com.br → gone:80
  ├─ ava.seudominio.com.br → ava-moodle:80 → ava-db:3306
  └─ erp.seudominio.com.br → erp-frontend:80
       ├─ /api/* → erp-backend:3001 → erp-db:5432
       ├─ /uploads/* → erp-backend:3001
       └─ /uploads-protegido/* → erp-backend:3001
```

## Integração atual

A integração atual é de portal/roteamento: o G.One abre o AVA e o ERP por botões e links. Cada sistema mantém seu banco, permissões e login próprios.

## Integração futura recomendada

Para login único e integração profunda:

1. Keycloak como provedor central de identidade.
2. Moodle com plugin OpenID Connect.
3. ERP adaptado para validar OIDC/JWT do Keycloak.
4. G.One usando o mesmo OIDC.
5. APIs de sincronização entre tecnologias G.One, cursos Moodle e projetos ERP.
