# G.One Portal — pacote pronto para rodar v1.3

Por padrão sobe **somente o portal G.One** (ex.: `globaltecone.tech`). AVA, ERP e TECA são opcionais.

## Teste local rápido (só portal)

```bash
bash scripts/start_local.sh
```

Abra: **http://localhost:8080**

## Produção na VPS (só portal)

DNS tipo A: `globaltecone.tech` → IP da VPS

```bash
cd /opt
git clone https://github.com/globalteceducacional/Globalone.git
cd Globalone
bash scripts/install_ubuntu_vps.sh
bash scripts/prepare_env.sh
nano .env
bash scripts/doctor.sh
bash scripts/start_prod.sh
```

Acesse: **https://globaltecone.tech**

## Suite completa (AVA + ERP + TECA) — opcional

Quando tiver os subdomínios `ava`, `erp` e `teca`:

```bash
bash scripts/prepare_env_full.sh
nano .env
bash scripts/start_full.sh
```

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
