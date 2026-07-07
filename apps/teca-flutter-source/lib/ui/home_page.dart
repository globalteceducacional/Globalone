import 'package:flutter/material.dart';
import '../services/chat_service.dart';
import '../services/auth_service.dart';
import '../services/audio_service.dart';
import '../services/file_service.dart';
import 'components/message_input.dart';
import 'components/chat_bubble.dart';
import 'components/smart_text_renderer.dart';
import 'components/voice_selection_dialog.dart';
import 'components/welcome_screen.dart';
import 'components/chat_header.dart' as header;
import 'components/chat_type_selection_dialog.dart';
import 'components/chat_drawer.dart';
import 'components/confirmation_dialog.dart';
import 'components/loading_indicator.dart';
import 'components/animated_character.dart';
import 'dart:math';
import 'package:file_picker/file_picker.dart';
import 'dart:async';
import '../services/api_chat_service.dart';
import 'package:flutter/services.dart';

class ChatMessage {
  final String text;
  final bool isUser;
  bool animated;
  final String? personagem; // Novo campo para armazenar o personagem usado
  final bool isSaved; // Campo para identificar se foi salva no banco

  ChatMessage({
    required this.text,
    required this.isUser,
    this.animated = false,
    this.personagem, // Novo parâmetro opcional
    this.isSaved = false, // Por padrão, não salva
  });
}

class Chat {
  final String id;
  String title;
  List<ChatMessage> messages;
  ChatMode mode; // Novo campo para identificar o modo do chat

  Chat({
    required this.id,
    required this.title,
    required this.messages,
    required this.mode,
  });
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  // Chats separados por modo
  final Map<ChatMode, List<Chat>> _chatsByMode = {
    ChatMode.voz: [],
    ChatMode.explicativo: [],
    ChatMode.matematica: [],
  };
  int _selectedChat = 0;
  final TextEditingController _controller = TextEditingController();
  bool _isLoading = false;
  DateTime? _loadingStartTime; // Para controlar tempo de carregamento

  // Controle de streaming ativo
  bool _isStreamingActive = false;
  StreamSubscription? _streamingSubscription;

  // Controle de edição de mensagem
  int? _editingMessageIndex;

  ChatMode _chatMode = ChatMode.voz; // Modo padrão
  int _personagemFrame = 1;
  static const int _totalFrames = 12;

  bool _showPersonagem = true;
  final ScrollController _scrollController = ScrollController();
  Timer? _animationTimer;
  Timer? _loadingTimer; // Timer para atualizar contador de carregamento
  PlatformFile? _pendingFile;

  // Modo voz: segura o texto até o primeiro áudio chegar
  String _streamBufferedText = '';
  bool _voiceTextUnlocked = false;

  // Personalidades de voz disponíveis
  String _selectedVoice = 'Teca_v2'; // ID da voz no servidor de IA
  final List<Map<String, dynamic>> _availableVoices = [
    {
      'name': 'Teca_v2',
      'displayName': 'Teca',
      'icon': Icons.person,
      'imagePath': 'assets/teca_v1/teca_1-removebg-preview.png',
    },
    {
      'name': 'Einstein',
      'displayName': 'Einstein',
      'icon': Icons.science,
      'imagePath': 'assets/einstein/einstein.png',
    },
    {
      'name': 'Curie',
      'displayName': 'Curie',
      'icon': Icons.science_outlined,
      'imagePath': 'assets/Curie/curie.png',
    },
    {
      'name': 'Frida',
      'displayName': 'Frida',
      'icon': Icons.palette,
      'imagePath': 'assets/Frida/Frida.png',
    },
    {
      'name': 'Turing',
      'displayName': 'Turing',
      'icon': Icons.computer,
      'imagePath': 'assets/Turing/turing.png',
    },
    {
      'name': 'King',
      'displayName': 'King',
      'icon': Icons.people,
      'imagePath': 'assets/King/king.png',
    },
    {
      'name': 'Cleopatra',
      'displayName': 'Cleopatra',
      'icon': Icons.auto_awesome,
      'imagePath': 'assets/Cleopatra/cleoapatra.png',
    },
  ];

  final List<String> _mensagensIniciais = [
    'Me faça uma pergunta!',
    'Sobre o que você quer conversar?',
    'Qual sua dúvida de hoje?',
    'Como posso te ajudar?',
    'Pergunte algo!',
    'Vamos conversar! O que você quer saber?',
  ];
  String? _userId;

  ChatMessage _welcomeMessage() {
    return ChatMessage(
      text: _mensagensIniciais[Random().nextInt(_mensagensIniciais.length)],
      isUser: false,
      personagem: _getSelectedVoice(),
    );
  }

  Chat _localChatForMode(ChatMode mode, [String? title]) {
    return Chat(
      id: 'local-${mode.name}',
      title: title ?? _getChatTitleForMode(mode),
      messages: [_welcomeMessage()],
      mode: mode,
    );
  }

  // Métodos auxiliares para trabalhar com chats por modo
  List<Chat> get _currentChats => _chatsByMode[_chatMode] ?? [];

  Chat? get _currentSelectedChat {
    final chats = _currentChats;
    if (_selectedChat >= 0 && _selectedChat < chats.length) {
      return chats[_selectedChat];
    }
    return null;
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  // Método para alterar o modo de chat
  void _changeChatMode(ChatMode newMode) {
    // Verificar se está carregando - se sim, não permitir troca de modo
    if (_isLoading) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '⏳ Aguarde o carregamento terminar antes de trocar de modo',
          ),
          backgroundColor: Colors.orange,
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    setState(() {
      _chatMode = newMode;
      ChatService.setChatMode(newMode);

      // Resetar chat selecionado para o primeiro do novo modo
      final newModeChats = _chatsByMode[newMode] ?? [];
      _selectedChat = newModeChats.isNotEmpty ? 0 : -1;

      debugPrint('🔄 Modo alterado para: $newMode');
      debugPrint('📋 Chats no novo modo: ${newModeChats.length}');
      debugPrint('📋 Chat selecionado: $_selectedChat');

      // Mostrar personagem apenas no modo voz
      _showPersonagem = (newMode == ChatMode.voz);

      // Parar animação se não for modo voz
      if (newMode != ChatMode.voz) {
        _animationTimer?.cancel();
        _personagemFrame = 1;
      }

      // No modo explicativo, desabilitar animações de texto para leitura direta
      if (newMode == ChatMode.explicativo) {
        debugPrint(
          '📚 Modo explicativo ativado: texto será exibido sem animação',
        );
      }

      // Resetar personagem para Teca ao trocar de modo
      _selectedVoice = 'Teca_v2';

      // ✅ Limpar modo de edição ao trocar de modo
      _editingMessageIndex = null;
    });

    // Limpar mensagens de erro ao trocar de modo (apenas se há chats)
    final currentChats = _currentChats;
    if (currentChats.isNotEmpty &&
        _selectedChat >= 0 &&
        _selectedChat < currentChats.length) {
      _removePreviousErrorMessages();
    }
  }

