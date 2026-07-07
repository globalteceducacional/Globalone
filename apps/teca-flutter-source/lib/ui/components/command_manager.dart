import 'package:flutter/material.dart';
import '../../models/command.dart';
import 'dart:math';

class CommandManager extends StatefulWidget {
  final List<Command> initialCommands;
  final void Function(List<Command>) onCommandsChanged;

  const CommandManager({
    super.key,
    required this.initialCommands,
    required this.onCommandsChanged,
  });

  @override
  State<CommandManager> createState() => _CommandManagerState();
}

class _CommandManagerState extends State<CommandManager> {
  late List<Command> _commands;

  @override
  void initState() {
    super.initState();
    _commands = List.from(widget.initialCommands);
  }

  void _addCommand() async {
    final cmd = await showDialog<Command>(
      context: context,
      builder: (context) => CommandEditDialog(),
    );
    if (cmd != null && mounted) {
      setState(() {
        _commands.add(cmd);
        widget.onCommandsChanged(_commands);
      });
    }
  }

  void _editCommand(int index) async {
    final cmd = await showDialog<Command>(
      context: context,
      builder: (context) => CommandEditDialog(command: _commands[index]),
    );
    if (cmd != null && mounted) {
      setState(() {
        _commands[index] = cmd;
        widget.onCommandsChanged(_commands);
      });
    }
  }

  void _removeCommand(int index) {
    if (!mounted) return;
    setState(() {
      _commands.removeAt(index);
      widget.onCommandsChanged(_commands);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Gerenciar Comandos',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            IconButton(icon: const Icon(Icons.add), onPressed: _addCommand),
          ],
        ),
        ListView.builder(
          shrinkWrap: true,
          itemCount: _commands.length,
          itemBuilder: (context, i) {
            final cmd = _commands[i];
            return ListTile(
              title: Text(cmd.title),
              subtitle: Text(cmd.prompt),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    icon: const Icon(Icons.edit),
                    onPressed: () => _editCommand(i),
                  ),
                  IconButton(
                    icon: const Icon(Icons.delete),
                    onPressed: () => _removeCommand(i),
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

class CommandEditDialog extends StatefulWidget {
  final Command? command;
  const CommandEditDialog({super.key, this.command});

  @override
  State<CommandEditDialog> createState() => _CommandEditDialogState();
}

class _CommandEditDialogState extends State<CommandEditDialog> {
  late TextEditingController _titleController;
  late TextEditingController _promptController;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.command?.title ?? '');
    _promptController = TextEditingController(
      text: widget.command?.prompt ?? '',
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.command == null ? 'Novo Comando' : 'Editar Comando'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _titleController,
            decoration: const InputDecoration(labelText: 'Título'),
          ),
          TextField(
            controller: _promptController,
            decoration: const InputDecoration(labelText: 'Prompt'),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        ElevatedButton(
          onPressed: () {
            if (_titleController.text.trim().isEmpty ||
                _promptController.text.trim().isEmpty) {
              return;
            }
            Navigator.pop(
              context,
              Command(
                id: widget.command?.id ?? Random().nextInt(100000).toString(),
                title: _titleController.text.trim(),
                prompt: _promptController.text.trim(),
              ),
            );
          },
          child: const Text('Salvar'),
        ),
      ],
    );
  }
}
