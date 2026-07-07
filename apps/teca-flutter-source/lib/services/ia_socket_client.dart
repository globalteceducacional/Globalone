import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../config/env_config.dart';

/// Resultado de uma sessão de streaming com o servidor de IA.
class IaStreamResult {
  final String finalText;
  final bool streamedChunks;
  final List<String> audioPaths;

  const IaStreamResult({
    required this.finalText,
    required this.streamedChunks,
    required this.audioPaths,
  });
}

/// Leitor de bytes com buffer — equivalente ao `_recv_exact` do cliente Python.
class IaSocketConnection {
  IaSocketConnection(Socket socket) : _socket = socket {
    _subscription = _socket.listen(
      _onData,
      onDone: () {
        _done = true;
        _dataWaiter?.complete();
      },
      onError: (Object error) {
        _error = error;
        _dataWaiter?.completeError(error);
      },
    );
  }

  final Socket _socket;
  final List<int> _buffer = [];
  late final StreamSubscription<List<int>> _subscription;
  bool _done = false;
  Object? _error;
  Completer<void>? _dataWaiter;

  void _onData(List<int> data) {
    _buffer.addAll(data);
    final waiter = _dataWaiter;
    if (waiter != null && !waiter.isCompleted) {
      waiter.complete();
    }
    _dataWaiter = null;
  }

  Future<Uint8List> readExact(int n) async {
    while (_buffer.length < n) {
      if (_error != null) throw _error!;
      if (_done) {
        return Uint8List.fromList(_buffer);
      }
      _dataWaiter = Completer<void>();
      await _dataWaiter!.future;
    }
    final bytes = Uint8List.fromList(_buffer.sublist(0, n));
    _buffer.removeRange(0, n);
    return bytes;
  }

  Future<void> sendJson(Map<String, dynamic> payload) async {
    _socket.add(utf8.encode(json.encode(payload)));
    await _socket.flush();
  }

  Future<void> close() async {
    await _subscription.cancel();
    await _socket.close();
  }
}

/// Cliente TCP compatível com [Cliente/cliente.py].
class IaSocketClient {
  IaSocketClient._();

  static const String clientId = 'cliente';

  static Future<IaSocketConnection> _connect() async {
    final socket = await Socket.connect(
      EnvConfig.iaServerHost,
      EnvConfig.iaServerPort,
      timeout: const Duration(seconds: 10),
    );
    return IaSocketConnection(socket);
  }

  static Future<String?> _recvPacket(IaSocketConnection reader) async {
    final header = await reader.readExact(10);
    if (header.isEmpty) return null;

    int size;
    try {
      size = int.parse(utf8.decode(header));
    } catch (_) {
      return utf8.decode(header, allowMalformed: true);
    }
    if (size <= 0) return '';

    final payload = await reader.readExact(size);
    return utf8.decode(payload, allowMalformed: true);
  }

  static bool _isWavBytes(Uint8List data) {
    return data.length >= 4 &&
        data[0] == 0x52 &&
        data[1] == 0x49 &&
        data[2] == 0x46 &&
        data[3] == 0x46;
  }

  static Future<String?> _saveWavChunk(
    Uint8List wav,
    Directory tempDir,
    int audioIndex,
  ) async {
    if (wav.isEmpty) return null;

    if (!_isWavBytes(wav)) {
      debugPrint(
        'IaSocketClient: pacote de áudio sem RIFF (${wav.length} bytes) — tentando reproduzir',
      );
    }

    final path =
        '${tempDir.path}/teca_ia_audio_'
        '${DateTime.now().millisecondsSinceEpoch}_$audioIndex.wav';
    await File(path).writeAsBytes(wav);
    debugPrint('IaSocketClient: áudio salvo em $path (${wav.length} bytes)');
    return path;
  }

  static Future<void> _drainTrailingAudio(
    IaSocketConnection reader,
    Directory tempDir,
    List<String> audioPaths,
    void Function(String audioPath)? onAudio, {
    required int startIndex,
  }) async {
    var audioIndex = startIndex;

    while (true) {
      final wav = await _recvPacketBytes(reader);
      if (wav == null || wav.isEmpty) break;

      final path = await _saveWavChunk(wav, tempDir, audioIndex);
      if (path == null) break;

      audioIndex++;
      audioPaths.add(path);
      onAudio?.call(path);
    }
  }

