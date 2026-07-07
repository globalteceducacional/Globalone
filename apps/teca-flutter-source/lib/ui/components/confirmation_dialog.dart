import 'package:flutter/material.dart';

class ConfirmationDialog extends StatelessWidget {
  final String title;
  final String content;
  final String cancelText;
  final String confirmText;
  final Color? confirmColor;
  final Color? cancelColor;
  final IconData? confirmIcon;
  final IconData? cancelIcon;

  const ConfirmationDialog({
    super.key,
    required this.title,
    required this.content,
    this.cancelText = 'Cancelar',
    this.confirmText = 'Confirmar',
    this.confirmColor,
    this.cancelColor,
    this.confirmIcon,
    this.cancelIcon,
  });

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(title),
      content: Text(content),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          style: TextButton.styleFrom(
            foregroundColor: cancelColor ?? Colors.grey,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (cancelIcon != null) ...[
                Icon(cancelIcon, size: 16),
                SizedBox(width: 4),
              ],
              Text(cancelText),
            ],
          ),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(context, true),
          style: ElevatedButton.styleFrom(
            backgroundColor: confirmColor ?? Colors.red,
            foregroundColor: Colors.white,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (confirmIcon != null) ...[
                Icon(confirmIcon, size: 16),
                SizedBox(width: 4),
              ],
              Text(confirmText),
            ],
          ),
        ),
      ],
    );
  }
}

// Diálogo específico para renomear chat
class RenameChatDialog extends StatefulWidget {
  final String currentTitle;

  const RenameChatDialog({
    super.key,
    required this.currentTitle,
  });

  @override
  State<RenameChatDialog> createState() => _RenameChatDialogState();
}

class _RenameChatDialogState extends State<RenameChatDialog> {
  late TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.currentTitle);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Renomear Chat'),
      content: TextField(
        autofocus: true,
        controller: _controller,
        decoration: InputDecoration(hintText: 'Novo nome'),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text('Cancelar'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(context, _controller.text),
          child: Text('Salvar'),
        ),
      ],
    );
  }
}
