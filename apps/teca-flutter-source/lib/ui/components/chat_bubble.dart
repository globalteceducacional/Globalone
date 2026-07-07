import 'package:flutter/material.dart';
import 'smart_text_renderer.dart';
import '../../services/chat_service.dart';

class ChatBubble extends StatelessWidget {
  final String sender;
  final String text;
  final bool left;
  final Color? color;
  final bool isAnimated;
  final bool showPersonagem;
  final int? msgIndex;
  final String? personagem;
  final int personagemFrame;
  final String selectedVoice;
  final List<Map<String, dynamic>> availableVoices;
  final Function(int) onEditMessage;
  final Function(String) onCopyToClipboard;
  final ChatMode? chatMode;

  const ChatBubble({
    super.key,
    required this.sender,
    required this.text,
    this.left = true,
    this.color,
    this.isAnimated = false,
    this.showPersonagem = true,
    this.msgIndex,
    this.personagem,
    required this.personagemFrame,
    required this.selectedVoice,
    required this.availableVoices,
    required this.onEditMessage,
    required this.onCopyToClipboard,
    this.chatMode,
  });

  @override
  Widget build(BuildContext context) {
    final isUser = sender == "Você";

    if (isUser) {
      return _buildUserBubble();
    } else {
      return _buildAIBubble();
    }
  }

  Widget _buildUserBubble() {
    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        margin: EdgeInsets.symmetric(vertical: 6),
        padding: EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color ?? Colors.blueGrey[700],
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (msgIndex != null)
                  IconButton(
                    icon: Icon(
                      Icons.edit,
                      color: Colors.blue.withAlpha(200),
                      size: 18,
                    ),
                    onPressed: () => onEditMessage(msgIndex!),
                    tooltip: '✏️ Editar mensagem',
                    padding: EdgeInsets.zero,
                    constraints: BoxConstraints(minWidth: 24, minHeight: 24),
                  ),
                IconButton(
                  icon: Icon(
                    Icons.copy,
                    color: Colors.white.withAlpha(150),
                    size: 18,
                  ),
                  onPressed: () => onCopyToClipboard(text),
                  tooltip: 'Copiar mensagem',
                  padding: EdgeInsets.zero,
                  constraints: BoxConstraints(minWidth: 24, minHeight: 24),
                ),
                Text(
                  sender,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            SmartTextRenderer(
              text: text,
              textStyle: TextStyle(color: Colors.white),
              chatMode: chatMode,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAIBubble() {
    return Align(
      alignment: Alignment.centerLeft,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (showPersonagem) _buildPersonagemAvatar(),
          Flexible(
            child: Container(
              padding: EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: color ?? Colors.cyan[700],
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        sender,
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton(
                        icon: Icon(
                          Icons.copy,
                          color: Colors.white.withAlpha(150),
                          size: 18,
                        ),
                        onPressed: () => onCopyToClipboard(text),
                        tooltip: 'Copiar mensagem',
                        padding: EdgeInsets.zero,
                        constraints: BoxConstraints(
                          minWidth: 24,
                          minHeight: 24,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  SmartTextRenderer(
                    text: text,
                    textStyle: TextStyle(color: Colors.white),
                    chatMode: chatMode,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPersonagemAvatar() {
    final personagemToUse = personagem ?? selectedVoice;
    String personagemImagePath;

    if (personagemToUse == 'Teca') {
      personagemImagePath =
          'assets/teca_v1/teca_$personagemFrame-removebg-preview.png';
    } else {
      final voice = availableVoices.firstWhere(
        (v) => v['name'] == personagemToUse,
        orElse: () => availableVoices.first,
      );
      personagemImagePath =
          voice['imagePath'] ?? 'assets/teca_v1/teca_1-removebg-preview.png';
    }

    return Container(
      width: 80,
      height: 80,
      margin: EdgeInsets.only(right: 8),
      child: Image.asset(
        personagemImagePath,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) {
          return Icon(Icons.person, size: 60, color: Colors.cyanAccent);
        },
      ),
    );
  }
}
