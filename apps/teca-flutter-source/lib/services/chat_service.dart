import 'package:flutter/foundation.dart';

import '../config/env_config.dart';
import 'api_chat_service.dart';
import 'audio_service.dart';
import 'auth_service.dart';
import 'ia_socket_client.dart';

enum ChatMode {
  voz,
  explicativo,
  matematica,
}

class ChatService {
  static ChatMode chatMode = ChatMode.voz;

  static void setChatMode(ChatMode mode) {
    chatMode = mode;
  }

  static bool isLocalChat(String chatId) {
    return chatId == 'local' ||
        chatId == 'pending' ||
        chatId.startsWith('local-');
  }

  static String _funcaoForMode(ChatMode mode) {
    switch (mode) {
      case ChatMode.voz:
        return 'responda';
      case ChatMode.explicativo:
        return 'responda_explicativo';
      case ChatMode.matematica:
        return 'responda_matematica';
    }
  }

  static String _resolveResponseText(
    IaStreamResult result,
    StringBuffer streamedBuffer,
  ) {
    if (result.finalText.isNotEmpty) return result.finalText;
    return streamedBuffer.toString();
  }

  static Future<String> _getOrCreateIAChat() async {
    try {
      final userData = await AuthService.getUserData();
      if (userData == null) {
        throw Exception('Usuário não autenticado');
      }

      final chats = await ApiChatService.getUserChats();

      for (final chat in chats) {
        if (chat['title'].toLowerCase().contains('teca ia') ||
            chat['title'].toLowerCase().contains('chat ia')) {
          return chat['id'];
        }
      }

      final userId = userData['userId'] ?? userData['id'];
      final schoolId = userData['schoolId'] as String?;
      final chatData = await ApiChatService.createChat(
        'Chat Teca IA',
        [userId],
        schoolId: schoolId,
      );

      return chatData['id'];
    } catch (e) {
      throw Exception('Erro ao obter/criar chat da IA: $e');
    }
  }

  static String _resolveServerVoice(String? voice) {
    final v = (voice ?? EnvConfig.iaDefaultVoice).trim();
    if (v.isEmpty) return EnvConfig.iaDefaultVoice;

    const aliases = <String, String>{
      'Teca': 'Teca_v2',
      'teca': 'Teca_v2',
    };
    return aliases[v] ?? v;
  }

  /// Envia mensagem com streaming via [IaSocketClient].
  static Future<Map<String, dynamic>> sendMessageWithStreaming(
    String prompt, {
    required String chatId,
    String userId = 'usuario123',
    String? voice,
    void Function(String)? onChunk,
    void Function(String)? onFinal,
    void Function(String)? onAudio,
  }) async {
    final selectedVoice = _resolveServerVoice(voice);
    final funcao = _funcaoForMode(chatMode);
    final streamedBuffer = StringBuffer();

    if (chatMode == ChatMode.voz) {
      AudioService.clearQueue();
    }

    try {
      final result = await IaSocketClient.comandoFuncao(
        funcao,
        prompt,
        voice: chatMode == ChatMode.voz ? selectedVoice : null,
        onChunk: (chunk) {
          streamedBuffer.write(chunk);
          onChunk?.call(chunk);
        },
        onAudio: (audioPath) {
          debugPrint('ChatService: áudio recebido ($audioPath)');
          AudioService.enqueueAudio(audioPath);
          onAudio?.call(audioPath);
        },
      );

      debugPrint(
        'ChatService: streaming concluído — ${result.audioPaths.length} áudio(s)',
      );

      final finalText = _resolveResponseText(result, streamedBuffer);
      onFinal?.call(finalText);

      if (finalText.isEmpty) {
        throw Exception(
          'Servidor não enviou resposta. Verifique se a IA está ativa.',
        );
      }

      if (!isLocalChat(chatId)) {
        final userData = await AuthService.getUserData();
        final realUserId = userData?['userId'] ?? userData?['id'] ?? userId;

        await ApiChatService.sendTextMessage(
          chatId,
          prompt,
          userId: realUserId,
          isAI: false,
        );
        await ApiChatService.sendTextMessage(
          chatId,
          finalText,
          isAI: true,
          personagem: selectedVoice,
        );
      }

      return {
        'text': finalText,
        'audioPaths': result.audioPaths,
        'audioPath':
            result.audioPaths.isNotEmpty ? result.audioPaths.first : null,
      };
    } catch (e) {
      final host = EnvConfig.iaServerHost;
      final port = EnvConfig.iaServerPort;
      debugPrint('❌ Erro IA ($host:$port): $e');
      return {
        'text':
            'Erro ao se comunicar com a IA ($host:$port): $e\n\n'
            'A IA roda na rede local — confirme que o servidor Teca está ativo '
            'e que este dispositivo está na mesma rede Wi‑Fi.',
        'audioPaths': <String>[],
        'audioPath': null,
        'error': 'connection',
      };
    }
  }

  static Future<Map<String, dynamic>> sendMessage(
    String prompt, {
    required String chatId,
    String userId = 'usuario123',
    String? voice,
  }) {
    return sendMessageWithStreaming(
      prompt,
      chatId: chatId,
      userId: userId,
      voice: voice,
    );
  }

  static Future<List<Map<String, dynamic>>> loadChatHistory() async {
    try {
      final chatId = await _getOrCreateIAChat();
      return await ApiChatService.getChatMessages(chatId);
    } catch (e) {
      return [];
    }
  }

  static Future<void> saveMessage(
    String content,
    bool isUser, {
    required String chatId,
    String? personagem,
  }) async {
    if (isLocalChat(chatId)) return;

    try {
      String? userId;
      if (isUser) {
        final userData = await AuthService.getUserData();
        userId = userData?['userId'] ?? userData?['id'];
      }

      await ApiChatService.sendTextMessage(
        chatId,
        content,
        userId: userId,
        isAI: !isUser,
        personagem: personagem,
      );
    } catch (e) {
      debugPrint('Erro ao salvar mensagem: $e');
    }
  }

  static Future<void> updateChatTitle(String chatId, String newTitle) async {
    if (isLocalChat(chatId)) return;
    await ApiChatService.updateChatTitle(chatId, newTitle);
  }
}