  static Future<Uint8List?> _recvPacketBytes(IaSocketConnection reader) async {
    final header = await reader.readExact(10);
    if (header.isEmpty) return null;

    int size;
    try {
      size = int.parse(ascii.decode(header));
    } catch (_) {
      return header;
    }
    if (size <= 0) return Uint8List(0);

    return reader.readExact(size);
  }

  /// Equivalente ao `enviar_stream` do cliente Python.
  static Future<IaStreamResult> _enviarStream(
    IaSocketConnection reader,
    String func,
    String question, {
    Map<String, dynamic>? extra,
    bool stream = true,
    void Function(String chunk)? onChunk,
    void Function(String audioPath)? onAudio,
  }) async {
    final payload = <String, dynamic>{
      'ID': clientId,
      'funcao': func,
      'parametro': question,
      'stream': stream,
    };
    if (extra != null) payload.addAll(extra);

    await reader.sendJson(payload);

    String? finalFromMarker;
    var streamedChunks = false;
    final audioPaths = <String>[];
    final tempDir = await getTemporaryDirectory();
    var audioIndex = 0;

    while (true) {
      final msg = await _recvPacket(reader);
      if (msg == null) break;

      if (msg == '<<STREAM_START>>') continue;

      if (msg == '<<STREAM_END>>') {
        if (finalFromMarker != null) break;
        continue;
      }

      if (msg == '<<AUDIO>>') {
        final wav = await _recvPacketBytes(reader);
        if (wav != null && wav.isNotEmpty) {
          final path = await _saveWavChunk(wav, tempDir, audioIndex);
          if (path != null) {
            audioIndex++;
            audioPaths.add(path);
            onAudio?.call(path);
          }
        } else {
          debugPrint('IaSocketClient: <<AUDIO>> sem payload');
        }
        continue;
      }

      if (msg.startsWith('<<FINAL>>')) {
        finalFromMarker = msg.replaceFirst(
          RegExp(r'^<<FINAL>>\s*', dotAll: true),
          '',
        );
        // Não retorna aqui: o servidor pode enviar <<AUDIO>> após o FINAL.
        continue;
      }

      if (msg.isNotEmpty) {
        onChunk?.call(msg);
        streamedChunks = true;
      }
    }

    return IaStreamResult(
      finalText: finalFromMarker ?? '',
      streamedChunks: streamedChunks,
      audioPaths: audioPaths,
    );
  }

  /// Executa qualquer função do servidor (responda, responda_explicativo, etc.).
  static Future<IaStreamResult> comandoFuncao(
    String funcao,
    String question, {
    String? voice,
    void Function(String chunk)? onChunk,
    void Function(String audioPath)? onAudio,
  }) async {
    final reader = await _connect();
    try {
      final extra = <String, dynamic>{};
      if (voice != null && voice.isNotEmpty) {
        extra['voice'] = voice;
      }

      final result = await _enviarStream(
        reader,
        funcao,
        question,
        extra: extra.isEmpty ? null : extra,
        stream: true,
        onChunk: onChunk,
        onAudio: onAudio,
      );

      if (funcao == 'responda') {
        try {
          await _drainTrailingAudio(
            reader,
            await getTemporaryDirectory(),
            result.audioPaths,
            onAudio,
            startIndex: result.audioPaths.length,
          );
        } catch (e) {
          debugPrint('IaSocketClient: áudio residual ignorado: $e');
        }
      }

      return result;
    } finally {
      await reader.close();
    }
  }

  /// Equivalente ao `comando_responda` do cliente Python.
  static Future<IaStreamResult> comandoResponda(
    String question, {
    String? voice,
    void Function(String chunk)? onChunk,
    void Function(String audioPath)? onAudio,
  }) {
    return comandoFuncao(
      'responda',
      question,
      voice: voice ?? EnvConfig.iaDefaultVoice,
      onChunk: onChunk,
      onAudio: onAudio,
    );
  }

  /// Equivalente ao `comando_upload` do cliente Python.
  static Future<String> comandoUpload(Map<String, dynamic> parametro) async {
    final reader = await _connect();
    try {
      final payload = {
        'ID': clientId,
        'funcao': 'upload',
        'parametro': parametro,
        'stream': false,
      };
      await reader.sendJson(payload);
      return await _recvPacket(reader) ?? '';
    } finally {
      await reader.close();
    }
  }
}
