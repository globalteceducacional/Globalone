# Instalação online em VPS Ubuntu

VPS mínima para demo: 2 vCPU, 4 GB RAM, 60 GB SSD. Recomendado para uso institucional: 4 vCPU, 8–16 GB RAM, 100 GB SSD.

DNS tipo A:

```txt
one.seudominio.com.br   -> IP_DA_VPS
erp.seudominio.com.br   -> IP_DA_VPS
ava.seudominio.com.br   -> IP_DA_VPS
teca.seudominio.com.br  -> IP_DA_VPS
```

Portas: 80, 443 e 22.

Instalação:

```bash
sudo apt update && sudo apt install -y unzip
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
