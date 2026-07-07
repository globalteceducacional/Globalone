import 'package:flutter/material.dart';

class AnimatedCharacter extends StatelessWidget {
  final int personagemFrame;
  final String selectedVoice;
  final List<Map<String, dynamic>> availableVoices;
  final double size;
  final bool showShadow;

  const AnimatedCharacter({
    super.key,
    required this.personagemFrame,
    required this.selectedVoice,
    required this.availableVoices,
    this.size = 120,
    this.showShadow = true,
  });

  String _getCharacterImagePath() {
    if (selectedVoice == 'Teca') {
      return 'assets/teca_v1/teca_$personagemFrame.png';
    }

    final voice = availableVoices.firstWhere(
      (v) => v['name'] == selectedVoice,
      orElse: () => availableVoices.first,
    );

    return voice['imagePath'] ?? 'assets/teca_v1/teca_1-removebg-preview.png';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration:
          showShadow
              ? BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.cyanAccent.withAlpha(100),
                    blurRadius: 20,
                    spreadRadius: 5,
                  ),
                ],
              )
              : null,
      child: ClipOval(
        child: Image.asset(_getCharacterImagePath(), fit: BoxFit.cover),
      ),
    );
  }
}

// Widget para mostrar o personagem na tela de boas-vindas
class WelcomeCharacter extends StatelessWidget {
  final int personagemFrame;
  final String selectedVoice;
  final List<Map<String, dynamic>> availableVoices;

  const WelcomeCharacter({
    super.key,
    required this.personagemFrame,
    required this.selectedVoice,
    required this.availableVoices,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        AnimatedCharacter(
          personagemFrame: personagemFrame,
          selectedVoice: selectedVoice,
          availableVoices: availableVoices,
          size: 120,
          showShadow: true,
        ),
        SizedBox(height: 24),
        Text(
          'Olá! Sou ${_getCharacterDisplayName()}',
          style: TextStyle(
            color: Colors.white,
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        SizedBox(height: 8),
        Text(
          'Como posso te ajudar hoje?',
          style: TextStyle(color: Colors.white.withAlpha(150), fontSize: 16),
        ),
      ],
    );
  }

  String _getCharacterDisplayName() {
    final voice = availableVoices.firstWhere(
      (v) => v['name'] == selectedVoice,
      orElse: () => availableVoices.first,
    );
    return voice['displayName'] ?? selectedVoice;
  }
}
