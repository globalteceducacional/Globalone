import 'package:flutter/material.dart';
import '../../services/chat_service.dart';

class ChatHeader extends StatelessWidget {
  final ChatMode chatMode;
  final String selectedVoice;
  final List<Map<String, dynamic>> availableVoices;
  final bool isLoading;
  final bool isStreamingActive;
  final Function(String) onVoiceChanged;
  final VoidCallback onShowVoiceSelectionDialog;

  const ChatHeader({
    super.key,
    required this.chatMode,
    required this.selectedVoice,
    required this.availableVoices,
    required this.isLoading,
    required this.isStreamingActive,
    required this.onVoiceChanged,
    required this.onShowVoiceSelectionDialog,
  });

  // Método para obter o nome de exibição da voz selecionada
  String _getSelectedVoiceDisplayName() {
    final voice = availableVoices.firstWhere(
      (v) => v['name'] == selectedVoice,
      orElse: () => availableVoices.first,
    );
    return voice['displayName'] ?? selectedVoice;
  }

  // Método para obter o ícone da voz selecionada
  IconData _getSelectedVoiceIcon() {
    final voice = availableVoices.firstWhere(
      (v) => v['name'] == selectedVoice,
      orElse: () => availableVoices.first,
    );
    return voice['icon'] ?? Icons.person;
  }

  @override
  Widget build(BuildContext context) {
    final orientation = MediaQuery.of(context).orientation;
    final isPortrait = orientation == Orientation.portrait;

    return LayoutBuilder(
      builder: (context, constraints) {
        final isMobilePortrait = constraints.maxWidth < 600 && isPortrait;

        if (isMobilePortrait) {
          // Layout para mobile em retrato - tudo na mesma linha
          return Row(
            children: [
              Builder(
                builder:
                    (context) => IconButton(
                      icon: Icon(
                        Icons.menu,
                        color: Colors.cyanAccent,
                        size: 30,
                      ),
                      onPressed: () => Scaffold.of(context).openDrawer(),
                      tooltip: 'Abrir menu',
                    ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  "Teca.ia",
                  style: TextStyle(
                    color: Colors.cyanAccent,
                    fontWeight: FontWeight.bold,
                    fontSize: 22,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              // Seletor de voz (apenas no modo voz)
              if (chatMode == ChatMode.voz) _buildVoiceSelector(),
            ],
          );
        } else {
          // Layout original para desktop e mobile landscape
          return Row(
            children: [
              Builder(
                builder:
                    (context) => IconButton(
                      icon: Icon(Icons.menu, color: Colors.cyanAccent),
                      onPressed: () => Scaffold.of(context).openDrawer(),
                      tooltip: 'Abrir menu',
                    ),
              ),
              const SizedBox(width: 8),
              Text(
                "Teca.ia",
                style: TextStyle(
                  color: Colors.cyanAccent,
                  fontWeight: FontWeight.bold,
                  fontSize: 22,
                ),
              ),
              const SizedBox(width: 24),
              // Seletor de voz (apenas no modo voz)
              if (chatMode == ChatMode.voz) _buildVoiceSelector(),
            ],
          );
        }
      },
    );
  }

  Widget _buildVoiceSelector() {
    return Container(
      margin: EdgeInsets.only(left: 8),
      decoration: BoxDecoration(
        color: Colors.purple.withAlpha(50),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.purple, width: 1),
      ),
      child: InkWell(
        onTap: isLoading ? null : onShowVoiceSelectionDialog,
        borderRadius: BorderRadius.circular(20),
        child: Opacity(
          opacity: isLoading ? 0.5 : 1.0,
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  _getSelectedVoiceIcon(),
                  color: isLoading ? Colors.grey : Colors.purple,
                  size: 20,
                ),
                SizedBox(width: 4),
                Text(
                  _getSelectedVoiceDisplayName(),
                  style: TextStyle(
                    color: isLoading ? Colors.grey : Colors.purple,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Icon(
                  Icons.arrow_drop_down,
                  color: isLoading ? Colors.grey : Colors.purple,
                  size: 16,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
