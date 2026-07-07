import 'package:flutter/material.dart';
import 'chat_sidebar.dart';
import 'mode_tabs.dart';
import '../../services/chat_service.dart';

class ChatDrawer extends StatefulWidget {
  final Map<ChatMode, List<dynamic>> chatsByMode;
  final ChatMode currentMode;
  final int selectedChat;
  final String selectedVoiceDisplayName;
  final Function() onAddNewChat;
  final Function(int) onSelectChat;
  final Function(int) onRenameChat;
  final Function(int) onDeleteChat;
  final Function() onDeleteAllChats;
  final Function() onLogout;
  final Function(ChatMode) onModeChanged;

  const ChatDrawer({
    super.key,
    required this.chatsByMode,
    required this.currentMode,
    required this.selectedChat,
    required this.selectedVoiceDisplayName,
    required this.onAddNewChat,
    required this.onSelectChat,
    required this.onRenameChat,
    required this.onDeleteChat,
    required this.onDeleteAllChats,
    required this.onLogout,
    required this.onModeChanged,
  });

  @override
  State<ChatDrawer> createState() => _ChatDrawerState();
}

class _ChatDrawerState extends State<ChatDrawer> {
  @override
  Widget build(BuildContext context) {
    final currentChats = widget.chatsByMode[widget.currentMode] ?? [];

    // Contar chats por modo
    final chatCounts = <ChatMode, int>{
      ChatMode.voz: widget.chatsByMode[ChatMode.voz]?.length ?? 0,
      ChatMode.explicativo:
          widget.chatsByMode[ChatMode.explicativo]?.length ?? 0,
      ChatMode.matematica: widget.chatsByMode[ChatMode.matematica]?.length ?? 0,
    };

    debugPrint('🔍 ChatDrawer build - Modo atual: ${widget.currentMode}');
    debugPrint('📋 Chats no modo atual: ${currentChats.length}');
    debugPrint('📋 Chat selecionado: ${widget.selectedChat}');

    return Container(
      color: Color(0xFF112B3C),
      child: Column(
        children: [
          // Abas dos modos
          ModeTabs(
            currentMode: widget.currentMode,
            chatCounts: chatCounts,
            onModeChanged: widget.onModeChanged,
            onAddNewChat: widget.onAddNewChat,
          ),
          // Lista de chats
          Expanded(
            child: ChatSidebar(
              chats: currentChats,
              selectedChat: widget.selectedChat,
              selectedVoiceDisplayName: widget.selectedVoiceDisplayName,
              onAddNewChat: widget.onAddNewChat,
              onSelectChat: widget.onSelectChat,
              onRenameChat: widget.onRenameChat,
              onDeleteChat: widget.onDeleteChat,
              onDeleteAllChats: widget.onDeleteAllChats,
              onLogout: widget.onLogout,
            ),
          ),
        ],
      ),
    );
  }
}
