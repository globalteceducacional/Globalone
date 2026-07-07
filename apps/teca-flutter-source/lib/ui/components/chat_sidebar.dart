import 'package:flutter/material.dart';

class ChatSidebar extends StatelessWidget {
  final List<dynamic> chats;
  final int selectedChat;
  final String selectedVoiceDisplayName;
  final Function() onAddNewChat;
  final Function(int) onSelectChat;
  final Function(int) onRenameChat;
  final Function(int) onDeleteChat;
  final Function() onDeleteAllChats;
  final Function() onLogout;

  const ChatSidebar({
    super.key,
    required this.chats,
    required this.selectedChat,
    required this.selectedVoiceDisplayName,
    required this.onAddNewChat,
    required this.onSelectChat,
    required this.onRenameChat,
    required this.onDeleteChat,
    required this.onDeleteAllChats,
    required this.onLogout,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 16),
        Expanded(
          child: ListView.builder(
            itemCount: chats.length,
            itemBuilder: (context, idx) {
              final c = chats[idx];
              return ListTile(
                selected: idx == selectedChat,
                tileColor:
                    idx == selectedChat
                        ? Colors.cyanAccent.withAlpha(40)
                        : Colors.transparent,
                leading:
                    idx == selectedChat
                        ? Icon(Icons.arrow_right, color: Colors.cyanAccent)
                        : null,
                title: Text(
                  c.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight:
                        idx == selectedChat
                            ? FontWeight.bold
                            : FontWeight.normal,
                  ),
                ),
                onTap: () => onSelectChat(idx),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: Icon(
                        Icons.edit,
                        size: 18,
                        color: Colors.cyanAccent,
                      ),
                      tooltip: 'Renomear',
                      onPressed: () => onRenameChat(idx),
                    ),
                    IconButton(
                      icon: Icon(Icons.delete, size: 18, color: Colors.red),
                      tooltip: 'Excluir',
                      onPressed: () => _showDeleteConfirmation(context, idx),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        if (chats.isNotEmpty) _buildDeleteAllButton(),
        _buildLogoutButton(),
      ],
    );
  }

  Widget _buildDeleteAllButton() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: onDeleteAllChats,
          icon: const Icon(Icons.delete_forever, color: Colors.white),
          label: const Text(
            'Apagar Todos os Chats',
            style: TextStyle(color: Colors.white),
          ),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.orange,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLogoutButton() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: onLogout,
          icon: const Icon(Icons.logout, color: Colors.white),
          label: const Text('Sair', style: TextStyle(color: Colors.white)),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.red,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
      ),
    );
  }

  void _showDeleteConfirmation(BuildContext context, int idx) {
    showDialog<bool>(
      context: context,
      builder:
          (context) => AlertDialog(
            title: Text('Excluir chat'),
            content: Text(
              'Tem certeza que deseja excluir este chat? Esta ação não pode ser desfeita.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: Text('Cancelar'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(context, true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                ),
                child: Text('Excluir'),
              ),
            ],
          ),
    ).then((confirm) {
      if (confirm == true) {
        onDeleteChat(idx);
      }
    });
  }
}
