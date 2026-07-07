import 'package:flutter/material.dart';

class WelcomeScreen extends StatelessWidget {
  final String selectedVoiceDisplayName;
  final String selectedVoiceImagePath;
  final List<String> mensagensIniciais;

  const WelcomeScreen({
    super.key,
    required this.selectedVoiceDisplayName,
    required this.selectedVoiceImagePath,
    required this.mensagensIniciais,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Ícone da personalidade selecionada
          Container(
            width: 120,
            height: 120,
            margin: EdgeInsets.only(bottom: 24),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(60),
              child: Image.asset(
                selectedVoiceImagePath,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) {
                  return Container(
                    decoration: BoxDecoration(
                      color: Colors.grey.withAlpha(100),
                      borderRadius: BorderRadius.circular(60),
                    ),
                    child: Icon(Icons.person, size: 60, color: Colors.white),
                  );
                },
              ),
            ),
          ),
          // Título de boas-vindas
          Text(
            'Olá! Sou $selectedVoiceDisplayName',
            style: TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
            textAlign: TextAlign.center,
          ),
          SizedBox(height: 8),
          // Subtítulo
          Text(
            'Como posso te ajudar hoje?',
            style: TextStyle(color: Colors.grey[400], fontSize: 16),
            textAlign: TextAlign.center,
          ),
          SizedBox(height: 32),
        ],
      ),
    );
  }
}
