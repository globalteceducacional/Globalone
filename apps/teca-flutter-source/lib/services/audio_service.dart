import 'dart:async';
import 'dart:io';

import 'package:audioplayers/audioplayers.dart' as audio_players;
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:just_audio/just_audio.dart' as just_audio;

enum _AudioBackend { justAudio, audioPlayers }

class AudioService {
  static just_audio.AudioPlayer? _justPlayer;
  static audio_players.AudioPlayer? _desktopPlayer;
  static _AudioBackend? _backend;
  static bool _isInitialized = false;
  static bool _isPlaying = false;

  static final List<String> _audioQueue = [];
  static int _currentAudioIndex = 0;
  static bool _isQueuePlaying = false;

  static bool get _isDesktop =>
      !kIsWeb &&
      (Platform.isWindows || Platform.isLinux || Platform.isMacOS);

  static Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      if (_isDesktop) {
        _desktopPlayer = audio_players.AudioPlayer();
        await _desktopPlayer!.setReleaseMode(audio_players.ReleaseMode.stop);
        await _desktopPlayer!.setVolume(1.0);
        _backend = _AudioBackend.audioPlayers;
        debugPrint('✅ AudioService inicializado (audioplayers/desktop)');
      } else {
        _justPlayer = just_audio.AudioPlayer();
        await _justPlayer!.setVolume(1.0);
        _backend = _AudioBackend.justAudio;
        debugPrint('✅ AudioService inicializado (just_audio/mobile)');
      }
      _isInitialized = true;
    } catch (e) {
      debugPrint('❌ Erro ao inicializar AudioService: $e');
    }
  }

  static void addToQueue(List<String> audioPaths) {
    clearQueue();
    _audioQueue.addAll(audioPaths);
    debugPrint(
      '🎵 Adicionados ${audioPaths.length} áudios à fila. Total: ${_audioQueue.length}',
    );
  }

  static void enqueueAudio(String audioPath) {
    _audioQueue.add(audioPath);
    debugPrint(
      '🎵 Áudio enfileirado: $audioPath (fila: ${_audioQueue.length})',
    );
  }

  static void clearQueue() {
    if (_isQueuePlaying) {
      _isQueuePlaying = false;
      _isPlaying = false;
    }
    _audioQueue.clear();
    _currentAudioIndex = 0;
    debugPrint('🧹 Fila de áudio limpa');
  }

  static bool get isQueuePlaying => _isQueuePlaying;

  static int get queueLength => _audioQueue.length;

  static Future<void> startQueueIfIdle({Function? onComplete}) async {
    if (!_isQueuePlaying && _audioQueue.isNotEmpty) {
      await playQueue(onComplete: onComplete);
    }
  }

  static Future<void> playQueue({Function? onComplete}) async {
    if (_audioQueue.isEmpty) {
      debugPrint('⚠️ Fila de áudio vazia');
      onComplete?.call();
      return;
    }

    if (_isQueuePlaying) {
      debugPrint('⚠️ Fila já está tocando (${_audioQueue.length} itens)');
      return;
    }

    _isQueuePlaying = true;
    _currentAudioIndex = 0;

    debugPrint(
      '🎵 Iniciando reprodução da fila com ${_audioQueue.length} áudios',
    );
    await _playNextInQueue(onComplete);
  }

  static Future<void> _playNextInQueue([Function? onComplete]) async {
    while (_isQueuePlaying && _currentAudioIndex < _audioQueue.length) {
      final audioPath = _audioQueue[_currentAudioIndex];
      debugPrint(
        '🎵 Tocando áudio ${_currentAudioIndex + 1}/${_audioQueue.length}: $audioPath',
      );

      try {
        await playAudio(audioPath);
      } catch (e) {
        debugPrint('❌ Erro ao reproduzir áudio na fila: $e');
      }

      _currentAudioIndex++;
      await Future.delayed(const Duration(milliseconds: 80));
    }

    _isQueuePlaying = false;
    _isPlaying = false;
    debugPrint('✅ Fila de áudio concluída');
    onComplete?.call();
  }

  static Future<void> stopQueue({Function? onStop}) async {
    _isQueuePlaying = false;
    await stopAudio();
    debugPrint('⏹️ Fila de áudio parada');
    onStop?.call();
  }

  static Map<String, dynamic> getQueueInfo() {
    return {
      'isPlaying': _isQueuePlaying,
      'currentIndex': _currentAudioIndex,
      'totalAudios': _audioQueue.length,
      'progress':
          _audioQueue.isEmpty ? 0.0 : (_currentAudioIndex / _audioQueue.length),
    };
  }

  static Future<void> playAudio(String audioPath) async {
    if (!_isInitialized) {
      await initialize();
    }

    if (!_isInitialized || _backend == null) {
      debugPrint('❌ Player de áudio não inicializado');
      return;
    }

    final audioFile = File(audioPath);
    if (!await audioFile.exists()) {
      debugPrint('❌ Arquivo de áudio não encontrado: $audioPath');
      return;
    }

    final fileSize = await audioFile.length();
    if (fileSize < 44) {
      debugPrint(
        '❌ Arquivo de áudio muito pequeno ($fileSize bytes): $audioPath',
      );
      return;
    }

    _isPlaying = true;
    debugPrint('🔊 Reproduzindo ($fileSize bytes): $audioPath');

    try {
      switch (_backend!) {
        case _AudioBackend.justAudio:
          await _playWithJustAudio(audioPath);
        case _AudioBackend.audioPlayers:
          await _playWithAudioPlayers(audioPath);
      }
      debugPrint('✅ Áudio concluído: $audioPath');
    } on MissingPluginException catch (e) {
      debugPrint('❌ Plugin de áudio indisponível: $e');
    } catch (e) {
      debugPrint('❌ Erro ao reproduzir áudio: $e');
    } finally {
      _isPlaying = false;
    }
  }

  static Future<void> _playWithJustAudio(String audioPath) async {
    final player = _justPlayer;
    if (player == null) return;

    await player.stop();
    await player.setVolume(1.0);
    await player.setFilePath(audioPath);
    await player.play();
    await player.processingStateStream.firstWhere(
      (state) => state == just_audio.ProcessingState.completed,
    );
  }

  static Future<void> _playWithAudioPlayers(String audioPath) async {
    final player = _desktopPlayer;
    if (player == null) return;

    final normalizedPath = audioPath.replaceAll('/', '\\');
    final completer = Completer<void>();
    StreamSubscription<void>? completeSub;
    StreamSubscription<audio_players.PlayerState>? stateSub;

    completeSub = player.onPlayerComplete.listen((_) {
      if (!completer.isCompleted) completer.complete();
    });

    stateSub = player.onPlayerStateChanged.listen((state) {
      if (state == audio_players.PlayerState.completed &&
          !completer.isCompleted) {
        completer.complete();
      }
    });

    try {
      await player.stop();
      await player.setVolume(1.0);
      await player.play(
        audio_players.DeviceFileSource(normalizedPath),
      );

      Duration? duration;
      for (var i = 0; i < 20; i++) {
        duration = await player.getDuration();
        if (duration != null && duration > Duration.zero) break;
        await Future.delayed(const Duration(milliseconds: 50));
      }

      if (duration != null && duration > Duration.zero) {
        await Future.any([
          completer.future,
          Future.delayed(duration + const Duration(milliseconds: 300)),
        ]);
      } else {
        await completer.future.timeout(
          const Duration(minutes: 3),
          onTimeout: () {
            debugPrint('⏱️ Timeout aguardando fim do áudio: $audioPath');
          },
        );
      }
    } finally {
      await completeSub.cancel();
      await stateSub.cancel();
    }
  }

  static Future<void> stopAudio() async {
    if (!_isInitialized) return;

    try {
      switch (_backend) {
        case _AudioBackend.justAudio:
          await _justPlayer?.stop();
        case _AudioBackend.audioPlayers:
          await _desktopPlayer?.stop();
        case null:
          break;
      }
      _isPlaying = false;
      debugPrint('⏹️ Áudio parado');
    } catch (e) {
      debugPrint('❌ Erro ao parar áudio: $e');
    }
  }

  static bool get isPlaying => _isPlaying;

  static Future<void> dispose() async {
    try {
      if (_backend == _AudioBackend.justAudio) {
        await _justPlayer?.dispose();
        _justPlayer = null;
      } else if (_backend == _AudioBackend.audioPlayers) {
        await _desktopPlayer?.dispose();
        _desktopPlayer = null;
      }
      _backend = null;
      _isInitialized = false;
      _isPlaying = false;
      debugPrint('🧹 AudioService liberado');
    } catch (e) {
      debugPrint('❌ Erro ao liberar AudioService: $e');
    }
  }

  static Future<dynamic> testAudio() async {}
}
