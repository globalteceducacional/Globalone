# Backup semanal do ERP na VPS

O ERP guarda dados em **dois lugares** que precisam de backup:

| O quê | Onde |
|-------|------|
| Banco PostgreSQL (usuários, projetos, ponto, compras…) | Volume Docker `db_data` |
| Arquivos (fotos de ponto, anexos, PDFs…) | `/var/erp-uploads` |

Código e containers podem ser recriados com `git pull` + `docker compose build`. O que **não** dá para recuperar sem backup são **banco + uploads**.

---

## 1. Preparar pasta de backup

Na VPS:

```bash
sudo mkdir -p /var/backups/erp
sudo chown root:root /var/backups/erp
sudo chmod 700 /var/backups/erp
```

---

## 2. Testar backup manual

```bash
cd /opt/ERP-Globaltec
chmod +x deploy/backup-erp.sh deploy/restore-erp.sh
sh deploy/backup-erp.sh
ls -lh /var/backups/erp/
```

Deve aparecer um arquivo `erp_backup_YYYYMMDD_HHMMSS.tar.gz` (dezenas ou centenas de MB, conforme uso).

Conteúdo do `.tar.gz`:

- `database.sql.gz` — dump do PostgreSQL
- `uploads.tar.gz` — pasta `/var/erp-uploads`
- `env.backup` — cópia do `.env` (contém segredos; proteja o arquivo)
- `manifest.txt` — data, hostname, `docker compose ps`

---

## 3. Agendar backup semanal (cron)

Domingo às 03:00 (horário da VPS):

```bash
sudo crontab -e
```

Adicione:

```cron
0 3 * * 0 cd /opt/ERP-Globaltec && /bin/sh deploy/backup-erp.sh >> /var/log/erp-backup.log 2>&1
```

Opcional — variáveis no próprio cron:

```cron
0 3 * * 0 ERP_BACKUP_DIR=/var/backups/erp ERP_BACKUP_RETAIN_WEEKS=12 cd /opt/ERP-Globaltec && /bin/sh deploy/backup-erp.sh >> /var/log/erp-backup.log 2>&1
```

Ver log:

```bash
tail -50 /var/log/erp-backup.log
```

---

## 4. Backup off-site (recomendado)

Copie cada `.tar.gz` para **outro lugar** (outro servidor, HD externo, nuvem). Exemplos:

**rsync para outro servidor:**

```bash
rsync -avz /var/backups/erp/ usuario@outro-servidor:/backups/erp-globaltec/
```

**rclone (Google Drive / S3 / OneDrive):**

```bash
rclone copy /var/backups/erp/ remote:erp-backups/ --include "erp_backup_*.tar.gz"
```

Sem cópia externa, um problema no disco da VPS apaga ERP **e** backup juntos.

---

## 5. Restaurar (emergência)

```bash
cd /opt/ERP-Globaltec
sh deploy/restore-erp.sh /var/backups/erp/erp_backup_20260519_030000.tar.gz
```

Digite `RESTAURAR` quando solicitado.

Teste a restauração **pelo menos uma vez** em ambiente de homologação ou antes de precisar de verdade.

---

## 6. Retenção

Por padrão o script mantém **8 semanas** de backups locais (`ERP_BACKUP_RETAIN_WEEKS=8`).

Ajuste no `.env` da raiz do projeto:

```env
ERP_BACKUP_DIR=/var/backups/erp
ERP_UPLOADS_DIR=/var/erp-uploads
ERP_BACKUP_RETAIN_WEEKS=12
```

---

## Checklist rápido

- [ ] Backup manual testado
- [ ] Cron semanal configurado
- [ ] Cópia off-site configurada
- [ ] Restauração testada uma vez
- [ ] `.env` e backups **não** commitados no Git
