# Teca.ia — Assistente Virtual Inteligente

Aplicativo Flutter multiplataforma que conecta alunos e professores a uma IA de conversação com voz, explicação didática e resolução matemática.

---

## Funcionalidades

### Autenticação
- Login/registro com JWT via API `bylab-new-api`
- Sessão persistente com verificação e renovação de token
- Perfis: aluno, professor e administrador
- Modo administrador oculto (5 cliques no logo)
- Modo local automático quando sem conexão com a API

### Três Modos de Chat
| Modo | Ícone | Função do servidor | Descrição |
|------|-------|--------------------|-----------|
| **Voz** | 🎤 | `responda` | Resposta com TTS — texto e áudio sincronizados |
| **Explicativo** | 📚 | `responda_explicativo` | Formatação rica com Markdown estruturado |
| **Matemática** | 🧮 | `responda_matematica` | Renderização LaTeX nativa (frações, raízes, matrizes, sistemas) |

### Comunicação com a IA
- Protocolo TCP (`IaSocketClient`) compatível com `Cliente/cliente.py`
- Streaming de texto em tempo real (chunk a chunk)
- Áudio WAV por partes via marcador `<<AUDIO>>` durante o stream
- No modo voz: texto só aparece quando o primeiro áudio chega (sincronização)
- Fallback para exibir o texto se o servidor não enviar áudio

### Áudio
- `audioplayers` no desktop (Windows/Linux/macOS)
- `just_audio` no mobile/web (Android/iOS)
- Fila de reprodução sequencial com reprodução incremental durante streaming
- Animação do personagem sincronizada com a fala

### Upload de Arquivos
- PDF e TXT via `file_picker`
- Envio pelo protocolo TCP (`funcao: upload`, base64)
- Processamento pela IA e resposta no chat

### Renderização LaTeX (Modo Matemática)
Implementação nativa com `CustomPainter` — sem WebView:

| Elemento | Suporte |
|----------|---------|
| Frações `\frac` | Linha divisória visual |
| Raízes `\sqrt` | Gancho + traço via `_SqrtPainter` |
| Matrizes `pmatrix`, `bmatrix`, `vmatrix`... | Tabela com delimitadores |
| Ambiente `aligned` | Colunas alinhadas |
| Sistema `\begin{cases}` | Chave `{` via `_LeftBracePainter` |
| Sub/superscrito `_x`, `^x` | Unicode (₀₁₂… / ⁰¹²…) |
| Símbolos gregos e operadores | Unicode direto |
| Math inline `$...$` em títulos | Detectado e processado |

---

## Arquitetura

```
lib/
├── main.dart                        # Inicialização: dotenv → Hive → app
├── config/
│   └── env_config.dart              # Leitura tipada do .env
│
├── models/
│   ├── api_chat_models.dart         # DTOs da API REST
│   ├── chat_history.dart            # Modelo Hive de histórico local
│   ├── chat_history.g.dart          # Gerado por hive_generator
│   ├── command.dart                 # Modelo de comando rápido
│   └── message.dart                 # Modelo de mensagem
│
├── services/
│   ├── auth_service.dart            # JWT, login/logout, hasValidApiUser()
│   ├── api_chat_service.dart        # REST: chats, mensagens, schoolId
│   ├── chat_service.dart            # Orquestra IA + API; ChatMode enum
│   ├── ia_socket_client.dart        # Cliente TCP (protocolo cliente.py)
│   ├── audio_service.dart           # Fila de reprodução multiplataforma
│   ├── file_service.dart            # Upload via socket TCP
│   └── chat_history_service.dart    # Persistência Hive local
│
├── ui/
│   ├── home_page.dart               # Tela principal — chat, modos, streaming
│   ├── login_page.dart              # Login com JWT
│   └── components/
│       ├── animated_character.dart  # Personagem animado (12 frames)
│       ├── chat_bubble.dart         # Bolha de mensagem
│       ├── chat_drawer.dart         # Menu lateral de chats
│       ├── chat_header.dart         # Cabeçalho com personagem/modo
│       ├── chat_sidebar.dart        # Sidebar de chats (desktop)
│       ├── chat_type_selection_dialog.dart  # Diálogo de novo chat
│       ├── command_buttons.dart     # Botões de comando rápido
│       ├── command_manager.dart     # Gerenciador de comandos
│       ├── confirmation_dialog.dart # Diálogos de confirmação
│       ├── explanatory_formatter.dart  # Formatação modo explicativo
│       ├── loading_indicator.dart   # Indicador de carregamento
│       ├── mathematical_formatter.dart  # Renderização LaTeX nativa
│       ├── message_input.dart       # Campo de mensagem + microfone
│       ├── mode_tabs.dart           # Abas de modo (Voz/Explicativo/Matemática)
│       ├── smart_text_renderer.dart # Roteador de formatter por modo
│       ├── voice_selection_dialog.dart  # Seleção de personagem/voz
│       └── welcome_screen.dart      # Tela de boas-vindas
│
└── utils/
    ├── audio_test.dart              # Utilitário de teste de áudio
    └── file_upload_example.dart     # Exemplo de upload

Cliente/                             # Referência de protocolo TCP (Python)
├── cliente.py                       # Cliente de referência
└── recv_audio.py                    # Reprodução de áudio WAV (Python)
```

