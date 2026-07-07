# Editor Master e correção de mídias

## Objetivo

Permitir que o usuário Master/Admin edite o conteúdo visual do G.One sem programação, por meio do item Configurações.

## Arquivos adicionados

- `apps/gone/assets/js/master_content_editor.js`
- `apps/gone/assets/js/media_compatibility_guard.js`
- `apps/gone/assets/js/gone_repository_bridge.js`

## Comportamento esperado

### Configurações

O G.One passa a ter um botão discreto de Configurações para Master/Admin.

O usuário pode ativar:

- três pontinhos sutis nos blocos editáveis;
- edição por clique em qualquer ponto/bloco da página;
- exportação das edições em JSON.

### Pop-up de edição

O pop-up permite editar:

- título;
- texto/descrição;
- URL de imagem;
- URL de vídeo;
- HTML interno avançado.

### Persistência

Nesta versão, o script salva em `localStorage` como fallback.

Para produção, o Manus deve conectar:

- `SAVE_ENDPOINT` para salvar as edições no servidor;
- `LOAD_ENDPOINT` para carregar edições persistentes.

Recomendação de endpoint:

- `GET /api/gone-content/edits`
- `POST /api/gone-content/edits`

Pode ser implementado como serviço leve Node/Express, SQLite/PostgreSQL ou arquivo JSON protegido no servidor.

## Mídias bugadas

O script `media_compatibility_guard.js` trata:

- imagens quebradas;
- imagens em formatos ruins para web, como HEIC/HEIF/TIFF/RAW/PSD;
- vídeos com extensão não recomendada;
- erro de carregamento em vídeos.

Formatos recomendados:

- Imagem: `.webp`, `.jpg`, `.jpeg`, `.png`, `.svg`.
- Vídeo: `.mp4` com H.264/AAC, `.webm`, `.ogg`.

