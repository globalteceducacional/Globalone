# Instalação online da G.One Suite Completa

## 1. Contrate ou use uma VPS

Recomendado para MVP completo:

- 4 vCPU
- 8 GB RAM mínimo
- 80 GB SSD mínimo
- Ubuntu 22.04 ou 24.04

Para uso com muitos alunos, arquivos grandes e vídeos, prefira 8 vCPU, 16 GB RAM e 160 GB SSD.

## 2. Aponte DNS

Crie três registros A apontando para o IP da VPS:

- one.seudominio.com.br
- ava.seudominio.com.br
- erp.seudominio.com.br

## 3. Envie o pacote para a VPS

Exemplo:

```bash
scp GONE_SUITE_COMPLETA_DOCKER_v1_0.zip usuario@IP_DA_VPS:/opt/
```

## 4. Instale

```bash
ssh usuario@IP_DA_VPS
cd /opt
unzip GONE_SUITE_COMPLETA_DOCKER_v1_0.zip
cd GONE_SUITE_COMPLETA_DOCKER_v1_0
bash scripts/install_ubuntu_vps.sh
cp .env.example .env
nano .env
```

Troque domínios, e-mail e senhas.

## 5. Suba tudo

```bash
bash scripts/start_prod.sh
```

## 6. Verifique

```bash
docker compose ps
bash scripts/logs.sh
```

## 7. Acesse

- https://one.seudominio.com.br
- https://ava.seudominio.com.br
- https://erp.seudominio.com.br

## 8. Primeiro acesso ao AVA

Se o Moodle pedir instalação inicial, conclua pelo navegador. Use uma conta admin forte.

## 9. Primeiro acesso ao ERP

O ERP usa o seed/migrations já existentes no projeto enviado. Se não houver usuário inicial, consulte a documentação original em `apps/erp/backend/COMO_INICIAR.md` e `apps/erp/README.md`.

## 10. Backup

```bash
bash scripts/backup.sh
```
