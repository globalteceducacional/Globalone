import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Configurações carregadas do arquivo `.env` na raiz do projeto teca.
class EnvConfig {
  EnvConfig._();

  static String _require(String key) {
    final value = dotenv.env[key]?.trim();
    if (value == null || value.isEmpty) {
      throw StateError(
        'Variável de ambiente "$key" não definida. '
        'Copie .env.example para .env e preencha os valores.',
      );
    }
    return value;
  }

  static int _requireInt(String key) {
    final raw = _require(key);
    final parsed = int.tryParse(raw);
    if (parsed == null) {
      throw StateError('Variável "$key" deve ser um número inteiro válido.');
    }
    return parsed;
  }

  static String get apiBaseUrl => _require('API_BASE_URL');

  static String get iaServerHost => _require('IA_SERVER_HOST');

  static int get iaServerPort => _requireInt('IA_SERVER_PORT');

  static String get iaDefaultVoice =>
      dotenv.env['IA_DEFAULT_VOICE']?.trim().isNotEmpty == true
          ? dotenv.env['IA_DEFAULT_VOICE']!.trim()
          : 'Teca_v2';

  static String get geminiApiKey => _require('GEMINI_API_KEY');

  static String get geminiModel =>
      dotenv.env['GEMINI_MODEL']?.trim().isNotEmpty == true
          ? dotenv.env['GEMINI_MODEL']!.trim()
          : 'gemini-2.0-flash';

  static String get geminiEndpoint =>
      'https://generativelanguage.googleapis.com/v1beta/models/'
      '$geminiModel:generateContent?key=$geminiApiKey';
}