---

## Configuração

### 1. Variáveis de Ambiente

Crie o arquivo `.env` na raiz do projeto (nunca versionar):

```env
# API REST (autenticação e chats)
API_BASE_URL=http://SEU_IP_VPS:PORTA

# Servidor de IA local (socket TCP)
IA_SERVER_HOST=192.168.X.X
IA_SERVER_PORT=6000
IA_DEFAULT_VOICE=Teca_v2
```

O `.env.example` contém o template sem valores reais.

### 2. Instalar dependências

```powershell
flutter pub get
```

### 3. Executar

```powershell
# Windows (desktop)
flutter run -d windows

# Android
flutter run -d android

# Release APK
flutter build apk --release
```

---

## Protocolo TCP com o Servidor de IA

O app implementa o mesmo protocolo do `Cliente/cliente.py`:

```
Cliente → Servidor:
  {"ID": "cliente", "funcao": "responda", "parametro": "...", "stream": true, "voice": "Teca_v2"}

Servidor → Cliente (streaming):
  <<STREAM_START>>
  [chunk de texto]
  [chunk de texto]
  <<AUDIO>>
  [pacote WAV: 10 bytes de tamanho + bytes WAV]
  <<FINAL>>
  [texto completo]
  <<STREAM_END>>
```

Funções disponíveis:

| Função | Modo |
|--------|------|
| `responda` | Voz (com TTS) |
| `responda_explicativo` | Explicativo |
| `responda_matematica` | Matemática |
| `upload` | Envio de arquivo |

---

## API REST (`bylab-new-api`)

Base URL configurada em `.env` → `API_BASE_URL`

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/auth/login` | Login JWT |
| `POST` | `/auth/register` | Cadastro |
| `GET` | `/chats/user/:userId` | Listar chats do usuário |
| `POST` | `/chats` | Criar chat (envia `schoolId`) |
| `DELETE` | `/chats/:chatId` | Deletar chat |
| `GET` | `/chats/:chatId/messages` | Buscar mensagens |
| `POST` | `/chats/:chatId/messages` | Enviar mensagem |

---

## Personagens / Vozes

Cada personagem mapeia para uma voz no servidor TTS:

| ID no app | Voz no servidor | Assets |
|-----------|-----------------|--------|
| `Teca_v2` | `Teca_v2` | `assets/teca_v1/teca_1..17.png` |
| `Einstein` | `Einstein` | `assets/einstein/` |
| `Curie` | `Curie` | `assets/Curie/` |
| `Frida` | `Frida` | `assets/Frida/` |
| `Turing` | `Turing` | `assets/Turing/` |
| `King` | `King` | `assets/King/` |
| `Cleopatra` | `Cleopatra` | `assets/Cleopatra/` |

---

## Plataformas

| Plataforma | Status | Player de áudio |
|------------|--------|-----------------|
| Android | Suportado | `just_audio` |
| iOS | Suportado | `just_audio` |
| Windows | Suportado | `audioplayers` |
| Web | Suportado | `just_audio` |
| Linux | Parcial | `audioplayers` |
| macOS | Parcial | `audioplayers` |

---

## Solução de Problemas

**App não alcança o servidor de IA**
- Confirme que o dispositivo está na mesma rede Wi-Fi que o host `IA_SERVER_HOST`
- No Windows/Portainer: exponha a porta com `0.0.0.0:6000:6000` no container
- Verifique o Firewall do Windows para a porta configurada

**Áudio não toca no Windows**
- O app usa `audioplayers_windows` — verifique se `flutter pub get` foi executado após limpeza
- Após mudanças de dependência, sempre `flutter clean && flutter pub get`

**Texto aparece sem áudio**
- Cheque nos logs: `IaSocketClient: áudio salvo em ...` — se não aparecer, o servidor não gerou TTS
- Teste com `Cliente/cliente.py` modo 1 diretamente no host do servidor

**Build do Windows falha (CMakeCache)**
```powershell
flutter clean
Remove-Item -Recurse -Force build
flutter pub get
flutter run -d windows
```

---

**Teca.ia** — IA educacional com voz, matemática e explicação didática.