  // Método para obter a voz selecionada
  String _getSelectedVoice() {
    // No modo explicativo e matemática, sempre usar Teca independente do personagem selecionado no modo voz
    if (_chatMode == ChatMode.explicativo || _chatMode == ChatMode.matematica) {
      return 'Teca';
    }
    return _selectedVoice;
  }

  // Método para obter o nome de exibição da voz selecionada
  String _getSelectedVoiceDisplayName() {
    // No modo explicativo e matemática, sempre mostrar Teca
    if (_chatMode == ChatMode.explicativo || _chatMode == ChatMode.matematica) {
      return 'Teca';
    }

    final voice = _availableVoices.firstWhere(
      (v) => v['name'] == _selectedVoice,
      orElse: () => _availableVoices.first,
    );
    return voice['displayName'] ?? _selectedVoice;
  }

  // Método para obter o nome de exibição de uma voz específica
  String _getVoiceDisplayName(String voiceName) {
    final voice = _availableVoices.firstWhere(
      (v) => v['name'] == voiceName,
      orElse: () => _availableVoices.first,
    );
    return voice['displayName'] ?? voiceName;
  }

  // Método para obter o caminho da imagem da voz selecionada
  String _getSelectedVoiceImagePath() {
    // No modo explicativo e matemática, sempre usar imagem da Teca
    if (_chatMode == ChatMode.explicativo || _chatMode == ChatMode.matematica) {
      return 'assets/teca_v1/teca_1-removebg-preview.png';
    }

    final voice = _availableVoices.firstWhere(
      (v) => v['name'] == _selectedVoice,
      orElse: () => _availableVoices.first,
    );
    return voice['imagePath'] ?? 'assets/teca_v1/teca_1-removebg-preview.png';
  }

  void _editMessage(int messageIndex) {
    if (messageIndex < 0 ||
        messageIndex >=
            _chatsByMode[_chatMode]![_selectedChat].messages.length) {
      return;
    }
    final message =
        _chatsByMode[_chatMode]![_selectedChat].messages[messageIndex];
    if (!message.isUser) return;

    setState(() {
      _editingMessageIndex = messageIndex;
    });

    // Preenche o campo mas NÃO apaga mensagens ainda
    _controller.text = message.text;
    _controller.selection = TextSelection.fromPosition(
      TextPosition(offset: _controller.text.length),
    );

    FocusScope.of(context).requestFocus(FocusNode());
    _scrollToBottom();
  }

  void _cancelEdit() {
    _controller.clear();
    setState(() {
      _editingMessageIndex = null;
    });
  }

