import 'dart:convert';
import 'dart:developer' as developer;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/env_config.dart';

class AuthService {
  static String get baseUrl => EnvConfig.apiBaseUrl;
  static const String tokenKey = 'auth_token';
  static const String userKey = 'user_data';

  // Login usando a nova API de autenticação
  static Future<Map<String, dynamic>> login(
    String email,
    String password,
  ) async {
    developer.log('🔐 Iniciando login para email: $email', name: 'AuthService');

    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'email': email, 'password': password}),
      );

      developer.log(
        '🔐 Resposta login - Status: ${response.statusCode}',
        name: 'AuthService',
      );
      developer.log(
        '🔐 Resposta login - Body: ${response.body}',
        name: 'AuthService',
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body) as Map<String, dynamic>;
        final token = data['token'] as String?;
        final userData = _buildUserData(data);

        if (token == null || token.isEmpty) {
          return {
            'success': false,
            'error': 'Token não retornado pela API',
          };
        }

        if (userData == null) {
          developer.log(
            '❌ Role não reconhecido: ${data['role']}',
            name: 'AuthService',
          );
          return {'success': false, 'error': 'Tipo de usuário não suportado'};
        }

        developer.log(
          '✅ Login bem-sucedido: ${userData['name']}',
          name: 'AuthService',
        );

        await _saveAuthData(token, userData);
        return {
          'success': true,
          'data': {'user': userData},
        };
      } else {
        final error = json.decode(response.body);
        developer.log(
          '❌ Erro no login: ${error['error']}',
          name: 'AuthService',
        );
        return {'success': false, 'error': error['error'] ?? 'Erro no login'};
      }
    } catch (e) {
      developer.log('💥 Erro de conexão: $e', name: 'AuthService');
      return {'success': false, 'error': 'Erro de conexão: $e'};
    }
  }

  // Registro de estudante usando a nova API
  static Future<Map<String, dynamic>> registerStudent(
    String name,
    String email,
    String password,
  ) async {
    developer.log(
      '📝 Registrando estudante: $name ($email)',
      name: 'AuthService',
    );

    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/register'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'name': name,
          'email': email,
          'password': password,
          'role': 'STUDENT',
        }),
      );

      developer.log(
        '📝 Resposta registro estudante - Status: ${response.statusCode}',
        name: 'AuthService',
      );
      developer.log(
        '📝 Resposta registro estudante - Body: ${response.body}',
        name: 'AuthService',
      );

      if (response.statusCode == 201) {
        final data = json.decode(response.body);
        developer.log(
          '✅ Estudante registrado com sucesso: ${data['student']?['id']}',
          name: 'AuthService',
        );
        return {'success': true, 'data': data};
      } else {
        final error = json.decode(response.body);
        developer.log(
          '❌ Erro ao registrar estudante: ${error['error']}',
          name: 'AuthService',
        );
        return {
          'success': false,
          'error': error['error'] ?? 'Erro ao registrar estudante',
        };
      }
    } catch (e) {
      developer.log(
        '💥 Erro de conexão ao registrar estudante: $e',
        name: 'AuthService',
      );
      return {'success': false, 'error': 'Erro de conexão: $e'};
    }
  }

  // Registro de professor usando a nova API
  static Future<Map<String, dynamic>> registerTeacher(
    String name,
    String email,
    String password,
  ) async {
    developer.log(
      '📝 Registrando professor: $name ($email)',
      name: 'AuthService',
    );

    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/register'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'name': name,
          'email': email,
          'password': password,
          'role': 'TEACHER',
        }),
      );

      developer.log(
        '📝 Resposta registro professor - Status: ${response.statusCode}',
        name: 'AuthService',
      );
      developer.log(
        '📝 Resposta registro professor - Body: ${response.body}',
        name: 'AuthService',
      );

      if (response.statusCode == 201) {
        final data = json.decode(response.body);
        developer.log(
          '✅ Professor registrado com sucesso: ${data['teacher']?['id']}',
          name: 'AuthService',
        );
        return {'success': true, 'data': data};
      } else {
        final error = json.decode(response.body);
        developer.log(
          '❌ Erro ao registrar professor: ${error['error']}',
          name: 'AuthService',
        );
        return {
          'success': false,
          'error': error['error'] ?? 'Erro ao registrar professor',
        };
      }
    } catch (e) {
      developer.log(
        '💥 Erro de conexão ao registrar professor: $e',
        name: 'AuthService',
      );
      return {'success': false, 'error': 'Erro de conexão: $e'};
    }
  }

  // Registro de admin usando a nova API
  static Future<Map<String, dynamic>> registerAdmin(
    String name,
    String email,
    String password,
  ) async {
    developer.log('📝 Registrando admin: $name ($email)', name: 'AuthService');

    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/register'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'name': name,
          'email': email,
          'password': password,
          'role': 'ADMIN',
        }),
      );

      developer.log(
        '📝 Resposta registro admin - Status: ${response.statusCode}',
        name: 'AuthService',
      );
      developer.log(
        '📝 Resposta registro admin - Body: ${response.body}',
        name: 'AuthService',
      );

      if (response.statusCode == 201) {
        final data = json.decode(response.body);
        developer.log(
          '✅ Admin registrado com sucesso: ${data['id']}',
          name: 'AuthService',
        );
        return {'success': true, 'data': data};
      } else {
        final error = json.decode(response.body);
        developer.log(
          '❌ Erro ao registrar admin: ${error['error']}',
          name: 'AuthService',
        );
        return {
          'success': false,
          'error': error['error'] ?? 'Erro ao registrar admin',
        };
      }
    } catch (e) {
      developer.log(
        '💥 Erro de conexão ao registrar admin: $e',
        name: 'AuthService',
      );
      return {'success': false, 'error': 'Erro de conexão: $e'};
    }
  }

  // Verificar se está logado
  static Future<bool> isLoggedIn() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(tokenKey);
    developer.log(
      '🔍 Verificando login - Token: ${token != null ? "Presente" : "Ausente"}',
      name: 'AuthService',
    );
    return token != null;
  }

  // Obter dados do usuário
  static Future<Map<String, dynamic>?> getUserData() async {
    final prefs = await SharedPreferences.getInstance();
    final userData = prefs.getString(userKey);
    if (userData != null) {
      final data = json.decode(userData);
      developer.log(
        '👤 Dados do usuário carregados: ${data['name']} (${data['role']})',
        name: 'AuthService',
      );
      return data;
    }
    developer.log('❌ Nenhum dado de usuário encontrado', name: 'AuthService');
    return null;
  }

  // Obter token
  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(tokenKey);
    developer.log(
      '🔑 Token obtido: ${token != null ? "Presente" : "Ausente"}',
      name: 'AuthService',
    );
    return token;
  }

  // Verificar token no servidor
  static Future<Map<String, dynamic>> verifyToken() async {
    developer.log('🔍 Verificando token...', name: 'AuthService');

    try {
      final token = await getToken();
      if (token == null) {
        developer.log('❌ Token não encontrado', name: 'AuthService');
        return {'success': false, 'error': 'Token não encontrado'};
      }

      if (_isLegacyLocalToken(token)) {
        developer.log('✅ Token local válido', name: 'AuthService');
        return {
          'success': true,
          'data': {'valid': true},
        };
      }

      if (!_isJwtValid(token)) {
        developer.log('❌ JWT expirado ou inválido', name: 'AuthService');
        return {'success': false, 'error': 'Token expirado ou inválido'};
      }

      developer.log('✅ JWT válido', name: 'AuthService');
      return {
        'success': true,
        'data': {'valid': true},
      };
    } catch (e) {
      developer.log('💥 Erro ao verificar token: $e', name: 'AuthService');
      return {'success': false, 'error': 'Erro de conexão: $e'};
    }
  }

  // Logout
  static Future<void> logout() async {
    developer.log('🚪 Fazendo logout...', name: 'AuthService');
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(tokenKey);
    await prefs.remove(userKey);
    developer.log('✅ Logout concluído', name: 'AuthService');
  }

  // Salvar dados de autenticação
  static Future<void> _saveAuthData(
    String token,
    Map<String, dynamic> user,
  ) async {
    developer.log(
      '💾 Salvando dados de autenticação para: ${user['name']}',
      name: 'AuthService',
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(tokenKey, token);
    await prefs.setString(userKey, json.encode(user));
    developer.log('✅ Dados de autenticação salvos', name: 'AuthService');
  }

  // Métodos de compatibilidade (mantidos para não quebrar código existente)
  static Future<Map<String, dynamic>> loginStudent(
    String email,
    String password,
  ) async {
    developer.log(
      '📚 Login específico de estudante: $email',
      name: 'AuthService',
    );
    return login(email, password);
  }

  static Future<Map<String, dynamic>> loginTeacher(
    String email,
    String password,
  ) async {
    developer.log(
      '👨‍🏫 Login específico de professor: $email',
      name: 'AuthService',
    );
    return login(email, password);
  }

  static Future<bool> hasValidApiUser() async {
    final userData = await getUserData();
    if (userData == null) return false;

    final userId = userData['userId'] ?? userData['id'];
    if (userId == null || userId == 'admin_hidden') return false;

    final token = await getToken();
    if (token == null || _isLegacyLocalToken(token)) return false;

    return true;
  }

  // Método para ativar modo administrador (função escondida)
  static Future<void> activateAdminMode() async {
    developer.log('🔑 Ativando modo administrador...', name: 'AuthService');

    final userData = {
      'id': 'admin_hidden',
      'name': 'Administrador',
      'email': 'admin@teca.local',
      'role': 'admin',
    };

    final token = 'hidden_admin_token_${DateTime.now().millisecondsSinceEpoch}';

    await _saveAuthData(token, userData);
    developer.log(
      '✅ Modo administrador ativado com sucesso',
      name: 'AuthService',
    );
  }

  static Map<String, dynamic>? _buildUserData(Map<String, dynamic> data) {
    final role = data['role'] as String?;
    final userId = data['id'] as String?;

    if (userId == null) return null;

    switch (role) {
      case 'STUDENT':
        final student = data['student'] as Map<String, dynamic>?;
        if (student == null) return null;
        return {
          'id': student['id'],
          'userId': userId,
          'name': student['name'],
          'email': data['email'],
          'role': 'student',
          'registrationNumber': student['registrationNumber'],
          'schoolId': data['schoolId'],
        };
      case 'TEACHER':
        final teacher = data['teacher'] as Map<String, dynamic>?;
        if (teacher == null) return null;
        return {
          'id': teacher['id'],
          'userId': userId,
          'name': teacher['name'],
          'email': data['email'],
          'role': 'teacher',
          'schoolId': data['schoolId'],
        };
      case 'ADMIN':
      case 'DEVELOPER':
        return {
          'id': userId,
          'userId': userId,
          'name':
              data['teacher']?['name'] ??
              data['student']?['name'] ??
              'Administrador',
          'email': data['email'],
          'role': role!.toLowerCase(),
          'schoolId': data['schoolId'],
        };
      default:
        return null;
    }
  }

  static bool _isLegacyLocalToken(String token) {
    return token.startsWith('hidden_admin_token_') ||
        token.startsWith('student_token_') ||
        token.startsWith('teacher_token_') ||
        token.startsWith('admin_token_');
  }

  static bool _isJwtValid(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return false;

      var payload = parts[1];
      final mod = payload.length % 4;
      if (mod > 0) {
        payload += '=' * (4 - mod);
      }

      final decoded = json.decode(utf8.decode(base64Url.decode(payload)));
      final exp = decoded['exp'];
      if (exp is int) {
        final expiresAt = DateTime.fromMillisecondsSinceEpoch(exp * 1000);
        return DateTime.now().isBefore(expiresAt);
      }
      return true;
    } catch (_) {
      return false;
    }
  }
}
