import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import '../services/file_service.dart';

/// Exemplo de como usar o novo sistema de upload baseado no cliente Python
class FileUploadExample {
  /// Exemplo básico de upload de arquivo
  static Future<void> exemploUploadBasico() async {
    try {
      // 1. Selecionar arquivo
      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'txt'],
      );

      if (result != null) {
        PlatformFile file = result.files.first;

        // 2. Validar arquivo
        final validation = FileService.validateFile(file);
        if (!validation['valid']) {
          debugPrint('❌ Erro de validação: ${validation['error']}');
          return;
        }

        // 3. Fazer upload usando o novo método baseado no Python
        final resultado = await FileService.comandoUpload(
          file,
          'Analise este documento para mim',
        );

        if (resultado['success']) {
          debugPrint('✅ Upload realizado com sucesso!');
          debugPrint('📝 Resposta: ${resultado['text']}');
          debugPrint('🎵 Áudios: ${resultado['audioPaths']}');
        } else {
          debugPrint('❌ Erro no upload: ${resultado['error']}');
        }
      }
    } catch (e) {
      debugPrint('💥 Erro inesperado: $e');
    }
  }

  /// Exemplo usando o método de compatibilidade
  static Future<void> exemploUploadCompatibilidade() async {
    try {
      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'txt'],
      );

      if (result != null) {
        PlatformFile file = result.files.first;

        // Usa o método de compatibilidade (mesmo usado pela interface)
        final resultado = await FileService.uploadFile(
          file,
          'Analise este documento',
          'usuario123',
        );

        if (resultado['success']) {
          debugPrint('✅ Upload via método de compatibilidade realizado!');
          debugPrint('📝 Resposta: ${resultado['text']}');
        } else {
          debugPrint('❌ Erro: ${resultado['error']}');
        }
      }
    } catch (e) {
      debugPrint('💥 Erro: $e');
    }
  }

  /// Exemplo de validação detalhada
  static Future<void> exemploValidacaoDetalhada() async {
    FilePickerResult? result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'txt'],
    );

    if (result != null) {
      PlatformFile file = result.files.first;

      debugPrint('📁 Informações do arquivo:');
      debugPrint('   Nome: ${file.name}');
      debugPrint('   Tamanho: ${FileService.formatFileSize(file.size)}');
      debugPrint('   Extensão: ${file.extension}');

      final validation = FileService.validateFile(file);
      if (validation['valid']) {
        debugPrint('✅ Arquivo válido para upload');
      } else {
        debugPrint('❌ Arquivo inválido: ${validation['error']}');
      }
    }
  }

  /// Comparação entre o protocolo antigo e novo
  static void compararProtocolos() {
    debugPrint('''
🔄 COMPARAÇÃO DE PROTOCOLOS

📱 ANTIGO (HTTP):
- Usava requisições HTTP POST
- Endpoint: http://192.168.18.24:9000/upload
- Formato: JSON com arquivo e mensagem
- Resposta: JSON com texto e áudios

🐍 NOVO (Socket TCP - igual ao Python):
- Usa Socket TCP direto
- Endpoint: 18.24:9000
- Formato: JSON com ID, função e parâmetro
- Resposta: Header de 10 bytes + dados
- Base64 para arquivos

✅ VANTAGENS DO NOVO:
- Protocolo idêntico ao cliente Python
- Melhor compatibilidade com servidor
- Streaming de dados mais eficiente
- Menos overhead de HTTP
- Mesmo formato de resposta do chat

🔧 COMO USAR:
1. FileService.comandoUpload() - Método direto
2. FileService.uploadFile() - Método de compatibilidade
3. Ambos usam o mesmo protocolo interno
    ''');
  }
}

/// Widget de exemplo para testar upload
class FileUploadTestWidget extends StatefulWidget {
  const FileUploadTestWidget({super.key});

  @override
  FileUploadTestWidgetState createState() => FileUploadTestWidgetState();
}

class FileUploadTestWidgetState extends State<FileUploadTestWidget> {
  String _resultado = '';
  bool _isLoading = false;

  Future<void> _testarUpload() async {
    setState(() {
      _isLoading = true;
      _resultado = 'Iniciando teste...';
    });

    try {
      await FileUploadExample.exemploUploadBasico();
      setState(() {
        _resultado = 'Teste concluído! Verifique o console.';
      });
    } catch (e) {
      setState(() {
        _resultado = 'Erro no teste: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ElevatedButton(
          onPressed: _isLoading ? null : _testarUpload,
          child:
              _isLoading ? CircularProgressIndicator() : Text('Testar Upload'),
        ),
        SizedBox(height: 16),
        Text(_resultado),
      ],
    );
  }
}
