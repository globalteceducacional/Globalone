# G.One Suite Completa + Teca.ia — pacote pronto para rodar v1.2

Este pacote instala em Docker: G.One Portal, AVA/Moodle, ERP Globaltec, Teca.ia Web/API e Caddy Gateway com HTTPS automático.

## Teste local rápido

```bash
unzip GONE_SUITE_COMPLETA_DOCKER_TECA_PRONTA_v1_2.zip
cd GONE_SUITE_COMPLETA_DOCKER_TECA_PRONTA_v1_2
bash scripts/start_local.sh
```

Abra:

```txt
G.One:    http://localhost:8080
AVA:      http://localhost:8081
ERP:      http://localhost:5174
TECA.IA:  http://localhost:8083
```

## Publicar online em VPS

```bash
cd /opt
unzip GONE_SUITE_COMPLETA_DOCKER_TECA_PRONTA_v1_2.zip
cd GONE_SUITE_COMPLETA_DOCKER_TECA_PRONTA_v1_2
bash scripts/install_ubuntu_vps.sh
rm -f .env
bash scripts/prepare_env.sh
nano .env
bash scripts/doctor.sh
bash scripts/start_prod.sh
```

Antes, aponte os DNS `one`, `ava`, `erp` e `teca` para a VPS.

## Documentação

Comece por `docs/00_COMECE_AQUI.md`. Índice completo em `docs/12_INDICE_DE_DOCUMENTOS.md`.

## Comandos úteis

```bash
make local
make prod
make status
make logs
make backup
make stop
make doctor
```

## Observação honesta

O pacote está organizado para rodar em ambiente com Docker. Este ambiente do ChatGPT não possui Docker disponível para buildar e levantar os containers daqui; o teste real precisa ser feito na sua máquina com Docker ou em uma VPS.
