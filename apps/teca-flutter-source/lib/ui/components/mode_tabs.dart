import 'package:flutter/material.dart';
import '../../services/chat_service.dart';

class ModeTabs extends StatelessWidget {
  final ChatMode currentMode;
  final Map<ChatMode, int> chatCounts;
  final Function(ChatMode) onModeChanged;
  final Function() onAddNewChat;

  const ModeTabs({
    super.key,
    required this.currentMode,
    required this.chatCounts,
    required this.onModeChanged,
    required this.onAddNewChat,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Color(0xFF112B3C),
        border: Border(bottom: BorderSide(color: Colors.grey[800]!, width: 1)),
      ),
      child: Column(
        children: [
          // Título e botão novo chat
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  "Chat Teca IA",
                  style: TextStyle(
                    color: Colors.cyanAccent,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                IconButton(
                  icon: Icon(Icons.add, color: Colors.cyanAccent),
                  tooltip: 'Novo Chat',
                  onPressed: onAddNewChat,
                ),
              ],
            ),
          ),
          // Abas dos modos
          SizedBox(
            height: 50,
            child: Row(
              children: [
                _buildTab(
                  ChatMode.voz,
                  '  Conversa',
                  chatCounts[ChatMode.voz] ?? 0,
                ),
                _buildTab(
                  ChatMode.explicativo,
                  'Explicativo',
                  chatCounts[ChatMode.explicativo] ?? 0,
                ),
                _buildTab(
                  ChatMode.matematica,
                  'Cálculo',
                  chatCounts[ChatMode.matematica] ?? 0,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTab(ChatMode mode, String label, int count) {
    final isSelected = currentMode == mode;

    return Expanded(
      child: GestureDetector(
        onTap: () => onModeChanged(mode),
        child: Container(
          decoration: BoxDecoration(
            color:
                isSelected
                    ? Colors.cyanAccent.withAlpha(20)
                    : Colors.transparent,
            border: Border(
              bottom: BorderSide(
                color: isSelected ? Colors.cyanAccent : Colors.transparent,
                width: 2,
              ),
            ),
          ),
          child: Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: isSelected ? Colors.cyanAccent : Colors.grey[400],
                    fontWeight:
                        isSelected ? FontWeight.bold : FontWeight.normal,
                    fontSize: 14,
                  ),
                ),
                if (count > 0) ...[
                  SizedBox(width: 6),
                  Container(
                    padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: isSelected ? Colors.cyanAccent : Colors.grey[600],
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      count.toString(),
                      style: TextStyle(
                        color: isSelected ? Colors.black : Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
