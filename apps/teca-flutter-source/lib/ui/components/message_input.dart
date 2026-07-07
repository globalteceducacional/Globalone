import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;
import '../../services/file_service.dart';

class MessageInput extends StatefulWidget {
  final TextEditingController controller;
  final void Function(String) onSend;
  final void Function(PlatformFile)? onFileSelected;
  final VoidCallback? onRemovePendingFile;
  final bool isLoading;
  final bool isStreamingActive;
  final VoidCallback? onCancelStreaming;
  final bool hasPendingFile;
  final String? pendingFileName;
  final String? personalityName;
  final bool isEditing;
  final VoidCallback? onCancelEdit;

  const MessageInput({
    super.key,
    required this.controller,
    required this.onSend,
    this.onFileSelected,
    this.onRemovePendingFile,
    this.isLoading = false,
    this.isStreamingActive = false,
    this.onCancelStreaming,
    this.hasPendingFile = false,
    this.pendingFileName,
    this.personalityName,
    this.isEditing = false,
    this.onCancelEdit,
  });

  @override
  State<MessageInput> createState() => _MessageInputState();
}

class _MessageInputState extends State<MessageInput>
    with TickerProviderStateMixin {
  bool _hasText = false;
  late stt.SpeechToText _speech;
  bool _isListening = false;

  bool get _showMicButton => kIsWeb || Platform.isAndroid || Platform.isIOS;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onTextChanged);
    _speech = stt.SpeechToText();
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onTextChanged);
    super.dispose();
  }

  void _onTextChanged() {
    if (mounted) {
      setState(() {
        _hasText = widget.controller.text.trim().isNotEmpty;
      });
    }
  }

  Future<void> _pickFile(BuildContext context) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'txt'],
      withData: true,
    );

    if (result != null &&
        result.files.isNotEmpty &&
        widget.onFileSelected != null) {
      final file = result.files.first;

      // Usa o FileService para validar o arquivo
      final validation = FileService.validateFile(file);

      if (validation['valid']) {
        widget.onFileSelected!(file);
      } else {
        // Mostra mensagem de erro se a validação falhar
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(validation['error']),
              backgroundColor: Colors.red,
              duration: Duration(seconds: 3),
            ),
          );
        }
      }
    }
  }

  void _sendMessage() {
    final text = widget.controller.text.trim();
    if (text.isNotEmpty && !widget.isLoading) {
      widget.controller.clear();
      widget.onSend(text);
    }
  }

  Future<void> _listen() async {
    if (!_isListening) {
      bool available = await _speech.initialize();
      if (available) {
        setState(() => _isListening = true);
        _speech.listen(
          onResult: (val) {
            widget.controller.text = val.recognizedWords;
            widget.controller.selection = TextSelection.fromPosition(
              TextPosition(offset: widget.controller.text.length),
            );
            if (val.hasConfidenceRating && val.confidence > 0) {
              setState(() => _isListening = false);
              _speech.stop();
            }
          },
        );
      }
    } else {
      setState(() => _isListening = false);
      _speech.stop();
    }
  }

  Widget _buildEditingBanner() {
    return Container(
      margin: const EdgeInsets.only(left: 4, right: 4, bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.amber.withAlpha(30),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.amber.withAlpha(120), width: 1),
      ),
      child: Row(
        children: [
          const Icon(Icons.edit_rounded, color: Colors.amber, size: 16),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Editando mensagem',
              style: TextStyle(
                color: Colors.amber,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          GestureDetector(
            onTap: widget.onCancelEdit,
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: Colors.amber.withAlpha(40),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.close_rounded,
                color: Colors.amber,
                size: 16,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final isSmallScreen = screenWidth < 450;

    return Stack(
      children: [
        Container(
          margin: const EdgeInsets.all(16.0),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Colors.cyan.withAlpha(30),
                Colors.blue.withAlpha(20),
                Colors.purple.withAlpha(10),
              ],
            ),
            borderRadius: BorderRadius.circular(25.0),
            border: Border.all(
              color: widget.isEditing
                  ? Colors.amber.withAlpha(180)
                  : Colors.cyan.withAlpha(100),
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withAlpha(50),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
              BoxShadow(
                color: Colors.cyan.withAlpha(30),
                blurRadius: 20,
                offset: const Offset(0, 0),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
            child:
                isSmallScreen
                    ? _buildSmallScreenLayout()
                    : _buildLargeScreenLayout(),
          ),
        ),
      ],
    );
  }

  Widget _buildSmallScreenLayout() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Banner de edição
        if (widget.isEditing) _buildEditingBanner(),
        // Indicador de arquivo pendente
        if (widget.hasPendingFile)
          Container(
            margin: EdgeInsets.only(bottom: 8),
            padding: EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.cyan.withAlpha(80),
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: Colors.cyanAccent, width: 1),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.attach_file, color: Colors.cyanAccent, size: 16),
                SizedBox(width: 6),
                Flexible(
                  child: Text(
                    'Arquivo anexado: ${widget.pendingFileName}',
                    style: TextStyle(
                      color: Colors.cyanAccent,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                SizedBox(width: 8),
                GestureDetector(
                  onTap: widget.onRemovePendingFile,
                  child: Icon(Icons.close, color: Colors.cyanAccent, size: 16),
                ),
              ],
            ),
          ),
        // Campo de texto principal com botões integrados
        Container(
          decoration: BoxDecoration(
            color: Colors.white.withAlpha(10),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withAlpha(30), width: 1),
          ),
          child: Row(
            children: [
              // Botão de anexo
              Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Colors.cyan.withAlpha(80),
                      Colors.blue.withAlpha(60),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: IconButton(
                  icon: Icon(
                    Icons.attach_file_rounded,
                    color: Colors.cyanAccent,
                    size: 20,
                  ),
                  onPressed: widget.isLoading ? null : () => _pickFile(context),
                  tooltip: 'Anexar arquivo',
                  style: IconButton.styleFrom(
                    padding: const EdgeInsets.all(8),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              // Campo de texto
              Expanded(
                child: TextField(
                  controller: widget.controller,
                  enabled: !widget.isLoading,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w400,
                  ),
                  decoration: InputDecoration(
                    hintText:
                        widget.hasPendingFile
                            ? 'Digite sua mensagem sobre "${widget.pendingFileName}"...'
                            : 'Digite sua pergunta...',
                    hintStyle: TextStyle(
                      color: Colors.white.withAlpha(120),
                      fontSize: 16,
                      fontWeight: FontWeight.w400,
                    ),
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                  ),
                  maxLines: null,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _sendMessage(),
                ),
              ),
              // Botão de microfone
              if (_showMicButton)
                IconButton(
                  icon: Icon(
                    _isListening ? Icons.mic : Icons.mic_none,
                    color: _isListening ? Colors.redAccent : Colors.cyanAccent,
                    size: 20,
                  ),
                  onPressed: widget.isLoading ? null : _listen,
                  tooltip: 'Falar',
                  style: IconButton.styleFrom(
                    padding: const EdgeInsets.all(8),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
              const SizedBox(width: 8),
              // Botão de enviar
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                decoration: BoxDecoration(
                  gradient:
                      _hasText && !widget.isLoading
                          ? const LinearGradient(
                            colors: [Colors.cyan, Colors.blue],
                          )
                          : LinearGradient(
                            colors: [
                              Colors.grey.withAlpha(100),
                              Colors.grey.withAlpha(80),
                            ],
                          ),
                  borderRadius: BorderRadius.circular(16),
                  boxShadow:
                      _hasText && !widget.isLoading
                          ? [
                            BoxShadow(
                              color: Colors.cyan.withAlpha(100),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ]
                          : null,
                ),
                child: IconButton(
                  icon: Icon(
                    widget.isStreamingActive
                        ? Icons.stop_rounded
                        : Icons.send_rounded,
                    color:
                        widget.isStreamingActive
                            ? Colors.red[400]
                            : (_hasText && !widget.isLoading
                                ? Colors.white
                                : Colors.grey.withAlpha(150)),
                    size: 20,
                  ),
                  onPressed:
                      widget.isStreamingActive
                          ? widget.onCancelStreaming
                          : (_hasText && !widget.isLoading
                              ? _sendMessage
                              : null),
                  tooltip:
                      widget.isStreamingActive
                          ? 'Cancelar streaming'
                          : 'Enviar mensagem',
                  style: IconButton.styleFrom(
                    padding: const EdgeInsets.all(12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildLargeScreenLayout() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Banner de edição
        if (widget.isEditing) _buildEditingBanner(),
        // Indicador de arquivo pendente
        if (widget.hasPendingFile)
          Container(
            margin: EdgeInsets.only(bottom: 8),
            padding: EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.cyan.withAlpha(80),
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: Colors.cyanAccent, width: 1),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.attach_file, color: Colors.cyanAccent, size: 16),
                SizedBox(width: 6),
                Flexible(
                  child: Text(
                    'Arquivo anexado: ${widget.pendingFileName}',
                    style: TextStyle(
                      color: Colors.cyanAccent,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                SizedBox(width: 8),
                GestureDetector(
                  onTap: widget.onRemovePendingFile,
                  child: Icon(Icons.close, color: Colors.cyanAccent, size: 16),
                ),
              ],
            ),
          ),
        Row(
          children: [
            // Botão de anexo
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.cyan.withAlpha(80),
                    Colors.blue.withAlpha(60),
                  ],
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: IconButton(
                icon: Icon(
                  Icons.attach_file_rounded,
                  color: Colors.cyanAccent,
                  size: 24,
                ),
                onPressed: widget.isLoading ? null : () => _pickFile(context),
                tooltip: 'Anexar arquivo (PDF, TXT - máx. 10MB)',
                style: IconButton.styleFrom(
                  padding: const EdgeInsets.all(12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            // Campo de texto
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white.withAlpha(10),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: Colors.white.withAlpha(30),
                    width: 1,
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: widget.controller,
                        enabled: !widget.isLoading,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w400,
                        ),
                        decoration: InputDecoration(
                          hintText:
                              widget.isLoading
                                  ? '${widget.personalityName ?? 'Teca'} está pensando...'
                                  : widget.isEditing
                                  ? 'Edite sua mensagem...'
                                  : widget.hasPendingFile
                                  ? 'Digite sua mensagem sobre "${widget.pendingFileName}"...'
                                  : 'Digite sua pergunta...',
                          hintStyle: TextStyle(
                            color: Colors.white.withAlpha(120),
                            fontSize: 16,
                            fontWeight: FontWeight.w400,
                          ),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                        ),
                        maxLines: null,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _sendMessage(),
                      ),
                    ),
                    // Botão de microfone
                    _showMicButton
                        ? IconButton(
                          icon: Icon(
                            _isListening ? Icons.mic : Icons.mic_none,
                            color:
                                _isListening
                                    ? Colors.redAccent
                                    : Colors.cyanAccent,
                          ),
                          onPressed: widget.isLoading ? null : _listen,
                          tooltip: 'Falar',
                        )
                        : SizedBox.shrink(),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            // Botão de enviar/parar streaming
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              decoration: BoxDecoration(
                gradient:
                    _hasText && !widget.isLoading
                        ? const LinearGradient(
                          colors: [Colors.cyan, Colors.blue],
                        )
                        : LinearGradient(
                          colors: [
                            Colors.grey.withAlpha(100),
                            Colors.grey.withAlpha(80),
                          ],
                        ),
                borderRadius: BorderRadius.circular(20),
                boxShadow:
                    _hasText && !widget.isLoading
                        ? [
                          BoxShadow(
                            color: Colors.cyan.withAlpha(100),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ]
                        : null,
              ),
              child: IconButton(
                icon: Icon(
                  widget.isStreamingActive
                      ? Icons.stop_rounded
                      : Icons.send_rounded,
                  color:
                      widget.isStreamingActive
                          ? Colors.red[400]
                          : (_hasText && !widget.isLoading
                              ? Colors.white
                              : Colors.grey.withAlpha(150)),
                  size: 24,
                ),
                onPressed:
                    widget.isStreamingActive
                        ? widget.onCancelStreaming
                        : (_hasText && !widget.isLoading ? _sendMessage : null),
                tooltip:
                    widget.isStreamingActive
                        ? 'Cancelar streaming'
                        : 'Enviar mensagem',
                style: IconButton.styleFrom(
                  padding: const EdgeInsets.all(12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
