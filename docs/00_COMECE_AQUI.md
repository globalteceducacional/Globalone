# Comece aqui — G.One Suite Completa + Teca.ia

Este pacote roda a plataforma completa como suite única: G.One Portal, AVA/Moodle, ERP Globaltec, Teca.ia e Caddy Gateway.

## Teste local em 3 comandos

```bash
unzip GONE_SUITE_COMPLETA_DOCKER_TECA_PRONTA_v1_2.zip
cd GONE_SUITE_COMPLETA_DOCKER_TECA_PRONTA_v1_2
bash scripts/start_local.sh
```

Acesse: G.One `http://localhost:8080`, AVA `http://localhost:8081`, ERP `http://localhost:5174`, TECA `http://localhost:8083`.

## Produção em VPS

Aponte os DNS `one`, `ava`, `erp` e `teca` para o IP da VPS. Depois:

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

Para IA real, configure `GEMINI_API_KEY` ou `TECA_TCP_ENABLED=true` com host/porta do servidor TCP original.
