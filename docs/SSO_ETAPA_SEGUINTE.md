# Login único — etapa seguinte

Esta entrega não força login único porque Moodle e ERP são sistemas independentes já existentes. Fazer SSO de forma segura exige uma etapa específica.

Recomendação técnica:

- Keycloak como identidade central.
- Moodle usando plugin OpenID Connect/OAuth2.
- ERP NestJS validando JWT/OIDC do Keycloak.
- Portal G.One redirecionando login para Keycloak.

Resultado esperado:

- Um usuário acessa G.One, AVA e ERP com a mesma conta.
- Perfis podem ser sincronizados por grupos: admin, master, professor, aluno, pesquisador, parceiro.
