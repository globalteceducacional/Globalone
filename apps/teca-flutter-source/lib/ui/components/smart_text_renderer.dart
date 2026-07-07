import 'package:flutter/material.dart';
import '../../services/chat_service.dart';
import 'mathematical_formatter.dart';
import 'explanatory_formatter.dart';

/// Componente inteligente que renderiza texto baseado no modo do chat
class SmartTextRenderer extends StatelessWidget {
  final String text;
  final TextStyle? textStyle;
  final ChatMode? chatMode;
  final bool isPartial;

  const SmartTextRenderer({
    super.key,
    required this.text,
    this.textStyle,
    this.chatMode,
    this.isPartial = false,
  });

  @override
  Widget build(BuildContext context) {
    final defaultStyle =
        textStyle ?? TextStyle(color: Colors.white, fontSize: 14, height: 1.4);

    // Determinar o modo de renderização
    final renderMode = chatMode ?? _detectRenderMode(text);

    // Renderizar baseado no modo
    switch (renderMode) {
      case ChatMode.matematica:
        return MathematicalFormatter(content: text, textStyle: defaultStyle);
      case ChatMode.explicativo:
        return ExplanatoryFormatter(content: text, textStyle: defaultStyle);
      case ChatMode.voz:
        return _buildVoiceModeText(text, defaultStyle);
    }
  }

  // Detectar o modo de renderização baseado no conteúdo
  ChatMode _detectRenderMode(String text) {
    // Verificar se é conteúdo explicativo (texto longo, estruturado)
    // Priorizar explicativo se contém cabeçalhos ou estrutura
    if (text.contains('###') ||
        text.contains('##') ||
        text.contains('# ') ||
        text.contains('- ') ||
        text.contains('1. ') ||
        text.contains('2. ') ||
        text.contains('3. ') ||
        text.contains('**')) {
      return ChatMode.explicativo;
    }

    // Verificar se contém matemática
    if (_containsMathExpressions(text) ||
        text.contains(r'$') ||
        text.contains('\\') ||
        text.contains('sqrt') ||
        text.contains('frac')) {
      return ChatMode.matematica;
    }

    // Padrão: modo voz
    return ChatMode.voz;
  }

  // Detectar se contém expressões matemáticas
  bool _containsMathExpressions(String text) {
    final mathPatterns = [
      r'elevado\s+a\s+\d+',
      r'raiz\s+quadrada\s+de',
      r'\[[^\]]+\]\s*/\s*\[[^\]]+\]',
      r'\([^)]+\)\s*/\s*\([^)]+\)',
      r'\w+\^?\d+',
      r'\*\s*\w+',
      r'sqrt\([^)]+\)',
      r'\\[a-zA-Z]+',
    ];

    for (final pattern in mathPatterns) {
      if (RegExp(pattern, caseSensitive: false).hasMatch(text)) {
        return true;
      }
    }
    return false;
  }

  // Renderização para modo voz (simples)
  Widget _buildVoiceModeText(String text, TextStyle style) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: 4),
      child: SelectableText(
        text,
        style: style.copyWith(
          fontSize: 16,
          color: Colors.white,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}
