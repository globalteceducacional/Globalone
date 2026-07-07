import 'package:flutter/material.dart';

class CommandButtons extends StatelessWidget {
  final List<Map<String, String>> comandos;
  final void Function(String) onCommandSelected;

  const CommandButtons({
    super.key,
    required this.comandos,
    required this.onCommandSelected,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children:
            comandos.map((cmd) {
              return Padding(
                padding: const EdgeInsets.all(8.0),
                child: ElevatedButton(
                  onPressed: () => onCommandSelected(cmd['prompt']!),
                  child: Text(cmd['titulo']!),
                ),
              );
            }).toList(),
      ),
    );
  }
}
