import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/env_config.dart';

class ApiChatService {
  static String get baseUrl => EnvConfig.apiBaseUrl;

  static Future<Map<String, String>> _headers() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (token != null && token.contains('.')) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  // Obter dados do usuário
  static Future<Map<String, dynamic>?> _getUserData() async {
    final prefs = await SharedPreferences.getInstance();
    final userDataString = prefs.getString('user_data');
    if (userDataString != null) {
      return json.decode(userDataString);
    }
    return null;
  }

  // Listar todos os chats do usuário
  static Future<List<Map<String, dynamic>>> getUserChats() async {
    try {
      final userData = await _getUserData();
      if (userData == null) {
        throw Exception('Usuário não autenticado');
      }

      final userId = userData['userId'];
      final headers = await _headers();
      final response = await http.get(
        Uri.parse('$baseUrl/chats/user/$userId'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final List<dynamic> chats = json.decode(response.body);
        return chats.cast<Map<String, dynamic>>();
      } else {
        throw Exception('Erro ao buscar chats: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar chats: $e');
    }
  }

  // Buscar chat por ID
  static Future<Map<String, dynamic>> getChatById(String chatId) async {
    try {
      final headers = await _headers();
      final response = await http.get(
        Uri.parse('$baseUrl/chats/$chatId'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        throw Exception('Erro ao buscar chat: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar chat: $e');
    }
  }

  // Criar novo chat
  static Future<Map<String, dynamic>> createChat(
    String title,
    List<String> participants, {
    String? schoolId,
  }) async {
    try {
      final userData = await _getUserData();
      final resolvedSchoolId =
          schoolId ?? userData?['schoolId'] as String?;

      final headers = await _headers();
      final body = <String, dynamic>{
        'title': title,
        'participants': participants,
      };
      if (resolvedSchoolId != null) {
        body['schoolId'] = resolvedSchoolId;
      }

      final response = await http.post(
        Uri.parse('$baseUrl/chats'),
        headers: headers,
        body: json.encode(body),
      );

      if (response.statusCode == 201) {
        return json.decode(response.body);
      } else {
        final error = json.decode(response.body);
        throw Exception(error['error'] ?? 'Erro ao criar chat');
      }
    } catch (e) {
      throw Exception('Erro ao criar chat: $e');
    }
  }

  // Enviar mensagem de texto
  static Future<Map<String, dynamic>> sendTextMessage(
    String chatId,
    String content, {
    String? userId,
    bool isAI = false,
    String? personagem,
  }) async {
    try {
      final userData = await _getUserData();
      final realUserId = userId ?? userData?['userId'];
      final headers = await _headers();

      final body = <String, dynamic>{
        'content': content,
        'isAI': isAI,
      };
      if (!isAI) {
        body['userId'] = realUserId;
      }
      if (isAI) {
        body['personagem'] = personagem ?? 'Teca';
      }

      final response = await http.post(
        Uri.parse('$baseUrl/chats/$chatId/messages'),
        headers: headers,
        body: json.encode(body),
      );
      if (response.statusCode == 201) {
        return json.decode(response.body);
      } else {
        final error = json.decode(response.body);
        throw Exception(error['error'] ?? 'Erro ao enviar mensagem');
      }
    } catch (e) {
      throw Exception('Erro ao enviar mensagem: $e');
    }
  }

  // Enviar mensagem com arquivo
  static Future<Map<String, dynamic>> sendFileMessage(
    String chatId,
    String content,
    File file,
  ) async {
    try {
      final userData = await _getUserData();
      if (userData == null) {
        throw Exception('Usuário não autenticado');
      }

      final userId = userData['userId'];

      // Criar request multipart
      var request = http.MultipartRequest(
        'POST',
        Uri.parse('$baseUrl/chats/$chatId/messages'),
      );

      // Adicionar campos
      request.fields['content'] = content;
      request.fields['userId'] = userId;

      // Adicionar arquivo
      request.files.add(
        await http.MultipartFile.fromPath(
          'file',
          file.path,
          filename: file.path.split('/').last,
        ),
      );

      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 201) {
        return json.decode(response.body);
      } else {
        final error = json.decode(response.body);
        throw Exception(error['error'] ?? 'Erro ao enviar arquivo');
      }
    } catch (e) {
      throw Exception('Erro ao enviar arquivo: $e');
    }
  }

  // Listar mensagens de um chat
  static Future<List<Map<String, dynamic>>> getChatMessages(
    String chatId,
  ) async {
    try {
      final headers = await _headers();
      final response = await http.get(
        Uri.parse('$baseUrl/chats/$chatId/messages'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final List<dynamic> messages = json.decode(response.body);
        return messages.cast<Map<String, dynamic>>();
      } else {
        throw Exception('Erro ao buscar mensagens: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar mensagens: $e');
    }
  }

  // Adicionar participante ao chat
  static Future<Map<String, dynamic>> addParticipant(
    String chatId,
    String userId,
  ) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/chats/$chatId/participants'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'userId': userId}),
      );

      if (response.statusCode == 201) {
        return json.decode(response.body);
      } else {
        final error = json.decode(response.body);
        throw Exception(error['error'] ?? 'Erro ao adicionar participante');
      }
    } catch (e) {
      throw Exception('Erro ao adicionar participante: $e');
    }
  }

  // Remover participante do chat
  static Future<void> removeParticipant(String chatId, String userId) async {
    try {
      final response = await http.delete(
        Uri.parse('$baseUrl/chats/$chatId/participants/$userId'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode != 200) {
        final error = json.decode(response.body);
        throw Exception(error['error'] ?? 'Erro ao remover participante');
      }
    } catch (e) {
      throw Exception('Erro ao remover participante: $e');
    }
  }

  // Atualizar mensagem
  static Future<Map<String, dynamic>> updateMessage(
    String chatId,
    String messageId,
    String content,
  ) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/chats/$chatId/messages/$messageId'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'content': content}),
      );

      if (response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        final error = json.decode(response.body);
        throw Exception(error['error'] ?? 'Erro ao atualizar mensagem');
      }
    } catch (e) {
      throw Exception('Erro ao atualizar mensagem: $e');
    }
  }

  // Deletar mensagem
  static Future<void> deleteMessage(String chatId, String messageId) async {
    try {
      final response = await http.delete(
        Uri.parse('$baseUrl/chats/$chatId/messages/$messageId'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode != 200) {
        final error = json.decode(response.body);
        throw Exception(error['error'] ?? 'Erro ao deletar mensagem');
      }
    } catch (e) {
      throw Exception('Erro ao deletar mensagem: $e');
    }
  }

  // Deletar chat
  static Future<void> deleteChat(String chatId) async {
    try {
      final response = await http.delete(
        Uri.parse('$baseUrl/chats/$chatId'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode != 200) {
        final error = json.decode(response.body);
        throw Exception(error['error'] ?? 'Erro ao deletar chat');
      }
    } catch (e) {
      throw Exception('Erro ao deletar chat: $e');
    }
  }

  // Atualizar título do chat
  static Future<void> updateChatTitle(String chatId, String newTitle) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/chats/$chatId'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'title': newTitle}),
      );
      if (response.statusCode != 200) {
        final error = json.decode(response.body);
        throw Exception(error['error'] ?? 'Erro ao atualizar título do chat');
      }
    } catch (e) {
      throw Exception('Erro ao atualizar título do chat: $e');
    }
  }
}
