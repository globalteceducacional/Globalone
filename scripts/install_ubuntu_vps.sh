#!/usr/bin/env bash
set -euo pipefail

echo "Instalando dependências base: Docker, Compose, Git, Unzip..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release unzip git

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin não encontrado. Verifique a instalação do Docker."
  exit 1
fi

echo "Pronto. Agora rode: cp .env.example .env ; nano .env ; docker compose up -d --build"
