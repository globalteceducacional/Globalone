import 'package:flutter/material.dart';
import '../../services/chat_service.dart';

class ChatTypeSelectionDialog extends StatefulWidget {
  final Function(ChatMode) onChatTypeSelected;

  const ChatTypeSelectionDialog({super.key, required this.onChatTypeSelected});

  @override
  State<ChatTypeSelectionDialog> createState() =>
      _ChatTypeSelectionDialogState();
}

class _ChatTypeSelectionDialogState extends State<ChatTypeSelectionDialog> {
  ChatMode? _selectedMode;

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final isLandscape = mediaQuery.size.width > mediaQuery.size.height;

    return Dialog(
      backgroundColor: Color(0xFF112B3C),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        width: isLandscape ? 500 : 400,
        padding: EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Título
            Text(
              'Escolha o Tipo de Chat',
              style: TextStyle(
                color: Colors.white,
                fontSize: isLandscape ? 24 : 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            SizedBox(height: isLandscape ? 32 : 24),

            // Opções de tipo de chat
            _buildChatTypeOption(
              ChatMode.voz,
              '  Modo Voz',
              'Chat com síntese de voz e avatar animado',
              Icons.mic,
              Colors.cyan,
            ),
            SizedBox(height: 16),

            _buildChatTypeOption(
              ChatMode.explicativo,
              '📚 Modo Explicativo',
              'Chat apenas com texto, sem animações',
              Icons.text_fields,
              Colors.blue,
            ),
            SizedBox(height: 16),

            _buildChatTypeOption(
              ChatMode.matematica,
              '🧮 Modo Matemática',
              'Chat especializado em matemática e LaTeX',
              Icons.calculate,
              Colors.green,
            ),

            SizedBox(height: isLandscape ? 32 : 24),

            // Botões
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(
                    'Cancelar',
                    style: TextStyle(color: Colors.grey[400]),
                  ),
                ),
                ElevatedButton(
                  onPressed:
                      _selectedMode != null
                          ? () {
                            widget.onChatTypeSelected(_selectedMode!);
                            Navigator.of(context).pop();
                          }
                          : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.cyanAccent,
                    foregroundColor: Colors.black,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: Text('Criar Chat'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildChatTypeOption(
    ChatMode mode,
    String title,
    String description,
    IconData icon,
    Color color,
  ) {
    final isSelected = _selectedMode == mode;

    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedMode = mode;
        });
      },
      child: AnimatedContainer(
        duration: Duration(milliseconds: 200),
        padding: EdgeInsets.all(16),
        decoration: BoxDecoration(
          color:
              isSelected
                  ? color.withAlpha(30)
                  : Colors.grey[800]?.withAlpha(50),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? color : Colors.grey[600]!,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            // Ícone
            Container(
              padding: EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withAlpha(30),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: color, size: 24),
            ),
            SizedBox(width: 16),

            // Texto
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    description,
                    style: TextStyle(color: Colors.grey[400], fontSize: 14),
                  ),
                ],
              ),
            ),

            // Indicador de seleção
            if (isSelected) Icon(Icons.check_circle, color: color, size: 24),
          ],
        ),
      ),
    );
  }
}
