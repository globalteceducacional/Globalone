# Refactor: Storage local → MinIO/S3

Plano para migrar o armazenamento de arquivos (`/app/uploads`) do disco do
container backend para o MinIO já disponível em `http://minio.lan.alenxandriaglobaltec.com`.

A estratégia recomendada é introduzir um **driver toggle** (`STORAGE_DRIVER=disk|s3`)
para permitir rollback rápido caso algo quebre, e migrar os call-sites
incrementalmente sem reescrever todos os controllers de uma vez.

---

## 1. Estado atual

### Onde os arquivos são gravados

8 controllers/services usam `multer.diskStorage` com helper inline que lê
`process.env.UPLOADS_DIR` (default `/app/uploads`):

| Arquivo | Subdir |
|---|---|
| [src/modules/uploads/uploads.controller.ts:46](../backend/src/modules/uploads/uploads.controller.ts#L46) | `general/` |
| [src/modules/users/users.controller.ts:93](../backend/src/modules/users/users.controller.ts#L93) | `users/profiles/` |
| [src/modules/users/users.controller.ts:132](../backend/src/modules/users/users.controller.ts#L132) | `users/...` (avatar) |
| [src/modules/projects/projects.controller.ts:260](../backend/src/modules/projects/projects.controller.ts#L260) | `projects/` |
| [src/modules/tasks/tasks.controller.ts:66](../backend/src/modules/tasks/tasks.controller.ts#L66) | `tasks/` |
| [src/modules/rh/documentos/documentos.controller.ts:70](../backend/src/modules/rh/documentos/documentos.controller.ts#L70) | `docs-rh/` |
| [src/modules/rh/ponto/ponto.controller.ts:67](../backend/src/modules/rh/ponto/ponto.controller.ts#L67) | `ponto/` |
| [src/modules/rh/afastamentos/afastamentos.controller.ts:69](../backend/src/modules/rh/afastamentos/afastamentos.controller.ts#L69) | `afastamentos/` |
| [src/modules/stock/stock.service.ts:225](../backend/src/modules/stock/stock.service.ts#L225) | `stock/` |

### Onde os arquivos são servidos

- **Públicos**: `app.use(uploadsUrlPrefix, express.static(...))` em [src/main.ts:40](../backend/src/main.ts#L40) → todas as URLs `/uploads/<subdir>/<file>` são servidas pelo backend a partir do disco.
- **Privados** (com JWT + permissão): [src/modules/uploads/uploads-protegidos.controller.ts](../backend/src/modules/uploads/uploads-protegidos.controller.ts) → tipos `docs-rh`, `afastamentos`, `ponto` chamam `res.sendFile(filePath)` direto do FS.

### O que está salvo no banco

URLs **relativas** persistidas nos models Prisma:

- `DocumentoColaborador.arquivoUrl` (e legado `/uploads/docs-rh/...`)
- `Afastamento.anexoUrl` (e legado)
- `RegistroPonto.fotoUrl` (e legado)
- Provavelmente também em models de tasks/projects/stock (verificar `prisma/schema.prisma`).

> **Importante:** o que está salvo no banco são paths relativos, não URLs absolutas.
> Isso facilita o refactor — quem resolve o path absoluto é o frontend
> (`<API_URL>${arquivoUrl}`) ou o `express.static`/`uploads-protegido`.

---

## 2. Objetivo final

```
+-------------+         +---------+         +----------+
|  Frontend   | ----->  | Backend |  --->   |  MinIO   |
|             |  GET    |         |  S3 SDK | (bucket  |
|             | /uploads|         |         |  erp-*)  |
+-------------+         +---------+         +----------+
                          |  STORAGE_DRIVER=s3
                          |
                          +-- escrita: multer-s3 grava direto no bucket
                          +-- leitura publica: redirect 302 -> URL do MinIO
                              (ou presigned URL) para `/uploads/...`
                          +-- leitura privada: backend faz stream do bucket
                              em `/uploads-protegido/...` (mantém check
                              de permissões intacto)
```

**Buckets sugeridos:**
- `erp-public` — `general/`, `users/`, `projects/`, `tasks/`, `stock/` (acesso anônimo permitido, presigned não obrigatório)
- `erp-private` — `docs-rh/`, `ponto/`, `afastamentos/` (apenas backend acessa, JWT obrigatório)

---

## 3. Arquivos novos a criar

### `src/storage/storage.module.ts`
NestJS module global que provê `StorageService`. Lê `STORAGE_DRIVER` do env e
escolhe a implementação concreta.

### `src/storage/storage.service.ts`
Interface comum:
```ts
export abstract class StorageService {
  /** Retorna o `multer.StorageEngine` para usar no FilesInterceptor */
  abstract getMulterStorage(subdir: string): multer.StorageEngine;

  /** Devolve um stream para o arquivo (usado em uploads-protegidos) */
  abstract getStream(subdir: string, filename: string): Promise<NodeJS.ReadableStream>;

  /** Verifica existência (usado em uploads-protegidos) */
  abstract exists(subdir: string, filename: string): Promise<boolean>;

  /** Retorna a URL pública (relativa ou absoluta) para resposta JSON */
  abstract publicUrl(subdir: string, filename: string): string;

  /** Apaga um arquivo */
  abstract delete(subdir: string, filename: string): Promise<void>;
}
```

### `src/storage/disk.driver.ts`
Implementação atual, encapsulada. Move a função `resolveUploadsDir` repetida nos 8 controllers para cá. Usa `multer.diskStorage` + `fs.createReadStream`.

### `src/storage/s3.driver.ts`
Implementação S3 com:
```ts
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multerS3 from 'multer-s3';
```
- `getMulterStorage(subdir)` retorna `multerS3({ s3, bucket, key: (req, file, cb) => cb(null, \`${subdir}/${ts}-${rnd}${ext}\`) })`
- `getStream(subdir, filename)` faz `s3.send(new GetObjectCommand({ Bucket, Key: \`${subdir}/${filename}\` }))` e retorna `result.Body as NodeJS.ReadableStream`
- `publicUrl` decide entre: presigned (TTL curto) ou path direto se bucket policy é public
- `delete` faz `DeleteObjectCommand`

---

## 4. Arquivos a modificar

### Pacotes a instalar
```bash
cd backend
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner multer-s3
npm install -D @types/multer-s3
```

### Substituições nos 8 controllers

Padrão atual:
```ts
@UseInterceptors(
  FilesInterceptor('files', LIMIT, {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, resolveUploadsDir('tasks')),
      filename:    (_req, file, cb) => cb(null, `${Date.now()}-${rnd}${extname(file.originalname)}`),
    }),
    limits: {...},
    fileFilter: ...
  }),
)
```

Vira:
```ts
constructor(private readonly storage: StorageService) {}

@UseInterceptors(
  FilesInterceptor('files', LIMIT, {
    storage: undefined, // resolvido dinamicamente
    limits: {...},
    fileFilter: ...,
  }),
)
// E no método, antes do upload, usar um middleware/guard que injeta `storage.getMulterStorage('tasks')`.
```

> ⚠️ NestJS não suporta `storage:` dinâmico declarativamente. Solução: usar um **interceptor customizado** que monta o `FilesInterceptor` em runtime com base no driver atual. Ou refatorar todos os controllers pra usarem `MulterModule.registerAsync` + `useFactory` com escopo por rota. Discussão arquitetural a fazer no momento do PR.

### `src/main.ts:27-48`

Trocar bloco do `express.static`:
```ts
if (process.env.STORAGE_DRIVER === 's3') {
  // Redirect /uploads/<subdir>/<file> -> URL do MinIO (com presigned se bucket privado)
  app.use(uploadsUrlPrefix, (req, res, next) => {
    const [_, subdir, ...rest] = req.path.split('/').filter(Boolean);
    const filename = rest.join('/');
    if (!subdir || !filename) return next();
    const url = storage.publicUrl(subdir, filename);
    res.redirect(302, url);
  });
} else {
  // Mantém express.static atual
  ...
}
```

### `src/modules/uploads/uploads-protegidos.controller.ts:60-69`

Substituir `res.sendFile(filePath)` por stream do storage:
```ts
const exists = await this.storage.exists(tipo, filename);
if (!exists) throw new NotFoundException('Arquivo não encontrado.');

res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('Cache-Control', 'private, no-store, max-age=0');
const stream = await this.storage.getStream(tipo, filename);
stream.pipe(res);
```

---

## 5. Variáveis de ambiente novas

Em `env.example` e `/home/deploy/secrets/erp.env`:

```env
# Storage driver: disk (default, lê/escreve em UPLOADS_DIR) ou s3 (MinIO/AWS)
STORAGE_DRIVER=disk

# Config S3 — só usadas se STORAGE_DRIVER=s3
S3_ENDPOINT=http://minio:9000          # nome do container no docker compose, network proxy
S3_REGION=us-east-1                    # MinIO ignora, mas SDK exige
S3_ACCESS_KEY=<criar no console MinIO>
S3_SECRET_KEY=<criar no console MinIO>
S3_BUCKET_PUBLIC=erp-public
S3_BUCKET_PRIVATE=erp-private
S3_FORCE_PATH_STYLE=true               # MinIO requer path-style
S3_PUBLIC_BASE_URL=http://minio.lan.alenxandriaglobaltec.com  # URL externa do MinIO via Traefik (pra redirect 302)
```

---

## 6. Setup no MinIO antes de flipar o driver

1. Acessar console `http://minio-console.lan.alenxandriaglobaltec.com`, login com `admin` + senha root.
2. Criar bucket `erp-public`:
   - **Access policy: public** (anonymous read). Em Buckets → erp-public → Anonymous → Add Access Rule → prefix `/` → `readonly`.
3. Criar bucket `erp-private`:
   - Mantém default (privado).
4. Criar **Access Key** dedicada pro backend (não usar root):
   - Identity → Access Keys → Create
   - Anota `Access Key` e `Secret Key`
   - Anexa policy mínima (`s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`) nos 2 buckets.

---

## 7. Plano de migração dos arquivos existentes

Existem 2 fontes de arquivos:
- VPS de produção: `/var/erp-uploads/`
- Servidor local: volume Docker `erp_uploads` (vazio se nunca recebeu upload)

Estratégia: usar o cliente `mc` do MinIO ou `aws s3 cp` pra subir os arquivos da VPS direto pro bucket. Roda **uma vez** antes de flipar `STORAGE_DRIVER=s3`.

```bash
# No servidor local (WSL Ubuntu)

# Instala mc client (uma vez)
docker run --rm -it --entrypoint=/bin/sh minio/mc -c \
  "mc alias set local http://minio:9000 admin <SENHA_ROOT>; mc ls local"

# Pra trazer arquivos da VPS via scp + carregar no MinIO:
ssh vps "tar czf - /var/erp-uploads" > /tmp/uploads.tar.gz
# extrai localmente, depois:
docker run --rm \
  -v /tmp/extracted:/data \
  --network proxy \
  minio/mc sh -c "
    mc alias set local http://minio:9000 admin <SENHA>;
    mc cp --recursive /data/general/ local/erp-public/general/;
    mc cp --recursive /data/users/ local/erp-public/users/;
    mc cp --recursive /data/projects/ local/erp-public/projects/;
    mc cp --recursive /data/tasks/ local/erp-public/tasks/;
    mc cp --recursive /data/stock/ local/erp-public/stock/;
    mc cp --recursive /data/docs-rh/ local/erp-private/docs-rh/;
    mc cp --recursive /data/ponto/ local/erp-private/ponto/;
    mc cp --recursive /data/afastamentos/ local/erp-private/afastamentos/;
  "
```

> **Atenção**: o user disse "não modifique nada na VPS". Então a transferência usa SSH read-only (tar + ssh-output). Se SSH não estiver configurado, alternativa é baixar via painel da Hostinger ou via algum outro canal.

---

## 8. Rollback

Se algo quebrar em produção:
1. Edita `/home/deploy/secrets/erp.env` → `STORAGE_DRIVER=disk`
2. `cd /home/deploy/actions-runner/_work/ERP-Globaltec/ERP-Globaltec && docker compose restart backend`
3. Backend volta a gravar no volume `erp_uploads` local.

Arquivos novos gravados no S3 durante a tentativa ficam órfãos (não estão no `erp_uploads`), mas eles continuam acessíveis se um dia voltar o driver pra s3. Não há perda de dado.

Não rebaixar o schema do banco (nenhuma mudança no Prisma é necessária).

---

## 9. Testing checklist (manual)

Antes de flipar `STORAGE_DRIVER=s3` em produção, validar:

- [ ] Upload genérico `/api/uploads` → arquivo aparece no `erp-public/general/`
- [ ] Avatar de usuário (POST `/api/users/<id>/avatar`) → `erp-public/users/`
- [ ] Anexo de tarefa → `erp-public/tasks/`
- [ ] Anexo de projeto → `erp-public/projects/`
- [ ] Foto de estoque → `erp-public/stock/`
- [ ] Foto do ponto (POST `/api/rh/ponto/...`) → `erp-private/ponto/`
- [ ] Documento RH → `erp-private/docs-rh/`
- [ ] Anexo de afastamento → `erp-private/afastamentos/`
- [ ] Acessar URL pública `/uploads/general/<file>` retorna 302 pro MinIO e o GET seguinte funciona
- [ ] Acessar URL privada `/uploads-protegido/docs-rh/<file>` com JWT correto retorna o arquivo
- [ ] Acessar URL privada com JWT errado retorna 403
- [ ] Acessar URL privada com path traversal (`../`) retorna 404
- [ ] Listagem (`GET /api/...`) retorna paths que abrem corretamente no frontend
- [ ] Delete: `npm run` em um endpoint que apaga arquivo (verificar se há) → bucket fica limpo
- [ ] Restart do container: arquivos seguem acessíveis (persistência)

---

## 10. Estimativa de esforço

| Etapa | Horas |
|---|---|
| Criar StorageModule + interfaces | 0.5 |
| Implementar driver disk (extrair lógica atual) | 0.5 |
| Implementar driver s3 (multer-s3 + presigned + stream) | 1.0 |
| Refatorar 8 controllers + main.ts + uploads-protegidos | 1.5 |
| Migrar arquivos existentes (script `mc cp`) | 0.5 |
| Testes manuais checklist | 1.0 |
| **Total** | **5 horas** |

---

## 11. Não-objetivos (escopo fora desse refactor)

- Migrar para outro provedor (AWS S3 real): basta trocar `S3_ENDPOINT` e access keys.
- CDN na frente do MinIO: deixar pra depois.
- Antivirus scan nos uploads: deixar pra depois.
- Quotas por usuário: deixar pra depois.
- Versionamento de buckets: deixar pra depois.
