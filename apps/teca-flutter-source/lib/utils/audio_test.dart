import 'dart:io';
import 'dart:math';
import 'package:flutter/foundation.dart';
import '../services/audio_service.dart';

class AudioTest {
  static Future<void> runAudioTest() async {
    debugPrint('🔊 Iniciando teste de áudio...');

    try {
      // Testa inicialização
      await AudioService.initialize();
      debugPrint('✅ AudioService inicializado');

      // Testa reprodução
      final success = await AudioService.testAudio();

      if (success) {
        debugPrint('✅ Teste de áudio bem-sucedido!');
      } else {
        debugPrint('❌ Teste de áudio falhou');
      }

      // Mostra informações da plataforma
      debugPrint('📱 Plataforma: ${Platform.operatingSystem}');
      debugPrint('📱 Versão: ${Platform.operatingSystemVersion}');
      debugPrint('📱 Local: ${Platform.localeName}');
    } catch (e) {
      debugPrint('💥 Erro durante teste de áudio: $e');
    }
  }

  static Future<void> testWithCustomFile() async {
    debugPrint('🎵 Testando com arquivo personalizado...');

    try {
      // Cria um arquivo de teste mais complexo
      final tempDir = await Directory.systemTemp.createTemp('teca_audio_test');
      final testFile = File('${tempDir.path}/test_tone.wav');

      // Cria um tom de teste (440Hz - nota A)
      final wavData = _createToneWav(440, 1.0); // 1 segundo de 440Hz
      await testFile.writeAsBytes(wavData);

      debugPrint('📁 Arquivo de teste criado: ${testFile.path}');

      // Tenta reproduzir
      await AudioService.playAudio(testFile.path);

      // Limpa
      await testFile.delete();
      await tempDir.delete();

      debugPrint('✅ Teste com arquivo personalizado concluído');
    } catch (e) {
      debugPrint('❌ Erro no teste com arquivo personalizado: $e');
    }
  }

  // Cria um arquivo WAV com um tom específico
  static List<int> _createToneWav(double frequency, double duration) {
    final sampleRate = 44100;
    final bitsPerSample = 16;
    final channels = 1;
    final numSamples = (sampleRate * duration).round();
    final dataSize = numSamples * channels * (bitsPerSample ~/ 8);

    final header = <int>[];

    // RIFF header
    header.addAll([0x52, 0x49, 0x46, 0x46]); // "RIFF"
    header.addAll(_intToBytes(36 + dataSize, 4)); // File size
    header.addAll([0x57, 0x41, 0x56, 0x45]); // "WAVE"

    // fmt chunk
    header.addAll([0x66, 0x6D, 0x74, 0x20]); // "fmt "
    header.addAll(_intToBytes(16, 4)); // Chunk size
    header.addAll(_intToBytes(1, 2)); // Audio format (PCM)
    header.addAll(_intToBytes(channels, 2)); // Channels
    header.addAll(_intToBytes(sampleRate, 4)); // Sample rate
    header.addAll(
      _intToBytes(sampleRate * channels * (bitsPerSample ~/ 8), 4),
    ); // Byte rate
    header.addAll(
      _intToBytes(channels * (bitsPerSample ~/ 8), 2),
    ); // Block align
    header.addAll(_intToBytes(bitsPerSample, 2)); // Bits per sample

    // data chunk
    header.addAll([0x64, 0x61, 0x74, 0x61]); // "data"
    header.addAll(_intToBytes(dataSize, 4)); // Data size

    // Gera o tom
    final amplitude = 0.3; // Volume (0.0 a 1.0)
    for (int i = 0; i < numSamples; i++) {
      final sample =
          (amplitude * 32767 * sin(2 * pi * frequency * i / sampleRate))
              .round();
      header.addAll(_intToBytes(sample, 2));
    }

    return header;
  }

  // Converte int para bytes (little-endian)
  static List<int> _intToBytes(int value, int length) {
    final bytes = <int>[];
    for (int i = 0; i < length; i++) {
      bytes.add((value >> (i * 8)) & 0xFF);
    }
    return bytes;
  }
}