  // Método para cortar conexão de streaming ativa
  void _cancelStreaming() {
    if (_isStreamingActive) {
      debugPrint('🛑 Cancelando streaming ativo...');

      // Cancelar subscription se existir
      _streamingSubscription?.cancel();
      _streamingSubscription = null;

      // Remover mensagem vazia da Teca se existir
      final currentChats = _currentChats;
      if (currentChats.isNotEmpty &&
          _selectedChat >= 0 &&
          _selectedChat < currentChats.length) {
        final chat = currentChats[_selectedChat];
        if (chat.messages.isNotEmpty) {
          final lastMessage = chat.messages.last;
          // Se a última mensagem é da IA e está vazia, remover
          if (!lastMessage.isUser &&
              lastMessage.text.isEmpty &&
              !lastMessage.isSaved) {
            setState(() {
              chat.messages.removeLast();
            });
          }
        }
      }

      setState(() {
        _isStreamingActive = false;
        _isLoading = false;
      });

      // Cancelar timers
      _loadingTimer?.cancel();
      _loadingStartTime = null;

      // Mostrar mensagem de cancelamento
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('🛑 Requisição cancelada'),
            backgroundColor: Colors.orange,
            duration: Duration(seconds: 2),
          ),
        );
      }
    }
  }

  void _changeVoice(String newVoice) {
    // Verificar se está carregando ou streaming - se sim, não permitir troca de personagem
    if (_isLoading || _isStreamingActive) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Aguarde a resposta da IA antes de trocar de personagem',
            style: TextStyle(color: Colors.white),
          ),
          backgroundColor: Colors.orange,
          duration: Duration(seconds: 3),
        ),
      );
      return;
    }

    setState(() {
      _selectedVoice = newVoice;
      // Resetar o frame para 1 quando trocar de voz
      _personagemFrame = 1;
    });
  }

  // Método para mostrar o popup de seleção de voz
  void _showVoiceSelectionDialog() {
    // Verificar se está carregando ou streaming - se sim, não permitir troca de personagem
    if (_isLoading || _isStreamingActive) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Aguarde a resposta da IA antes de trocar de personagem',
          ),
          backgroundColor: Colors.orange,
          duration: Duration(seconds: 3),
        ),
      );
      return;
    }

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return VoiceSelectionDialog(
          selectedVoice: _selectedVoice,
          availableVoices: _availableVoices,
          onVoiceChanged: _changeVoice,
          isLoading: _isLoading,
        );
      },
    );
  }

  // Método para processar espaços no JSON e convertê-los em quebras de linha e parágrafos

  // Método para processar espaços no JSON e convertê-los em quebras de linha e parágrafos

  Future<void> _loadHistory() async {
    final userData = await AuthService.getUserData();
    _userId = userData?['userId'] ?? userData?['id'] ?? 'usuario123';

    debugPrint('🔍 Carregando histórico para usuário: $_userId');

    final canUseApi = await AuthService.hasValidApiUser();
    if (!canUseApi) {
      setState(() {
        _chatsByMode.clear();
        _chatsByMode.addAll({
          ChatMode.voz: [_localChatForMode(ChatMode.voz)],
          ChatMode.explicativo: [_localChatForMode(ChatMode.explicativo)],
          ChatMode.matematica: [_localChatForMode(ChatMode.matematica)],
        });
        _chatMode = ChatMode.voz;
        ChatService.setChatMode(_chatMode);
        _selectedChat = 0;
        _selectedVoice = 'Teca_v2';
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Modo local: faça login real para salvar chats na API.',
            ),
            duration: Duration(seconds: 4),
          ),
        );
      }
      return;
    }

    try {
      // Carregar todos os chats do usuário da API
      final chatList = await ApiChatService.getUserChats();
      debugPrint('🔍 Chats encontrados: ${chatList.length}');

      // Separar chats por modo baseado no título
      final Map<ChatMode, List<Chat>> loadedChatsByMode = {
        ChatMode.voz: [],
        ChatMode.explicativo: [],
        ChatMode.matematica: [],
      };

      for (final chat in chatList) {
        debugPrint('🔍 Processando chat: ${chat['id']} - ${chat['title']}');
        final messagesApi = await ApiChatService.getChatMessages(chat['id']);
        final messages =
            messagesApi.map<ChatMessage>((msg) {
              final isUser =
                  msg['user_id'] != null &&
                  msg['user_id'] != '' &&
                  msg['user_id'] == _userId;

              // Verificar se o campo personagem existe
              final personagem = msg['personagem'] as String?;

              return ChatMessage(
                text: msg['content'] ?? '',
                isUser: isUser,
                personagem: personagem, // Incluir o personagem da mensagem
              );
            }).toList();

        // Determinar o modo do chat baseado no título
        ChatMode chatMode = _determineChatMode(chat['title'] ?? '');

        final chatObject = Chat(
          id: chat['id'],
          title: chat['title'] ?? 'Chat',
          messages:
              messages.isNotEmpty
                  ? messages
                  : [
                    ChatMessage(
                      text:
                          _mensagensIniciais[Random().nextInt(
                            _mensagensIniciais.length,
                          )],
                      isUser: false,
                      personagem:
                          _getSelectedVoice(), // Usar o personagem atual
                    ),
                  ],
          mode: chatMode,
        );

        loadedChatsByMode[chatMode]!.add(chatObject);
      }

      debugPrint('✅ Chats carregados por modo:');
      debugPrint('     Voz: ${loadedChatsByMode[ChatMode.voz]!.length}');
      debugPrint(
        '   📚 Explicativo: ${loadedChatsByMode[ChatMode.explicativo]!.length}',
      );
      debugPrint(
        '   🧮 Matemática: ${loadedChatsByMode[ChatMode.matematica]!.length}',
      );

      setState(() {
        _chatsByMode.clear();
        _chatsByMode.addAll(loadedChatsByMode);

        // Se não há chats em nenhum modo, garantir que o modo seja voz
        final totalChats = loadedChatsByMode.values.fold(
          0,
          (sum, chats) => sum + chats.length,
        );
        if (totalChats == 0) {
          _chatMode = ChatMode.voz;
          ChatService.setChatMode(_chatMode);
        }

        // Selecionar primeiro chat do modo atual
        final currentChats = _currentChats;
        _selectedChat = currentChats.isNotEmpty ? 0 : -1;

        // Resetar personagem para Teca ao carregar histórico
        _selectedVoice = 'Teca_v2';
      });
    } catch (e) {
      // Em caso de erro, apenas limpar os chats (não criar chat inicial)
      debugPrint('❌ Erro ao carregar chats: $e');
      setState(() {
        _chatsByMode.clear();
        _chatsByMode.addAll({
          ChatMode.voz: [],
          ChatMode.explicativo: [],
          ChatMode.matematica: [],
        });

        // Garantir que o modo seja voz quando não há chats
        _chatMode = ChatMode.voz;
        ChatService.setChatMode(_chatMode);

        _selectedChat = -1; // Nenhum chat selecionado

        // Resetar personagem para Teca em caso de erro
        _selectedVoice = 'Teca_v2';
      });
    }
  }

  // Método para determinar o modo do chat baseado no título
  ChatMode _determineChatMode(String title) {
    final titleLower = title.toLowerCase();

    if (titleLower.contains('explicativo') || titleLower.contains('texto')) {
      return ChatMode.explicativo;
    } else if (titleLower.contains('matemática') ||
        titleLower.contains('matematica') ||
        titleLower.contains('math')) {
      return ChatMode.matematica;
    } else {
      return ChatMode.voz; // Padrão para chats antigos
    }
  }

  Future<void> _addNewChat() async {
    final messenger = ScaffoldMessenger.of(context);

    // Mostrar diálogo para selecionar tipo de chat
    final selectedMode = await showDialog<ChatMode>(
      context: context,
      builder:
          (context) => ChatTypeSelectionDialog(
            onChatTypeSelected: (mode) {
              Navigator.of(context).pop(mode);
            },
          ),
    );

    if (selectedMode == null) return;

    if (!await AuthService.hasValidApiUser()) {
      if (mounted) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text('Faça login real para criar chats na API.'),
          ),
        );
      }
      return;
    }

    try {
      final userData = await AuthService.getUserData();
      final userId = userData?['userId'] ?? userData?['id'] ?? 'usuario123';
      final schoolId = userData?['schoolId'] as String?;

      final chatTitle = _getChatTitleForMode(selectedMode);

      final chatData = await ApiChatService.createChat(
        chatTitle,
        [userId],
        schoolId: schoolId,
      );
      setState(() {
        final newChat = Chat(
          id: chatData['id'],
          title: chatData['title'] ?? chatTitle,
          messages: [
            ChatMessage(
              text:
                  _mensagensIniciais[Random().nextInt(
                    _mensagensIniciais.length,
                  )],
              isUser: false,
              personagem: _getSelectedVoice(), // Usar o personagem atual
            ),
          ],
          mode: selectedMode,
        );

        _chatsByMode[selectedMode]!.add(newChat);

        // Se o modo selecionado for diferente do atual, trocar para ele
        if (selectedMode != _chatMode) {
          _changeChatMode(selectedMode);
        } else {
          _selectedChat = _chatsByMode[selectedMode]!.length - 1;
        }

        // Resetar personagem para Teca ao criar novo chat
        _selectedVoice = 'Teca_v2';
        _pendingFile = null;
      });

      // Limpar mensagens de erro ao criar novo chat
      _removePreviousErrorMessages();
    } catch (e) {
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(
            content: Text('Erro ao criar chat: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  // Método para gerar título específico baseado no modo
  String _getChatTitleForMode(ChatMode mode) {
    final voiceName = _getSelectedVoiceDisplayName();
    switch (mode) {
      case ChatMode.voz:
        return 'Chat Voz - $voiceName';
      case ChatMode.explicativo:
        return 'Chat Explicativo - $voiceName';
      case ChatMode.matematica:
        return 'Chat Matemática - $voiceName';
    }
  }

  void _selectChat(int idx) {
    // Verificar se o índice é válido para o modo atual
    final currentChats = _currentChats;
    if (idx < 0 || idx >= currentChats.length) {
      debugPrint(
        '❌ Índice de chat inválido: $idx (total: ${currentChats.length})',
      );
      return;
    }

    setState(() {
      _selectedChat = idx;
      _pendingFile = null;

      // Resetar personagem para Teca ao trocar de chat
      _selectedVoice = 'Teca_v2';

      // ✅ Limpar modo de edição ao trocar de chat
      _editingMessageIndex = null;
    });

    // Limpar mensagens de erro ao trocar de chat
    _removePreviousErrorMessages();
  }

  // Método para criar um novo chat quando o usuário digita a primeira mensagem
  Future<void> _createNewChatFromMessage(String text) async {
    final messenger = ScaffoldMessenger.of(context);

    try {
      final userData = await AuthService.getUserData();
      final userId = userData?['userId'] ?? userData?['id'] ?? 'usuario123';
      final chatTitle = _getChatTitleForMode(_chatMode);

      String chatId;
      String chatTitleResolved = chatTitle;

      if (await AuthService.hasValidApiUser()) {
        final schoolId = userData?['schoolId'] as String?;
        final chatData = await ApiChatService.createChat(
          chatTitle,
          [userId],
          schoolId: schoolId,
        );
        chatId = chatData['id'];
        chatTitleResolved = chatData['title'] ?? chatTitle;
      } else {
        chatId = 'local-${_chatMode.name}';
      }

      setState(() {
        final newChat = Chat(
          id: chatId,
          title: chatTitleResolved,
          messages: [
            ChatMessage(
              text: text,
              isUser: true,
              animated: true,
              personagem: null,
            ),
          ],
          mode: _chatMode,
        );

        _chatsByMode[_chatMode]!.add(newChat);
        _selectedChat = _chatsByMode[_chatMode]!.length - 1;
        _isLoading = true;

        // Resetar personagem para Teca ao criar novo chat
        _selectedVoice = 'Teca_v2';
      });

      _controller.clear();
      _scrollToBottom();

      // Enviar a mensagem para a IA (com streaming já na primeira mensagem)
      try {
        // Garantir que temos um userId válido
        _userId ??= userId;

        // Definir o modo de chat atual antes de enviar
        ChatService.setChatMode(_chatMode);

        debugPrint(
          '🔍 Enviando (stream) primeira mensagem com userId: $_userId',
        );

        // Criar mensagem vazia para streaming da IA
        setState(() {
          _chatsByMode[_chatMode]![_selectedChat].messages.add(
            ChatMessage(
              text: '',
              isUser: false,
              animated: true,
              personagem: _getSelectedVoice(),
              isSaved: false,
            ),
          );
        });
        _scrollToBottom();

        final messageIndex =
            _chatsByMode[_chatMode]![_selectedChat].messages.length - 1;
        _resetStreamSync();

        setState(() {
          _isStreamingActive = true;
        });

        final response = await ChatService.sendMessageWithStreaming(
          text,
          chatId: _chatsByMode[_chatMode]![_selectedChat].id,
          voice: _getSelectedVoice(),
          onChunk: (chunk) => _onStreamChunk(messageIndex, chunk),
          onFinal: (finalText) => _onStreamFinal(messageIndex, finalText),
          onAudio: (_) => _onStreamAudio(messageIndex),
        );

        // Cancelar loading explícito
        setState(() {
          _isLoading = false;
        });

        final audioPaths =
            (response['audioPaths'] as List?)
                ?.map((e) => e.toString())
                .toList() ??
            [];

        await _playVoiceResponseIfNeeded(audioPaths);

        // Exibir erro detalhado em SnackBar se houver erro
        final responseText = (response['text'] as String?) ?? '';
        if (responseText.startsWith('🔌 Erro de conexão:') ||
            responseText.startsWith('❌ Erro ao se comunicar com a IA:')) {
          if (mounted) {
            messenger.showSnackBar(
              SnackBar(
                content: Text(responseText),
                backgroundColor: Colors.red,
                duration: Duration(seconds: 5),
                action: SnackBarAction(
                  label: 'Tentar Novamente',
                  textColor: Colors.white,
                  onPressed: () {
                    // Remover a mensagem de erro e tentar novamente
                    setState(() {
                      // Remover a última mensagem se for de erro
                      if (_chatsByMode[_chatMode]![_selectedChat]
                          .messages
                          .isNotEmpty) {
                        final lastMessage =
                            _chatsByMode[_chatMode]![_selectedChat]
                                .messages
                                .last;
                        if (lastMessage.text.startsWith(
                              '🔌 Erro de conexão:',
                            ) ||
                            lastMessage.text.startsWith(
                              '❌ Erro ao se comunicar com a IA:',
                            )) {
                          _chatsByMode[_chatMode]![_selectedChat].messages
                              .removeLast();
                        }
                      }
                      _isLoading = false;
                    });
                    _sendMessage(text);
                  },
                ),
              ),
            );
          }

          // Salvar mensagem de erro no banco de dados
          if (_userId != null) {
            await ChatService.saveMessage(
              responseText,
              false,
              chatId: _chatsByMode[_chatMode]![_selectedChat].id,
              personagem: _selectedVoice,
            );

            // Marcar a mensagem como salva no banco
            setState(() {
              if (_chatsByMode[_chatMode]![_selectedChat].messages.isNotEmpty) {
                final lastMessage =
                    _chatsByMode[_chatMode]![_selectedChat].messages.last;
                if (lastMessage.text == responseText) {
                  // Criar nova mensagem com flag isSaved = true
                  _chatsByMode[_chatMode]![_selectedChat]
                      .messages[_chatsByMode[_chatMode]![_selectedChat]
                          .messages
                          .length -
                      1] = ChatMessage(
                    text: lastMessage.text,
                    isUser: lastMessage.isUser,
                    animated: lastMessage.animated,
                    personagem: lastMessage.personagem,
                    isSaved: true,
                  );
                }
              }
            });
          }
        }
      } catch (e) {
        debugPrint('❌ Erro ao enviar mensagem para IA: $e');

        // Remover mensagem vazia da Teca se existir
        final currentChats = _currentChats;
        if (currentChats.isNotEmpty &&
            _selectedChat >= 0 &&
            _selectedChat < currentChats.length) {
          final chat = currentChats[_selectedChat];
          if (chat.messages.isNotEmpty) {
            final lastMessage = chat.messages.last;
            // Se a última mensagem é da IA e está vazia, remover
            if (!lastMessage.isUser &&
                lastMessage.text.isEmpty &&
                !lastMessage.isSaved) {
              setState(() {
                chat.messages.removeLast(); // ✅ Remove mensagem vazia
              });
            }
          }
        }

        setState(() {
          _isLoading = false;
          _isStreamingActive = false;
        });

        // Mostrar erro para o usuário
        if (mounted) {
          messenger.showSnackBar(
            SnackBar(
              content: Text('❌ Erro na comunicação: $e'),
              backgroundColor: Colors.red,
              duration: Duration(seconds: 3),
              action: SnackBarAction(
                label: 'Tentar Novamente',
                textColor: Colors.white,
                onPressed: () {
                  _sendMessage(text);
                },
              ),
            ),
          );
        }
      }
    } catch (e) {
      debugPrint('❌ Erro ao criar novo chat: $e');
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(
            content: Text('Erro ao criar chat: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _sendMessage([String? textParam]) async {
    final text = (textParam ?? _controller.text).trim();
    if (text.isEmpty || _isLoading) return;

    final messenger = ScaffoldMessenger.of(context);

    // Verificar se está carregando - se sim, não permitir envio de nova mensagem
    if (_isLoading) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            '⏳ Aguarde o carregamento terminar antes de enviar nova mensagem',
          ),
          backgroundColor: Colors.orange,
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    // ✅ Verificar se estamos editando uma mensagem
    final isEditing = _editingMessageIndex != null;
    if (isEditing) {
      final currentChats = _currentChats;
      final idx = _editingMessageIndex!;
      if (currentChats.isNotEmpty &&
          _selectedChat >= 0 &&
          _selectedChat < currentChats.length &&
          idx >= 0 &&
          idx < currentChats[_selectedChat].messages.length) {
        setState(() {
          // Atualiza o texto da mensagem editada
          currentChats[_selectedChat].messages[idx] = ChatMessage(
            text: text,
            isUser: true,
            animated: true,
            personagem: null,
          );
          // Agora sim remove as respostas posteriores
          if (idx + 1 < currentChats[_selectedChat].messages.length) {
            currentChats[_selectedChat].messages.removeRange(
              idx + 1,
              currentChats[_selectedChat].messages.length,
            );
          }
          _editingMessageIndex = null;
        });
        _controller.clear();
        _scrollToBottom();
      } else {
        _editingMessageIndex = null;
      }
    }

    // Se não há chats no modo atual, criar um novo chat automaticamente
    if (_currentChats.isEmpty) {
      await _createNewChatFromMessage(text);
      return;
    }

    // Verificar se o chat selecionado é válido
    if (_selectedChat < 0 || _selectedChat >= _currentChats.length) {
      debugPrint(
        '❌ Chat selecionado inválido: $_selectedChat (total: ${_currentChats.length})',
      );
      return;
    }

    // ✅ Só adicionar nova mensagem se não estivermos editando
    if (!isEditing) {
      setState(() {
        _chatsByMode[_chatMode]![_selectedChat].messages.add(
          ChatMessage(
            text: text,
            isUser: true,
            animated: true,
            personagem: null,
          ),
        );
        _controller.clear();
        _isLoading = true;
        _loadingStartTime = DateTime.now();
      });
      _scrollToBottom();
    } else {
      // Se estamos editando, apenas marcar como carregando
      setState(() {
        _isLoading = true;
        _loadingStartTime = DateTime.now();
      });
    }

    // Remover mensagens de erro anteriores
    _removePreviousErrorMessages();

    // Timer para atualizar contador de carregamento
    _loadingTimer = Timer.periodic(Duration(seconds: 1), (timer) {
      if (mounted && _isLoading) {
        setState(() {
          // Força rebuild para atualizar contador
        });
      } else {
        timer.cancel();
      }
    });

    try {
      Map<String, dynamic> response;
      if (_pendingFile != null) {
        final userId = _userId ?? 'usuario123';
        String caminho = _pendingFile!.path ?? _pendingFile!.name;
        String caminhoFormatado = caminho.replaceAll('\\', '/');
        String comando = 'upload $caminhoFormatado';
        setState(() {
          _chatsByMode[_chatMode]![_selectedChat].messages.add(
            ChatMessage(
              text: comando,
              isUser: true,
              animated: true,
              personagem: null,
            ),
          );
          _isLoading = true;
        });
        _scrollToBottom();
        await ChatService.saveMessage(
          comando,
          true,
          chatId: _chatsByMode[_chatMode]![_selectedChat].id,
          personagem: null, // Mensagem do usuário não tem personagem
        );
        response = await FileService.uploadFile(_pendingFile!, '', userId);
        _pendingFile = null;
      } else {
        // Garantir que temos um userId válido antes de enviar a mensagem
        if (_userId == null) {
          final userData = await AuthService.getUserData();
          _userId = userData?['userId'] ?? userData?['id'] ?? 'usuario123';
        }

        // Definir o modo de chat atual antes de enviar
        ChatService.setChatMode(_chatMode);

        // Criar mensagem vazia para streaming
        setState(() {
          _chatsByMode[_chatMode]![_selectedChat].messages.add(
            ChatMessage(
              text: '',
              isUser: false,
              animated: true, // Sempre true para evitar animações
              personagem: _selectedVoice,
              isSaved: false, // Inicialmente não salva
            ),
          );
        });
        _scrollToBottom();

        final messageIndex =
            _chatsByMode[_chatMode]![_selectedChat].messages.length - 1;
        _resetStreamSync();

        // Marcar streaming como ativo
        debugPrint('🚀 Iniciando streaming - _isStreamingActive = true');
        setState(() {
          _isStreamingActive = true;
        });

        try {
          response = await ChatService.sendMessageWithStreaming(
            text,
            chatId: _chatsByMode[_chatMode]![_selectedChat].id,
            voice: _getSelectedVoice(),
            onChunk: (chunk) => _onStreamChunk(messageIndex, chunk),
            onFinal: (finalText) => _onStreamFinal(messageIndex, finalText),
            onAudio: (_) => _onStreamAudio(messageIndex),
          );
        } catch (e) {
          // Tratar erro de streaming
          debugPrint('❌ Erro no streaming: $e');

          // Remover mensagem vazia da Teca
          final currentChats = _currentChats;
          if (currentChats.isNotEmpty &&
              _selectedChat >= 0 &&
              _selectedChat < currentChats.length) {
            final chat = currentChats[_selectedChat];
            if (chat.messages.isNotEmpty) {
              final lastMessage = chat.messages.last;
              // Se a última mensagem é da IA e está vazia, remover
              if (!lastMessage.isUser &&
                  lastMessage.text.isEmpty &&
                  !lastMessage.isSaved) {
                setState(() {
                  chat.messages.removeLast();
                });
              }
            }
          }

          // Cancelar streaming
          setState(() {
            _isStreamingActive = false;
            _isLoading = false;
          });

          // Cancelar timers
          _loadingTimer?.cancel();
          _loadingStartTime = null;

          // Mostrar erro para o usuário
          if (mounted) {
            messenger.showSnackBar(
              SnackBar(
                content: Text('❌ Erro na comunicação: $e'),
                backgroundColor: Colors.red,
                duration: Duration(seconds: 5),
                action: SnackBarAction(
                  label: 'Tentar Novamente',
                  textColor: Colors.white,
                  onPressed: () {
                    _sendMessage(text);
                  },
                ),
              ),
            );
          }
          return;
        }

        setState(() {
          _isLoading = false;
        });
      }

      // Cancelar timers
      _loadingTimer?.cancel();
      _loadingStartTime = null; // Resetar tempo de carregamento

      final audioPaths =
          (response['audioPaths'] as List?)
              ?.map((e) => e.toString())
              .toList() ??
          [];

      await _playVoiceResponseIfNeeded(audioPaths);
    } catch (e) {
      debugPrint('❌ Erro no streaming - _isStreamingActive = false');

      // Cancelar timer de timeout
      _loadingTimer?.cancel();
      _loadingStartTime = null; // Resetar tempo de carregamento

      // Remover mensagem vazia da Teca se existir
      final currentChats = _currentChats;
      if (currentChats.isNotEmpty &&
          _selectedChat >= 0 &&
          _selectedChat < currentChats.length) {
        final chat = currentChats[_selectedChat];
        if (chat.messages.isNotEmpty) {
          final lastMessage = chat.messages.last;
          // Se a última mensagem é da IA e está vazia, remover
          if (!lastMessage.isUser &&
              lastMessage.text.isEmpty &&
              !lastMessage.isSaved) {
            setState(() {
              chat.messages.removeLast(); // ✅ Remove mensagem vazia
            });
          }
        }
      }

      setState(() {
        _isLoading = false;
        _isStreamingActive = false; // 🚫 Marcar streaming como inativo
      });

      // Mostrar erro para o usuário
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(
            content: Text('❌ Erro na comunicação: $e'),
            backgroundColor: Colors.red,
            duration: Duration(seconds: 3),
            action: SnackBarAction(
              label: 'Tentar Novamente',
              textColor: Colors.white,
              onPressed: () {
                _sendMessage(text);
              },
            ),
          ),
        );
      }
    }
  }

  void _renameChat(int idx) async {
    final messenger = ScaffoldMessenger.of(context);
    final currentChats = _currentChats;
    if (idx < 0 || idx >= currentChats.length) return;

    String? newName = await showDialog<String>(
      context: context,
      builder:
          (context) => RenameChatDialog(currentTitle: currentChats[idx].title),
    );
    if (newName != null && newName.trim().isNotEmpty) {
      try {
        await ChatService.updateChatTitle(currentChats[idx].id, newName.trim());
        setState(() {
          _chatsByMode[_chatMode]![idx].title = newName.trim();
        });
      } catch (e) {
        if (mounted) {
          messenger.showSnackBar(
            SnackBar(
              content: Text('Erro ao renomear chat: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  void _deleteChat(int idx) async {
    final messenger = ScaffoldMessenger.of(context);
    final currentChats = _currentChats;
    final chatId = currentChats[idx].id;
    try {
      await ApiChatService.deleteChat(
        chatId,
      ); // Chama a API para deletar no backend
      setState(() {
        _chatsByMode[_chatMode]!.removeAt(idx);
        if (_selectedChat >= _chatsByMode[_chatMode]!.length) {
          _selectedChat = _chatsByMode[_chatMode]!.length - 1;
        }
      });
    } catch (e) {
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(
            content: Text('Erro ao deletar chat: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _deleteAllChats() async {
    final messenger = ScaffoldMessenger.of(context);

    final confirmed = await showDialog<bool>(
      context: context,
      builder:
          (context) => ConfirmationDialog(
            title: 'Apagar Todos os Chats',
            content:
                'Tem certeza que deseja apagar todos os chats? Esta ação não pode ser desfeita.',
            confirmText: 'Apagar',
            confirmColor: Colors.red,
            confirmIcon: Icons.delete_forever,
          ),
    );

    if (confirmed == true) {
      // Deletar todos os chats de todos os modos
      for (final mode in ChatMode.values) {
        for (final chat in _chatsByMode[mode]!) {
          await ApiChatService.deleteChat(chat.id);
        }
      }

      setState(() {
        _chatsByMode.clear();
        _chatsByMode.addAll({
          ChatMode.voz: [],
          ChatMode.explicativo: [],
          ChatMode.matematica: [],
        });
        _selectedChat = -1;
      });

      if (mounted) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text('Todos os chats foram apagados.'),
            backgroundColor: Colors.green,
          ),
        );
      }
    }
  }

  void _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder:
          (context) => ConfirmationDialog(
            title: 'Sair',
            content: 'Tem certeza que deseja sair?',
            confirmText: 'Sair',
            confirmColor: Colors.red,
            confirmIcon: Icons.logout,
          ),
    );

    if (confirmed == true) {
      await AuthService.logout();
      if (mounted) {
        Navigator.pushReplacementNamed(context, '/');
      }
    }
  }

  void _setPersonagemTalking(bool talking) {
    // Cancela o timer anterior se existir
    _animationTimer?.cancel();

    // Só anima se estiver no modo voz e for a voz Teca
    if (talking && _chatMode == ChatMode.voz && _selectedVoice == 'Teca_v2') {
      // Inicia o loop de animação
      _animationTimer = Timer.periodic(Duration(milliseconds: 200), (timer) {
        if (mounted &&
            _chatMode == ChatMode.voz &&
            _selectedVoice == 'Teca_v2') {
          setState(() {
            _personagemFrame = _personagemFrame % _totalFrames + 1;
          });
        } else {
          timer.cancel();
        }
      });
    } else {
      // Para a animação e volta ao frame inicial
      setState(() {
        _personagemFrame = 1;
      });
    }
  }

  void _resetStreamSync() {
    _streamBufferedText = '';
    _voiceTextUnlocked = false;
  }

  void _updateStreamingMessage(
    int messageIndex,
    String text, {
    bool endStreaming = false,
  }) {
    if (!mounted) return;
    setState(() {
      _chatsByMode[_chatMode]![_selectedChat].messages[messageIndex] =
          ChatMessage(
        text: text,
        isUser: false,
        animated: true,
        personagem: _getSelectedVoice(),
        isSaved: false,
      );
      if (endStreaming) {
        debugPrint('🏁 Streaming finalizado - _isStreamingActive = false');
        _isStreamingActive = false;
      }
      if (_isLoading) _isLoading = false;
    });
    _scrollToBottom();
  }

  void _onStreamChunk(int messageIndex, String chunk) {
    _streamBufferedText += chunk;

    if (_chatMode == ChatMode.voz && !_voiceTextUnlocked) {
      if (_isLoading && mounted) {
        setState(() => _isLoading = false);
      }
      return;
    }

    _updateStreamingMessage(messageIndex, _streamBufferedText);
  }

  void _onStreamAudio(int messageIndex) {
    if (_chatMode == ChatMode.voz && !_voiceTextUnlocked) {
      _voiceTextUnlocked = true;
      if (_streamBufferedText.isNotEmpty) {
        _updateStreamingMessage(messageIndex, _streamBufferedText);
      }
    }
    unawaited(_handleStreamingAudio());
  }

  void _onStreamFinal(int messageIndex, String finalText) {
    if (finalText.isEmpty) {
      if (mounted) {
        setState(() => _isStreamingActive = false);
      }
      return;
    }

    if (_chatMode == ChatMode.voz && !_voiceTextUnlocked) {
      _voiceTextUnlocked = true;
    }

    _streamBufferedText = finalText;
    _updateStreamingMessage(messageIndex, finalText, endStreaming: true);
  }

  void _onVoicePlaybackComplete() {
    if (!mounted) return;
    _setPersonagemTalking(false);
    setState(() {
      if (_chatsByMode[_chatMode]![_selectedChat].messages.isNotEmpty) {
        _chatsByMode[_chatMode]![_selectedChat].messages.last.animated = true;
      }
    });
  }

  Future<void> _handleStreamingAudio() async {
    if (_chatMode != ChatMode.voz) return;
    if (AudioService.queueLength == 0) {
      debugPrint('⚠️ _handleStreamingAudio: fila vazia');
      return;
    }
    _setPersonagemTalking(true);
    await AudioService.startQueueIfIdle(onComplete: _onVoicePlaybackComplete);
  }

  Future<void> _playVoiceResponseIfNeeded(List<String> audioPaths) async {
    if (_chatMode != ChatMode.voz) return;

    if (AudioService.isQueuePlaying) {
      debugPrint('🎵 Áudio já em reprodução');
      return;
    }

    if (audioPaths.isEmpty && AudioService.queueLength == 0) {
      debugPrint('⚠️ Nenhum áudio recebido do servidor');
      return;
    }

    if (audioPaths.isNotEmpty) {
      AudioService.clearQueue();
      AudioService.addToQueue(audioPaths);
    }

    _setPersonagemTalking(true);
    await AudioService.playQueue(onComplete: _onVoicePlaybackComplete);
  }

  void _removePendingFile() {
    setState(() {
      _pendingFile = null;
    });
  }

  void _handleFileSelected(PlatformFile file) {
    // Salva o arquivo como pendente
    _pendingFile = file;
    // Não adiciona mensagem no chat aqui!
    setState(() {});
    _scrollToBottom();
  }

  @override
  void initState() {
    super.initState();
    AudioService.initialize();
    _loadHistory();
  }

  // Função para remover mensagens de erro anteriores
  void _removePreviousErrorMessages() {
    // Verificar se há chats e se o chat selecionado é válido
    final currentChats = _currentChats;
    if (currentChats.isEmpty ||
        _selectedChat < 0 ||
        _selectedChat >= currentChats.length) {
      return;
    }

    setState(() {
      // Remover mensagens de erro do final da lista
      while (_chatsByMode[_chatMode]![_selectedChat].messages.isNotEmpty) {
        final lastMessage =
            _chatsByMode[_chatMode]![_selectedChat].messages.last;
        if (lastMessage.text.startsWith('🔌 Erro de conexão:') ||
            lastMessage.text.startsWith('❌ Erro ao se comunicar com a IA:')) {
          // Só remover se não foi salva no banco
          if (!lastMessage.isSaved) {
            _chatsByMode[_chatMode]![_selectedChat].messages.removeLast();
          } else {
            break; // Parar se encontrar uma mensagem salva
          }
        } else {
          break; // Parar quando encontrar uma mensagem que não é erro
        }
      }
    });
  }

  @override
  void dispose() {
    // Libera recursos de áudio
    AudioService.dispose();
    _controller.dispose();
    _scrollController.dispose();
    _animationTimer?.cancel(); // Cancela o timer de animação
    _loadingTimer?.cancel(); // Cancela o timer de carregamento

    // Limpar recursos de streaming
    _streamingSubscription?.cancel();
    _streamingSubscription = null;

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final orientation = MediaQuery.of(context).orientation;
    final isPortrait = orientation == Orientation.portrait;

    // Se não há chats no modo atual, mostrar interface estilo ChatGPT
    if (_currentChats.isEmpty) {
      return Scaffold(
        backgroundColor: Color(0xFF0B2233),
        drawer: Drawer(
          child: ChatDrawer(
            chatsByMode: _chatsByMode,
            currentMode: _chatMode,
            selectedChat: _selectedChat,
            selectedVoiceDisplayName: _getSelectedVoiceDisplayName(),
            onAddNewChat: _addNewChat,
            onSelectChat: _selectChat,
            onRenameChat: _renameChat,
            onDeleteChat: _deleteChat,
            onDeleteAllChats: _deleteAllChats,
            onLogout: _logout,
            onModeChanged: _changeChatMode,
          ),
        ),
        body: SafeArea(
          child: Column(
            children: [
              // Header com título e controles
              Container(
                padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: header.ChatHeader(
                  chatMode: _chatMode,
                  selectedVoice: _selectedVoice,
                  availableVoices: _availableVoices,
                  isLoading: _isLoading,
                  isStreamingActive: _isStreamingActive,
                  onVoiceChanged: _changeVoice,
                  onShowVoiceSelectionDialog: _showVoiceSelectionDialog,
                ),
              ),
              // Área central vazia (estilo ChatGPT)
              Expanded(
                child: WelcomeScreen(
                  selectedVoiceDisplayName: _getSelectedVoiceDisplayName(),
                  selectedVoiceImagePath: _getSelectedVoiceImagePath(),
                  mensagensIniciais: _mensagensIniciais,
                ),
              ),
              // Barra de input na parte inferior
              Container(
                padding: EdgeInsets.all(16),
                child: MessageInput(
                  controller: _controller,
                  onSend: (text) => _sendMessage(text),
                  onFileSelected: _handleFileSelected,
                  onRemovePendingFile: _removePendingFile,
                  isLoading: _isLoading,
                  isStreamingActive: _isStreamingActive,
                  onCancelStreaming: _cancelStreaming,
                  hasPendingFile: _pendingFile != null,
                  pendingFileName: _pendingFile?.name,
                  personalityName: _getSelectedVoiceDisplayName(),
                  isEditing: _editingMessageIndex != null,
                  onCancelEdit: _cancelEdit,
                ),
              ),
            ],
          ),
        ),
      );
    }

    // Se há chats, mostrar interface normal
    if (_currentChats.isEmpty ||
        _selectedChat < 0 ||
        _selectedChat >= _currentChats.length) {
      // Se não há chats ou chat selecionado é inválido, mostrar interface vazia
      return Scaffold(
        backgroundColor: Color(0xFF0B2233),
        drawer: Drawer(
          child: ChatDrawer(
            chatsByMode: _chatsByMode,
            currentMode: _chatMode,
            selectedChat: _selectedChat,
            selectedVoiceDisplayName: _getSelectedVoiceDisplayName(),
            onAddNewChat: _addNewChat,
            onSelectChat: _selectChat,
            onRenameChat: _renameChat,
            onDeleteChat: _deleteChat,
            onDeleteAllChats: _deleteAllChats,
            onLogout: _logout,
            onModeChanged: _changeChatMode,
          ),
        ),
        body: SafeArea(
          child: Column(
            children: [
              // Header com título e controles
              Container(
                padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: header.ChatHeader(
                  chatMode: _chatMode,
                  selectedVoice: _selectedVoice,
                  availableVoices: _availableVoices,
                  isLoading: _isLoading,
                  isStreamingActive: _isStreamingActive,
                  onVoiceChanged: _changeVoice,
                  onShowVoiceSelectionDialog: _showVoiceSelectionDialog,
                ),
              ),
              // Conteúdo central
              Expanded(
                child: Center(
                  child: WelcomeCharacter(
                    personagemFrame: _personagemFrame,
                    selectedVoice: _selectedVoice,
                    availableVoices: _availableVoices,
                  ),
                ),
              ),
              // Input de mensagem
              Container(
                padding: EdgeInsets.all(16),
                child: MessageInput(
                  controller: _controller,
                  onSend: _sendMessage,
                  onFileSelected: _handleFileSelected,
                  isLoading: _isLoading,
                  isStreamingActive: _isStreamingActive,
                  onCancelStreaming: _cancelStreaming,
                  isEditing: _editingMessageIndex != null,
                  onCancelEdit: _cancelEdit,
                ),
              ),
            ],
          ),
        ),
      );
    }

    final chat = _currentSelectedChat!;
    return Scaffold(
      backgroundColor: Color(0xFF0B2233),
      drawer: Drawer(
        child: ChatDrawer(
          chatsByMode: _chatsByMode,
          currentMode: _chatMode,
          selectedChat: _selectedChat,
          selectedVoiceDisplayName: _getSelectedVoiceDisplayName(),
          onAddNewChat: _addNewChat,
          onSelectChat: _selectChat,
          onRenameChat: _renameChat,
          onDeleteChat: _deleteChat,
          onDeleteAllChats: _deleteAllChats,
          onLogout: _logout,
          onModeChanged: _changeChatMode,
        ),
      ),
      body: Stack(
        children: [
          Container(color: Color(0xFF0B2233)),
          SafeArea(
            child: Column(
              children: [
                // Botão para abrir o Drawer
                LayoutBuilder(
                  builder: (context, constraints) {
                    return Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      child: header.ChatHeader(
                        chatMode: _chatMode,
                        selectedVoice: _selectedVoice,
                        availableVoices: _availableVoices,
                        isLoading: _isLoading,
                        isStreamingActive: _isStreamingActive,
                        onVoiceChanged: _changeVoice,
                        onShowVoiceSelectionDialog: _showVoiceSelectionDialog,
                      ),
                    );
                  },
                ),
                const SizedBox(height: 16),
                Expanded(child: _buildChatArea(chat, isPortrait)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChatArea(Chat chat, bool isPortrait) {
    // Área central do chat adaptada
    return Column(
      children: [
        const SizedBox(height: 24),
        Expanded(
          child: ListView.builder(
            controller: _scrollController,
            padding: EdgeInsets.symmetric(
              horizontal: isPortrait ? 40 : 80,
              vertical: 16,
            ),
            itemCount: chat.messages.length,
            itemBuilder: (context, idx) {
              final msg = chat.messages[idx];
              // Usar o personagem baseado no modo de chat
              final personagemName =
                  msg.isUser
                      ? "Você"
                      : (_chatMode == ChatMode.explicativo ||
                              _chatMode == ChatMode.matematica
                          ? "Teca" // Sempre Teca nos modos explicativo e matemática
                          : (msg.personagem != null
                              ? _getVoiceDisplayName(msg.personagem!)
                              : _getSelectedVoiceDisplayName()));
              return _chatBubble(
                personagemName,
                msg.text,
                left: !msg.isUser,
                color: msg.isUser ? Colors.blue[200] : Colors.cyan[700],
                isAnimated:
                    !msg.isUser &&
                    idx == chat.messages.lastIndexWhere((m) => !m.isUser),
                showPersonagem: _showPersonagem,
                msgIndex: idx,
                personagem: msg.personagem, // Passar o personagem para o bubble
              );
            },
          ),
        ),
        if (_isLoading)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: LoadingIndicator(
              loadingStartTime: _loadingStartTime,
              color: Colors.cyanAccent,
            ),
          ),
        Padding(
          padding: EdgeInsets.symmetric(
            horizontal: isPortrait ? 40 : 80,
            vertical: 8,
          ),
          child: MessageInput(
            controller: _controller,
            onSend: (text) => _sendMessage(text),
            onFileSelected: _handleFileSelected,
            onRemovePendingFile: _removePendingFile,
            isLoading: _isLoading,
            isStreamingActive: _isStreamingActive,
            onCancelStreaming: _cancelStreaming,
            hasPendingFile: _pendingFile != null,
            pendingFileName: _pendingFile?.name,
            personalityName: _getSelectedVoiceDisplayName(),
            isEditing: _editingMessageIndex != null,
            onCancelEdit: _cancelEdit,
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _chatBubble(
    String sender,
    String text, {
    bool left = true,
    Color? color,
    bool isAnimated = false,
    bool showPersonagem = true,
    int? msgIndex,
    String? personagem,
  }) {
    // Processar texto usando o método auxiliar unificado
    final formattedText = text;

    return ChatBubble(
      sender: sender,
      text: formattedText,
      left: left,
      color: color,
      isAnimated: isAnimated,
      showPersonagem: showPersonagem,
      msgIndex: msgIndex,
      personagem: personagem,
      personagemFrame: _personagemFrame,
      selectedVoice: _selectedVoice,
      availableVoices: _availableVoices,
      onEditMessage: _editMessage,
      onCopyToClipboard: _copyToClipboard,
      chatMode: _chatMode,
    );
  }

  // Função para copiar texto para a área de transferência

  // Função para copiar texto para a área de transferência
  void _copyToClipboard(String text) {
    final messenger = ScaffoldMessenger.of(context);
    // Remove formatação Markdown para texto limpo
    final cleanText = _removeMarkdownFormatting(text);

    Clipboard.setData(ClipboardData(text: cleanText)).then((_) {
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(
            content: Text('Texto copiado para a área de transferência!'),
            backgroundColor: Colors.cyan,
            duration: Duration(seconds: 2),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
      }
    });
  }

  // Função para remover formatação Markdown
  String _removeMarkdownFormatting(String markdownText) {
    String cleanText = markdownText;

    // Remove cabeçalhos
    cleanText = cleanText.replaceAll(
      RegExp(r'^#{1,6}\s+', multiLine: true),
      '',
    );

    // Remove negrito
    cleanText = cleanText.replaceAll(RegExp(r'\*\*(.*?)\*\*'), r'$1');

    // Remove itálico
    cleanText = cleanText.replaceAll(RegExp(r'\*(.*?)\*'), r'$1');

    // Remove código inline
    cleanText = cleanText.replaceAll(RegExp(r'`(.*?)`'), r'$1');

    // Remove blocos de código
    cleanText = cleanText.replaceAll(
      RegExp(r'```[\s\S]*?```', multiLine: true),
      '',
    );

    // Remove links
    cleanText = cleanText.replaceAll(RegExp(r'\[([^\]]*)\]\([^)]*\)'), r'$1');

    // Remove listas
    cleanText = cleanText.replaceAll(
      RegExp(r'^[\s]*[-*+]\s+', multiLine: true),
      '• ',
    );

    // Remove listas numeradas
    cleanText = cleanText.replaceAll(
      RegExp(r'^[\s]*\d+\.\s+', multiLine: true),
      '',
    );

    // Remove linhas em branco extras
    cleanText = cleanText.replaceAll(RegExp(r'\n\s*\n'), '\n\n');

    // Remove espaços no início e fim
    cleanText = cleanText.trim();

    return cleanText;
  }
}

// Novo widget para animar Markdown
class MessageTypingMarkdownAnimation extends StatefulWidget {
  final String text;
  final Duration speed;
  final void Function(bool)? onTick;
  final VoidCallback? onFinish;
  final ChatMode? chatMode;
  const MessageTypingMarkdownAnimation({
    super.key,
    required this.text,
    this.speed = const Duration(milliseconds: 25),
    this.onTick,
    this.onFinish,
    this.chatMode,
  });

  @override
  State<MessageTypingMarkdownAnimation> createState() =>
      _MessageTypingMarkdownAnimationState();
}

class _MessageTypingMarkdownAnimationState
    extends State<MessageTypingMarkdownAnimation> {
  String _displayed = '';
  int _index = 0;
  @override
  void initState() {
    super.initState();
    _startTyping();
  }

  void _startTyping() async {
    while (_index < widget.text.length) {
      await Future.delayed(widget.speed);
      if (!mounted) return;
      setState(() {
        _index++;
        _displayed = widget.text.substring(0, _index);
      });
      if (widget.onTick != null) {
        widget.onTick!(true);
      }
    }
    if (widget.onTick != null) {
      widget.onTick!(false);
    }
    if (widget.onFinish != null) {
      widget.onFinish!();
    }
  }

  @override
  Widget build(BuildContext context) {
    // Usar SmartTextRenderer para renderização inteligente
    return SmartTextRenderer(
      text: _displayed,
      textStyle: TextStyle(color: Colors.white),
      chatMode: widget.chatMode,
    );
  }
}
