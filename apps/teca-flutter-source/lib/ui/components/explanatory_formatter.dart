import 'package:flutter/material.dart';

/// Componente especializado para renderização de conteúdo explicativo
class ExplanatoryFormatter extends StatelessWidget {
  final String content;
  final TextStyle? textStyle;

  const ExplanatoryFormatter({
    super.key,
    required this.content,
    this.textStyle,
  });

  @override
  Widget build(BuildContext context) {
    final defaultStyle =
        textStyle ?? TextStyle(color: Colors.white, fontSize: 14, height: 1.4);

    return Container(
      margin: EdgeInsets.symmetric(vertical: 4),
      padding: EdgeInsets.all(8),
      child: SelectableRegion(
        focusNode: FocusNode(),
        selectionControls: MaterialTextSelectionControls(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Conteúdo formatado
            _buildExplanatoryContent(defaultStyle),
          ],
        ),
      ),
    );
  }

  Widget _buildExplanatoryContent(TextStyle style) {
    final processedContent = _processServerContent(content);
    final lines = processedContent.split('\n');
    final widgets = <Widget>[];

    for (final line in lines) {
      if (line.trim().isEmpty) {
        widgets.add(SizedBox(height: 8));
        continue;
      }

      widgets.add(_processExplanatoryLine(line, style));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: widgets,
    );
  }

  /// Processa o conteúdo que vem do servidor, removendo marcadores de streaming
  String _processServerContent(String content) {
    // Remover marcadores de streaming do servidor
    String processed =
        content
            .replaceAll('<<STREAM_START>>', '')
            .replaceAll('<<STREAM_END>>', '')
            .replaceAll(RegExp(r'<<FINAL>>\n?'), '')
            .trim();

    return processed;
  }

  Widget _processExplanatoryLine(String line, TextStyle style) {
    // Remover espaços em branco no início da linha
    final trimmedLine = line.trimLeft();

    // Detectar diferentes tipos de conteúdo explicativo
    if (trimmedLine.startsWith('#### ')) {
      return _buildSubsectionHeader(trimmedLine.substring(5));
    } else if (trimmedLine.startsWith('### ')) {
      return _buildSectionHeader(trimmedLine.substring(4));
    } else if (trimmedLine.startsWith('## ')) {
      return _buildSubsectionHeader(trimmedLine.substring(3));
    } else if (trimmedLine.startsWith('# ')) {
      return _buildMainHeader(trimmedLine.substring(2));
    } else if (trimmedLine.startsWith('- ')) {
      return _buildListItem(trimmedLine.substring(2));
    } else if (trimmedLine.startsWith('* ')) {
      return _buildListItem(trimmedLine.substring(2));
    } else if (trimmedLine.startsWith('1. ') ||
        trimmedLine.startsWith('2. ') ||
        trimmedLine.startsWith('3. ') ||
        trimmedLine.startsWith('4. ') ||
        trimmedLine.startsWith('5. ') ||
        trimmedLine.startsWith('6. ') ||
        trimmedLine.startsWith('7. ') ||
        trimmedLine.startsWith('8. ') ||
        trimmedLine.startsWith('9. ') ||
        trimmedLine.startsWith('10. ')) {
      return _buildNumberedItem(trimmedLine);
    } else if (trimmedLine.contains('**') ||
        trimmedLine.contains('__') ||
        trimmedLine.contains('*') ||
        trimmedLine.contains('_') ||
        trimmedLine.contains('`')) {
      // Renderização inline combinada para **bold**, __bold__, *itálico*, _itálico_ e `code`
      return _buildInlineFormattedText(line, style);
    } else {
      return _buildPlainText(
        line,
        style,
      ); // Usar linha original para preservar espaçamento
    }
  }

  // Widgets de renderização
  Widget _buildMainHeader(String text) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: 6),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.bold,
          color: Colors.blue[200],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String text) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: 5),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.bold,
          color: Colors.blue[200],
        ),
      ),
    );
  }

  Widget _buildSubsectionHeader(String text) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: 4),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.bold,
          color: Colors.blue[200],
        ),
      ),
    );
  }

  Widget _buildListItem(String text) {
    return Container(
      margin: EdgeInsets.symmetric(vertical: 1),
      padding: EdgeInsets.only(left: 8, right: 4, top: 2, bottom: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            margin: EdgeInsets.only(top: 6, right: 6),
            width: 3,
            height: 3,
            decoration: BoxDecoration(
              color: Colors.blue[400],
              shape: BoxShape.circle,
            ),
          ),
          Expanded(
            child: _buildInlineFormattedText(
              text,
              const TextStyle(fontSize: 14, color: Colors.white, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNumberedItem(String text) {
    final parts = text.split('. ');
    final number = parts[0];
    final content = parts.length > 1 ? parts[1] : '';

    return Container(
      margin: EdgeInsets.symmetric(vertical: 1),
      padding: EdgeInsets.only(left: 8, right: 4, top: 2, bottom: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            margin: EdgeInsets.only(top: 2, right: 6),
            padding: EdgeInsets.symmetric(horizontal: 4, vertical: 1),
            decoration: BoxDecoration(
              color: Colors.blue[400],
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              number,
              style: TextStyle(
                fontSize: 10,
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          Expanded(
            child: _buildInlineFormattedText(
              content,
              const TextStyle(fontSize: 14, color: Colors.white, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }

  // removido: _buildBoldText substituído por _buildInlineFormattedText

  // removido: _buildItalicText substituído por _buildInlineFormattedText

  // removido: _buildCodeText substituído por _buildInlineFormattedText

  // Renderizador inline unificado: **bold**, __bold__, *italico*, _italico_, `code`
  Widget _buildInlineFormattedText(String text, TextStyle style) {
    final regex = RegExp(
      r'(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)',
    );
    final widgets = <Widget>[];

    int lastIndex = 0;
    for (final match in regex.allMatches(text)) {
      if (match.start > lastIndex) {
        final before = text.substring(lastIndex, match.start);
        if (before.isNotEmpty) {
          widgets.add(SelectableText(before, style: style));
        }
      }

      final token = match.group(0)!;

      if (token.startsWith('`') && token.endsWith('`')) {
        final content = token.substring(1, token.length - 1);
        widgets.add(
          Container(
            padding: EdgeInsets.symmetric(horizontal: 4, vertical: 2),
            decoration: BoxDecoration(
              color: Colors.grey[800],
              borderRadius: BorderRadius.circular(3),
            ),
            child: Text(
              content,
              style: TextStyle(
                fontSize: style.fontSize ?? 14,
                color: Colors.blue[200],
                fontFamily: 'monospace',
              ),
            ),
          ),
        );
      } else if ((token.startsWith('**') && token.endsWith('**')) ||
          (token.startsWith('__') && token.endsWith('__'))) {
        final content = token.substring(2, token.length - 2);
        widgets.add(
          Text(
            content,
            style: TextStyle(
              fontSize: style.fontSize ?? 14,
              color: Colors.white,
              fontWeight: FontWeight.bold,
            ),
          ),
        );
      } else if ((token.startsWith('*') && token.endsWith('*')) ||
          (token.startsWith('_') && token.endsWith('_'))) {
        final content = token.substring(1, token.length - 1);
        widgets.add(
          Text(
            content,
            style: TextStyle(
              fontSize: style.fontSize ?? 14,
              color: Colors.white,
              fontStyle: FontStyle.italic,
            ),
          ),
        );
      } else {
        widgets.add(SelectableText(token, style: style));
      }

      lastIndex = match.end;
    }

    if (lastIndex < text.length) {
      final after = text.substring(lastIndex);
      if (after.isNotEmpty) {
        widgets.add(SelectableText(after, style: style));
      }
    }

    return Padding(
      padding: EdgeInsets.symmetric(vertical: 4),
      child: Wrap(children: widgets),
    );
  }

  Widget _buildPlainText(String text, TextStyle style) {
    // Verificar se contém matemática inline ($...$)
    if (text.contains(r'$')) {
      return Padding(
        padding: EdgeInsets.symmetric(vertical: 4),
        child: _buildInlineMathInText(text, style),
      );
    }

    return Padding(
      padding: EdgeInsets.symmetric(vertical: 4),
      child: SelectableText(text, style: style),
    );
  }

  Widget _buildInlineMathInText(String text, TextStyle style) {
    List<Widget> widgets = [];
    String remaining = text;

    while (remaining.isNotEmpty) {
      // Procurar por matemática inline $...$
      final mathMatch = RegExp(r'\$([^$]+)\$').firstMatch(remaining);
      if (mathMatch != null) {
        // Adicionar texto antes da matemática
        final beforeMath = remaining.substring(0, mathMatch.start);
        if (beforeMath.isNotEmpty) {
          widgets.add(Text(beforeMath, style: style));
        }

        // Adicionar matemática inline processada
        widgets.add(_buildInlineMathWithDollar(mathMatch.group(0)!));

        // Continuar com o resto
        remaining = remaining.substring(mathMatch.end);
        continue;
      }

      // Se não encontrou mais matemática, adicionar o resto como texto
      if (remaining.isNotEmpty) {
        widgets.add(Text(remaining, style: style));
        break;
      }
    }

    return Wrap(
      alignment: WrapAlignment.start,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: widgets,
    );
  }

  Widget _buildInlineMathWithDollar(String text) {
    // Remover os símbolos $ do início e fim
    String cleanText = text;
    if (cleanText.startsWith(r'$') &&
        cleanText.endsWith(r'$') &&
        cleanText.length > 2) {
      cleanText = cleanText.substring(1, cleanText.length - 1);
    }

    // Processar símbolos LaTeX
    final processedContent = _processLatexSymbols(cleanText);

    return Container(
      margin: EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.blue[900]!.withAlpha(100),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: Colors.blue[400]!, width: 1),
      ),
      child: Text(
        processedContent,
        style: TextStyle(
          fontSize: 14,
          color: Colors.blue[200],
          fontFamily: 'monospace',
        ),
      ),
    );
  }

  // Processar símbolos LaTeX para símbolos Unicode
  String _processLatexSymbols(String text) {
    String result = text;

    // Símbolos matemáticos comuns
    final symbolMap = {
      r'\\cdot': '·', // Multiplicação
      r'\\times': '×', // Multiplicação explícita
      r'\\div': '÷', // Divisão
      r'\\pm': '±', // Mais ou menos
      r'\\mp': '∓', // Menos ou mais
      r'\\leq': '≤', // Menor ou igual
      r'\\geq': '≥', // Maior ou igual
      r'\\neq': '≠', // Diferente
      r'\\approx': '≈', // Aproximadamente
      r'\\equiv': '≡', // Equivalente
      r'\\infty': '∞', // Infinito
      r'\\alpha': 'α', // Alfa
      r'\\beta': 'β', // Beta
      r'\\gamma': 'γ', // Gama
      r'\\delta': 'δ', // Delta
      r'\\epsilon': 'ε', // Épsilon
      r'\\theta': 'θ', // Teta
      r'\\lambda': 'λ', // Lambda
      r'\\mu': 'μ', // Mu
      r'\\pi': 'π', // Pi
      r'\\sigma': 'σ', // Sigma
      r'\\tau': 'τ', // Tau
      r'\\phi': 'φ', // Phi
      r'\\omega': 'ω', // Ômega
      r'\\Delta': 'Δ', // Delta maiúsculo
      r'\\Gamma': 'Γ', // Gama maiúsculo
      r'\\Lambda': 'Λ', // Lambda maiúsculo
      r'\\Omega': 'Ω', // Ômega maiúsculo
      r'\\Pi': 'Π', // Pi maiúsculo
      r'\\Sigma': 'Σ', // Sigma maiúsculo
      r'\\Theta': 'Θ', // Teta maiúsculo
      r'\\Phi': 'Φ', // Phi maiúsculo
    };

    // Aplicar substituições
    symbolMap.forEach((latex, unicode) {
      result = result.replaceAll(RegExp(latex), unicode);
    });

    return result;
  }
}
