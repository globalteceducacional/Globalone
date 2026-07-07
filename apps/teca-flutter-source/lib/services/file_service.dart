import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';

import 'ia_socket_client.dart';

/// Upload de arquivos via protocolo do [Cliente/cliente.py].
class FileService {
  static Future<Map<String, dynamic>> comandoUpload(
    PlatformFile file,
    String message,
  ) async {
    try {
      if (file.bytes == null && file.path == null) {
        return {
          'success': false,
          'error': 'Arquivo não existe ou não pode ser lido',
        };
      }

      List<int> fileBytes;
      if (file.bytes != null) {
        fileBytes = file.bytes!;
      } else if (file.path != null) {
        fileBytes = await File(file.path!).readAsBytes();
      } else {
        return {
          'success': false,
          'error': 'Não foi possível ler os bytes do arquivo',
        };
      }

      final dataB64 = base64Encode(fileBytes);
      final param = {'filename': file.name, 'filedata': dataB64};

      final resposta = await IaSocketClient.comandoUpload(param);
      final responseData = _processarResposta(resposta);

      return {
        'success': true,
        'text': responseData['text'] ?? 'Arquivo processado com sucesso',
        'audioPaths': responseData['audioPaths'] ?? <String>[],
      };
    } catch (e) {
      return {'success': false, 'error': 'Erro ao enviar arquivo: $e'};
    }
  }

  static Map<String, dynamic> _processarResposta(String resposta) {
    try {
      final jsonData = json.decode(resposta);
      return {
        'text': jsonData['text'] ?? resposta,
        'audioPaths': jsonData['audioPaths'] ?? <String>[],
      };
    } catch (e) {
      return {'text': resposta, 'audioPaths': <String>[]};
    }
  }

  static Map<String, dynamic> validateFile(PlatformFile file) {
    final extension = file.extension?.toLowerCase();
    if (extension != 'pdf' && extension != 'txt') {
      return {
        'valid': false,
        'error': 'Tipo de arquivo não suportado. Apenas PDF e TXT são aceitos.',
      };
    }

    const maxSizeInBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeInBytes) {
      final sizeInMB = (file.size / (1024 * 1024)).toStringAsFixed(2);
      return {
        'valid': false,
        'error': 'Arquivo muito grande: $sizeInMB MB. Tamanho máximo: 10 MB',
      };
    }

    if (file.bytes == null || file.bytes!.isEmpty) {
      return {'valid': false, 'error': 'Arquivo vazio ou corrompido'};
    }

    return {'valid': true};
  }

  static String formatFileSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} MB';
  }

  static Future<Map<String, dynamic>> uploadFile(
    PlatformFile file,
    String message,
    String userId,
  ) async {
    return comandoUpload(file, message);
  }

  static Future<String> uploadFileViaSocket(
    PlatformFile file,
    String clientId,
  ) async {
    final result = await comandoUpload(file, '');
    if (result['success']) {
      return result['text'] ?? 'Arquivo enviado com sucesso';
    } else {
      return result['error'] ?? 'Erro ao enviar arquivo';
    }
  }
}
