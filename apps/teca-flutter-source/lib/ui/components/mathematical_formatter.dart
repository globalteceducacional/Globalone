import 'package:flutter/material.dart';

/// Formatter matemático usando apenas widgets Flutter nativos (sem WebView)
class MathematicalFormatter extends StatelessWidget {
  final String content;
  final TextStyle? textStyle;

  const MathematicalFormatter({
    super.key,
    required this.content,
    this.textStyle,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: _buildContent(),
    );
  }

  List<Widget> _buildContent() {
    final processedContent = _processServerContent(content);
    final lines = processedContent.split('\n');
    final widgets = <Widget>[];

    bool inDollarBlock = false;
    final dollarBuffer = StringBuffer();

    for (final rawLine in lines) {
      String line = rawLine;
      if (line.isEmpty && !inDollarBlock) {
        widgets.add(const SizedBox(height: 8));
        continue;
      }

      int cursor = 0;
      while (cursor < line.length) {
        final idx = line.indexOf(r'$$', cursor);

        if (idx == -1) {
          // Sem marcador $$ restante nesta linha
          if (inDollarBlock) {
            dollarBuffer.writeln(line.substring(cursor));
          } else {
            final segment = line.substring(cursor);
            if (segment.trim().isNotEmpty) {
              // Cabeçalhos têm prioridade
              if (_isHeader(segment)) {
                widgets.add(_buildHeader(segment));
              } else if (segment.contains(r'$')) {
                widgets.add(_buildMixedContent(segment));
              } else {
                widgets.add(_buildText(segment));
              }
            }
          }
          break;
        }

        // Há um $$ a partir de idx
        if (!inDollarBlock) {
          // Texto antes do bloco
          final before = line.substring(cursor, idx);
          if (before.trim().isNotEmpty) {
            if (_isHeader(before)) {
              widgets.add(_buildHeader(before));
            } else if (before.contains(r'$')) {
              widgets.add(_buildMixedContent(before));
            } else {
              widgets.add(_buildText(before));
            }
          }
          // Entra no bloco
          inDollarBlock = true;
          cursor = idx + 2; // pular $$
          continue;
        } else {
          // Fecha bloco
          dollarBuffer.write(line.substring(cursor, idx));
          widgets.add(_buildDisplayMath(dollarBuffer.toString().trim()));
          dollarBuffer.clear();
          inDollarBlock = false;
          cursor = idx + 2; // pular $$
          continue;
        }
      }
    }

    // Se terminou arquivo ainda dentro do bloco, fecha com o que tem
    if (inDollarBlock && dollarBuffer.isNotEmpty) {
      widgets.add(_buildDisplayMath(dollarBuffer.toString().trim()));
    }

    return widgets;
  }

  /// Remove marcadores de streaming vindos do servidor
  String _processServerContent(String content) {
    return content
        .replaceAll('<<STREAM_START>>', '')
        .replaceAll('<<STREAM_END>>', '')
        .replaceAll(RegExp(r'<<FINAL>>\\n?'), '')
        .trim();
  }

  /// Constrói matemática em display (centralizada)
  Widget _buildDisplayMath(String latex) {
    // Limpar LaTeX de possíveis símbolos $ residuais e espaços
    String cleanLatex =
        latex
            .replaceAll(RegExp(r'^\$+|\$+$'), '')
            .replaceAll(RegExp(r'^\s*\$+|\$+\s*$'), '')
            .trim();

    // Verificar se contém múltiplas matrizes separadas por vírgula
    if (_containsMultipleMatrices(cleanLatex)) {
      return _buildMultipleMatrices(cleanLatex);
    }

    // Processar ambiente aligned
    if (cleanLatex.contains(r'\begin{aligned}') &&
        cleanLatex.contains(r'\end{aligned}')) {
      return _buildAlignedEnvironment(cleanLatex);
    }

    // Processar ambiente cases (sistema de equações)
    if (cleanLatex.contains(r'\begin{cases}') &&
        cleanLatex.contains(r'\end{cases}')) {
      return _buildCasesEnvironment(cleanLatex);
    }

    // Processar ambientes de matriz (pmatrix, bmatrix, matrix, vmatrix, Bmatrix)
    if (_containsMatrixEnvironment(cleanLatex)) {
      return _buildMatrixEnvironment(cleanLatex);
    }

    // Matemática display normal
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 12),
      padding: const EdgeInsets.all(12),
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.black.withAlpha(30),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.green.withAlpha(100), width: 1),
      ),
      child: Center(child: _buildMathExpression(cleanLatex)),
    );
  }

  /// Constrói ambiente aligned
  Widget _buildAlignedEnvironment(String latex) {
    // Extrair conteúdo do ambiente aligned
    final alignedRegex = RegExp(
      r'\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}',
    );
    final match = alignedRegex.firstMatch(latex);

    if (match == null) {
      return _buildDisplayMath(latex);
    }

    final alignedContent = match.group(1)!.trim();
    final lines =
        alignedContent
            .split(r'\\')
            .where((line) => line.trim().isNotEmpty)
            .toList();

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 12),
      padding: const EdgeInsets.all(12),
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.black.withAlpha(30),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.green.withAlpha(100), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children:
            lines.map((line) {
              // Dividir por & para alinhamento
              final parts = line.split('&');
              if (parts.length > 1) {
                return Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(
                      child: Container(
                        alignment: Alignment.centerRight,
                        child: _buildMathExpression(parts[0].trim()),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Container(
                        alignment: Alignment.centerLeft,
                        child: _buildMathExpression(parts.sublist(1).join('&')),
                      ),
                    ),
                  ],
                );
              } else {
                return Center(child: _buildMathExpression(line.trim()));
              }
            }).toList(),
      ),
    );
  }

  /// Constrói expressão matemática usando widgets Flutter
  Widget _buildMathExpression(String latex) {
    // Processar matriz inline (raro, mas suportado)
    if (_containsMatrixEnvironment(latex)) {
      return _buildMatrixEnvironment(latex);
    }
    // Verificar se contém múltiplos elementos complexos
    final hasFrac = latex.contains(r'\frac{');
    final hasSqrt = latex.contains(r'\sqrt{');
    final hasBar = latex.contains(r'\bar{');
    final hasLimit = latex.contains(r'\lim');
    final hasIntegral = latex.contains(r'\int') || latex.contains(r'\sum');

    // Processar limites com subscritos primeiro
    if (hasLimit) {
      return _buildLimitExpression(latex);
    }

    // Processar expressões complexas com múltiplos elementos
    if ((hasFrac && hasSqrt) ||
        (hasFrac && hasBar) ||
        (hasSqrt && hasBar) ||
        hasIntegral) {
      return _buildComplexExpression(latex);
    }

    // Processar frações
    if (hasFrac) {
      return _buildFractionExpression(latex);
    }

    // Processar raízes
    if (hasSqrt) {
      return _buildSqrtExpression(latex);
    }

    // Processar barras
    if (latex.contains(r'\bar{')) {
      return _buildBarExpression(latex);
    }

    // Expressão simples
    return _buildSimpleExpression(latex);
  }

  /// Detecta se string contém um ambiente de matriz LaTeX suportado
  bool _containsMatrixEnvironment(String latex) {
    final envs = ['pmatrix', 'bmatrix', 'matrix', 'vmatrix', 'Bmatrix'];
    for (final env in envs) {
      final regex = RegExp('\\\\begin\\{$env\\}([\\s\\S]*?)\\\\end\\{$env\\}');
      if (regex.hasMatch(latex)) return true;
    }
    return false;
  }

  /// Detecta se contém múltiplas matrizes separadas por vírgula
  bool _containsMultipleMatrices(String latex) {
    final envs = ['pmatrix', 'bmatrix', 'matrix', 'vmatrix', 'Bmatrix'];
    int matrixCount = 0;

    for (final env in envs) {
      final regex = RegExp('\\\\begin\\{$env\\}([\\s\\S]*?)\\\\end\\{$env\\}');
      matrixCount += regex.allMatches(latex).length;
    }

    return matrixCount > 1;
  }

  /// Constrói múltiplas matrizes na mesma linha
  Widget _buildMultipleMatrices(String latex) {
    final envs = ['pmatrix', 'bmatrix', 'matrix', 'vmatrix', 'Bmatrix'];
    final parts = <Widget>[];

    // Dividir por vírgulas e processar cada parte
    final segments = latex.split(',').map((s) => s.trim()).toList();

    for (int i = 0; i < segments.length; i++) {
      final segment = segments[i];

      // Verificar se é uma matriz
      bool isMatrix = false;
      for (final env in envs) {
        final regex = RegExp(
          '\\\\begin\\{$env\\}([\\s\\S]*?)\\\\end\\{$env\\}',
        );
        if (regex.hasMatch(segment)) {
          parts.add(_buildMatrixEnvironment(segment));
          isMatrix = true;
          break;
        }
      }

      // Se não é matriz, processar como expressão normal
      if (!isMatrix && segment.isNotEmpty) {
        parts.add(_buildMathExpression(segment));
      }

      // Adicionar vírgula entre elementos (exceto no último)
      if (i < segments.length - 1) {
        parts.add(
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(
              ',',
              style: TextStyle(
                fontSize: 18,
                color: Colors.green[200],
                fontFamily: 'monospace',
              ),
            ),
          ),
        );
      }
    }

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 12),
      padding: const EdgeInsets.all(12),
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.black.withAlpha(30),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.green.withAlpha(100), width: 1),
      ),
      child: Center(
        child: Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          children: parts,
        ),
      ),
    );
  }

  /// Constrói um ambiente de matriz (pmatrix/bmatrix/matrix/vmatrix/Bmatrix)
  Widget _buildMatrixEnvironment(String latex) {
    // Descobrir qual ambiente e extrair conteúdo interno
    final envOrder = ['pmatrix', 'bmatrix', 'matrix', 'vmatrix', 'Bmatrix'];
    String? envName;
    String? inner;
    for (final env in envOrder) {
      final regex = RegExp('\\\\begin\\{$env\\}([\\s\\S]*?)\\\\end\\{$env\\}');
      final match = regex.firstMatch(latex);
      if (match != null) {
        envName = env;
        inner = match.group(1);
        break;
      }
    }

    if (envName == null || inner == null) {
      // Fallback: renderização simples se não conseguir detectar corretamente
      return _buildSimpleExpression(latex);
    }

    // Quebrar em linhas por \\ e colunas por &
    final rowStrings =
        inner
            .split(RegExp(r'\\\\'))
            .map((s) => s.trim())
            .where((s) => s.isNotEmpty)
            .toList();

    final rows =
        rowStrings
            .map((row) => row.split('&').map((cell) => cell.trim()).toList())
            .toList();

    // Determinar número máximo de colunas
    final maxCols =
        rows.isNotEmpty
            ? rows.map((r) => r.length).reduce((a, b) => a > b ? a : b)
            : 0;

    // Construir tabela
    final tableRows = <TableRow>[];
    for (final r in rows) {
      final cells = <Widget>[];
      for (int c = 0; c < maxCols; c++) {
        final content = c < r.length ? r[c] : '';
        cells.add(
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            child: Center(child: _buildMathExpression(content)),
          ),
        );
      }
      tableRows.add(TableRow(children: cells));
    }

    // Escolher delimitadores externos
    final leftDelim = _matrixLeftDelimiter(envName);
    final rightDelim = _matrixRightDelimiter(envName);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withAlpha(30),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.green.withAlpha(100), width: 1),
      ),
      child: IntrinsicHeight(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Delimitador esquerdo ocupando toda a altura disponível
            _matrixBracket(leftDelim, Colors.green[200]!),
            const SizedBox(width: 8),
            // Tabela da matriz
            Table(
              defaultVerticalAlignment: TableCellVerticalAlignment.middle,
              columnWidths: {
                for (int i = 0; i < maxCols; i++)
                  i: const IntrinsicColumnWidth(),
              },
              children: tableRows,
            ),
            const SizedBox(width: 8),
            // Delimitador direito ocupando toda a altura disponível
            _matrixBracket(rightDelim, Colors.green[200]!),
          ],
        ),
      ),
    );
  }

  // Função helper local para desenhar delimitador com altura total
  Widget _matrixBracket(String type, Color color) {
    if (type.isEmpty) return const SizedBox.shrink();
    switch (type) {
      case '(':
        return Container(
          width: 12,
          decoration: BoxDecoration(
            border: Border(left: BorderSide(color: color, width: 3)),
          ),
        );
      case ')':
        return Container(
          width: 12,
          decoration: BoxDecoration(
            border: Border(right: BorderSide(color: color, width: 3)),
          ),
        );
      case '[':
        return Container(
          width: 14,
          decoration: BoxDecoration(
            border: Border(
              left: BorderSide(color: color, width: 3),
              top: BorderSide(color: color, width: 3),
              bottom: BorderSide(color: color, width: 3),
            ),
          ),
        );
      case ']':
        return Container(
          width: 14,
          decoration: BoxDecoration(
            border: Border(
              right: BorderSide(color: color, width: 3),
              top: BorderSide(color: color, width: 3),
              bottom: BorderSide(color: color, width: 3),
            ),
          ),
        );
      case '|':
        return Container(width: 6, color: color);
      case '{':
      case '}':
        return Row(
          children: [
            Container(width: 3, color: color),
            const SizedBox(width: 6),
            Container(width: 3, color: color),
          ],
        );
      default:
        return const SizedBox.shrink();
    }
  }

  String _matrixLeftDelimiter(String env) {
    // ✅ FORÇAR COLCHETES EM TODAS AS MATRIZES
    return '[';
  }

  String _matrixRightDelimiter(String env) {
    // ✅ FORÇAR COLCHETES EM TODAS AS MATRIZES
    return ']';
  }

  /// Constrói expressão com limites
  Widget _buildLimitExpression(String latex) {
    final widgets = <Widget>[];
    String remaining = latex;

    while (remaining.isNotEmpty) {
      // Procurar por limites com subscritos: \lim_{...} ou \limh \to 0
      final limitRegex = RegExp(
        r'\\lim_?\{([^}]+)\}|\\lim([h-z])\s*\\to\s*(\d+)',
      );
      final limitMatch = limitRegex.firstMatch(remaining);

      if (limitMatch != null) {
        // Texto antes do limite
        final before = remaining.substring(0, limitMatch.start);
        if (before.isNotEmpty) {
          widgets.add(_buildSimpleExpression(before));
        }

        // Construir limite com subscript
        String subscript;
        if (limitMatch.group(1) != null) {
          // Formato \lim_{...}
          subscript = limitMatch.group(1)!;
        } else {
          // Formato \limh \to 0
          final variable = limitMatch.group(2)!;
          final value = limitMatch.group(3)!;
          subscript = '$variable \\to $value';
        }
        widgets.add(_buildLimit(subscript));

        remaining = remaining.substring(limitMatch.end);
        continue;
      }

      // Procurar por limite simples: \lim
      final simpleLimitMatch = RegExp(r'\\lim(?!_)').firstMatch(remaining);
      if (simpleLimitMatch != null) {
        // Texto antes do limite
        final before = remaining.substring(0, simpleLimitMatch.start);
        if (before.isNotEmpty) {
          widgets.add(_buildSimpleExpression(before));
        }

        // Limite simples sem subscrito
        widgets.add(
          Text(
            'lim',
            style: TextStyle(
              fontSize: 18,
              color: Colors.green[200],
              fontFamily: 'monospace',
              fontWeight: FontWeight.bold,
            ),
          ),
        );

        remaining = remaining.substring(simpleLimitMatch.end);
        continue;
      }

      // Não há mais limites, processar o resto normalmente
      if (remaining.isNotEmpty) {
        // Verificar se contém frações ou raízes
        if (remaining.contains(r'\frac{') || remaining.contains(r'\sqrt{')) {
          widgets.add(_buildComplexExpression(remaining));
        } else {
          widgets.add(_buildSimpleExpression(remaining));
        }
      }
      break;
    }

    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: widgets,
    );
  }

  /// Constrói limite com subscrito visual
  Widget _buildLimit(String subscript) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // "lim" principal
          Text(
            'lim',
            style: TextStyle(
              fontSize: 18,
              color: Colors.green[200],
              fontFamily: 'monospace',
              fontWeight: FontWeight.bold,
            ),
          ),
          // Subscrito embaixo
          Text(
            _applySubSup(_processLatexSymbols(subscript)),
            style: TextStyle(
              fontSize: 14,
              color: Colors.green[200],
              fontFamily: 'monospace',
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  /// Constrói expressão complexa com frações e raízes
  Widget _buildComplexExpression(String latex) {
    final widgets = <Widget>[];
    String remaining = latex;

    while (remaining.isNotEmpty) {
      // Procurar por frações primeiro (têm precedência)
      final fracRegex = RegExp(
        r'\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}',
      );
      final fracMatch = fracRegex.firstMatch(remaining);

      // Procurar por raízes
      final sqrtRegex = RegExp(
        r'\\sqrt\{([^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*)\}',
      );
      final sqrtMatch = sqrtRegex.firstMatch(remaining);

      // Procurar por barras
      final barRegex = RegExp(r'\\bar\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}');
      final barMatch = barRegex.firstMatch(remaining);

      // Determinar qual vem primeiro
      final firstMatch = [
        if (fracMatch != null) (fracMatch, 'frac'),
        if (sqrtMatch != null) (sqrtMatch, 'sqrt'),
        if (barMatch != null) (barMatch, 'bar'),
      ]..sort((a, b) => a.$1.start.compareTo(b.$1.start));

      if (firstMatch.isNotEmpty) {
        final (match, type) = firstMatch.first;

        // Texto antes do match
        final before = remaining.substring(0, match.start);
        if (before.isNotEmpty) {
          widgets.add(_buildSimpleExpression(before));
        }

        // Processar baseado no tipo
        switch (type) {
          case 'frac':
            final numerator = match.group(1)!;
            final denominator = match.group(2)!;
            widgets.add(_buildFraction(numerator, denominator));
            break;
          case 'sqrt':
            final content = match.group(1)!;
            widgets.add(_buildSqrt(content));
            break;
          case 'bar':
            final content = match.group(1)!;
            widgets.add(_buildBar(content));
            break;
        }

        remaining = remaining.substring(match.end);
      } else {
        // Não há mais elementos especiais
        if (remaining.isNotEmpty) {
          widgets.add(_buildSimpleExpression(remaining));
        }
        break;
      }
    }

    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: widgets,
    );
  }

  /// Constrói expressão com frações
  Widget _buildFractionExpression(String latex) {
    final widgets = <Widget>[];
    String remaining = latex;

    while (remaining.isNotEmpty) {
      // Procurar por frações
      final fracRegex = RegExp(
        r'\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}',
      );
      final match = fracRegex.firstMatch(remaining);

      if (match != null) {
        // Texto antes da fração
        final before = remaining.substring(0, match.start);
        if (before.isNotEmpty) {
          widgets.add(_buildSimpleExpression(before));
        }

        // Construir fração
        final numerator = match.group(1)!;
        final denominator = match.group(2)!;
        widgets.add(_buildFraction(numerator, denominator));

        remaining = remaining.substring(match.end);
      } else {
        // Não há mais frações
        if (remaining.isNotEmpty) {
          widgets.add(_buildSimpleExpression(remaining));
        }
        break;
      }
    }

    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: widgets,
    );
  }

  /// Constrói fração visual
  Widget _buildFraction(String numerator, String denominator) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _buildMathExpression(numerator),
        Container(
          height: 1,
          width: 60,
          color: Colors.green[200],
          margin: const EdgeInsets.symmetric(vertical: 2),
        ),
        _buildMathExpression(denominator),
      ],
    );
  }

  /// Constrói expressão com barras
  Widget _buildBarExpression(String latex) {
    final widgets = <Widget>[];
    String remaining = latex;

    while (remaining.isNotEmpty) {
      // Procurar por barras: \bar{...}
      final barRegex = RegExp(r'\\bar\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}');
      final match = barRegex.firstMatch(remaining);

      if (match != null) {
        // Texto antes da barra
        final before = remaining.substring(0, match.start);
        if (before.isNotEmpty) {
          widgets.add(_buildSimpleExpression(before));
        }

        // Construir barra
        final content = match.group(1)!;
        widgets.add(_buildBar(content));

        remaining = remaining.substring(match.end);
        continue;
      }

      // Não há mais barras
      if (remaining.isNotEmpty) {
        widgets.add(_buildSimpleExpression(remaining));
      }
      break;
    }

    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: widgets,
    );
  }

  /// Constrói expressão com raízes
  Widget _buildSqrtExpression(String latex) {
    final widgets = <Widget>[];
    String remaining = latex;

    while (remaining.isNotEmpty) {
      // Procurar por raízes (melhorado para detectar aninhamento)
      final sqrtRegex = RegExp(
        r'\\sqrt\{([^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*)\}',
      );
      final match = sqrtRegex.firstMatch(remaining);

      if (match != null) {
        // Texto antes da raiz
        final before = remaining.substring(0, match.start);
        if (before.isNotEmpty) {
          widgets.add(_buildSimpleExpression(before));
        }

        // Construir raiz
        final content = match.group(1)!;
        widgets.add(_buildSqrt(content));

        remaining = remaining.substring(match.end);
      } else {
        // Não há mais raízes
        if (remaining.isNotEmpty) {
          widgets.add(_buildSimpleExpression(remaining));
        }
        break;
      }
    }

    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: widgets,
    );
  }

  /// Constrói barra visual sobre variável
  Widget _buildBar(String content) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 2),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Linha superior (barra)
          Container(
            height: 1.5,
            width: _calculateBarWidth(content),
            color: Colors.green[200],
            margin: const EdgeInsets.only(bottom: 1),
          ),
          // Conteúdo embaixo da barra
          _buildSimpleExpression(content),
        ],
      ),
    );
  }

  /// Calcula largura da barra baseada no conteúdo
  double _calculateBarWidth(String content) {
    // Estimativa baseada no comprimento do conteúdo
    final baseWidth = content.length * 12.0;
    return baseWidth < 20 ? 20 : baseWidth;
  }

  /// Constrói raiz quadrada visual
  Widget _buildSqrt(String content) {
    return _SqrtWidget(
      color: Colors.green[200]!,
      child: _buildMathExpression(content),
    );
  }

  /// Constrói sistema de equações com \begin{cases}...\end{cases}
  Widget _buildCasesEnvironment(String latex) {
    final casesRegex = RegExp(
      r'\\begin\{cases\}([\s\S]*?)\\end\{cases\}',
    );
    final match = casesRegex.firstMatch(latex);
    if (match == null) return _buildSimpleExpression(latex);

    final inner = match.group(1)!.trim();
    final lines = inner
        .split(RegExp(r'\\\\'))
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .toList();

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.black.withAlpha(30),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.green.withAlpha(100), width: 1),
      ),
      child: IntrinsicHeight(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Chave esquerda { abrangendo todas as linhas
            CustomPaint(
              painter: _LeftBracePainter(color: Colors.green[200]!),
              child: const SizedBox(width: 12),
            ),
            const SizedBox(width: 12),
            // Linhas do sistema
            Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: lines
                  .map(
                    (line) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: _buildMathExpression(line),
                    ),
                  )
                  .toList(),
            ),
          ],
        ),
      ),
    );
  }

  /// Constrói expressão simples
  Widget _buildSimpleExpression(String latex) {
    String processed = _processLatexSymbols(latex);
    processed = _applySubSup(processed);

    return Text(
      processed,
      style: TextStyle(
        fontSize: 18,
        color: Colors.green[200],
        fontFamily: 'monospace',
        fontWeight: FontWeight.bold,
      ),
    );
  }

  /// Processa símbolos LaTeX para Unicode
  String _processLatexSymbols(String latex) {
    // Primeiro, limpar possíveis símbolos $ residuais
    String cleaned = latex.replaceAll(RegExp(r'\$'), '');

    return cleaned
        // Setas
        .replaceAll(r'\Rightarrow', '⇒')
        .replaceAll(r'\Leftarrow', '⇐')
        .replaceAll(r'\Leftrightarrow', '⇔')
        .replaceAll(r'\rightarrow', '→')
        .replaceAll(r'\leftarrow', '←')
        // Operadores
        .replaceAll(r'\pm', '±')
        .replaceAll(r'\mp', '∓')
        .replaceAll(r'\cdot', '·')
        .replaceAll(r'\times', '×')
        .replaceAll(r'\div', '÷')
        .replaceAll(r'\neq', '≠')
        .replaceAll(r'\leq', '≤')
        .replaceAll(r'\geq', '≥')
        .replaceAll(r'\approx', '≈')
        .replaceAll(r'\equiv', '≡')
        .replaceAll(r'\infty', '∞')
        // Letras gregas
        .replaceAll(r'\alpha', 'α')
        .replaceAll(r'\beta', 'β')
        .replaceAll(r'\gamma', 'γ')
        .replaceAll(r'\delta', 'δ')
        .replaceAll(r'\epsilon', 'ε')
        .replaceAll(r'\theta', 'θ')
        .replaceAll(r'\lambda', 'λ')
        .replaceAll(r'\mu', 'μ')
        .replaceAll(r'\pi', 'π')
        .replaceAll(r'\sigma', 'σ')
        .replaceAll(r'\phi', 'φ')
        .replaceAll(r'\omega', 'ω')
        // Pontos e reticências
        .replaceAll(r'\dots', '…')
        .replaceAll(r'\ldots', '…')
        .replaceAll(r'\cdots', '⋯')
        .replaceAll(r'\vdots', '⋮')
        .replaceAll(r'\ddots', '⋱')
        // Integrais e cálculo
        .replaceAll(r'\int', '∫')
        .replaceAll(r'\iint', '∬')
        .replaceAll(r'\iiint', '∭')
        .replaceAll(r'\oint', '∮')
        .replaceAll(r'\sum', '∑')
        .replaceAll(r'\prod', '∏')
        .replaceAll(r'\to', '→')
        .replaceAll(r'\infty', '∞')
        // Conjuntos e intervalos
        .replaceAll(r'\in', '∈')
        .replaceAll(r'\notin', '∉')
        .replaceAll(r'\subset', '⊂')
        .replaceAll(r'\supset', '⊃')
        .replaceAll(r'\subseteq', '⊆')
        .replaceAll(r'\supseteq', '⊇')
        .replaceAll(r'\cup', '∪')
        .replaceAll(r'\cap', '∩')
        .replaceAll(r'\emptyset', '∅')
        .replaceAll(r'\varnothing', '∅')
        // Símbolos especiais
        .replaceAll(r'\partial', '∂')
        .replaceAll(r'\nabla', '∇')
        .replaceAll(r'\Delta', 'Δ')
        .replaceAll(r'\delta', 'δ')
        // Comandos de formatação
        .replaceAll(r'\left(', '(')
        .replaceAll(r'\right)', ')')
        .replaceAll(r'\left[', '[')
        .replaceAll(r'\right]', ']')
        .replaceAll(r'\left\{', '{')
        .replaceAll(r'\right\}', '}')
        // Intervalos matemáticos
        .replaceAll(r'\[', '[')
        .replaceAll(r'\]', ']')
        .replaceAll(r'\{', '{')
        .replaceAll(r'\}', '}')
        // Espaçamentos
        .replaceAll(r'\quad', '    ') // 4 espaços
        .replaceAll(r'\qquad', '        ') // 8 espaços
        .replaceAll(r'\,', ' ') // espaço pequeno
        .replaceAll(r'\;', '  ') // espaço médio
        .replaceAll(r'\!', '') // espaço negativo (remove)
        // Asterisco para multiplicação
        .replaceAll(r'\*', '×');
  }

  /// Aplica subscritos e superscritos
  String _applySubSup(String text) {
    // Primeiro, processar underscores e circunflexos escapados
    text = text.replaceAll(r'\_', '_').replaceAll(r'\^', '^');
    // Mapeamento para subscritos
    final subMap = {
      '0': '₀',
      '1': '₁',
      '2': '₂',
      '3': '₃',
      '4': '₄',
      '5': '₅',
      '6': '₆',
      '7': '₇',
      '8': '₈',
      '9': '₉',
      '+': '₊',
      '-': '₋',
      '=': '₌',
      '(': '₍',
      ')': '₎',
      'a': 'ₐ',
      'e': 'ₑ',
      'i': 'ᵢ',
      'o': 'ₒ',
      'u': 'ᵤ',
      'x': 'ₓ',
      'n': 'ₙ',
      'r': 'ᵣ',
      's': 'ₛ',
      't': 'ₜ',
    };

    // Mapeamento para superscritos
    final supMap = {
      '0': '⁰',
      '1': '¹',
      '2': '²',
      '3': '³',
      '4': '⁴',
      '5': '⁵',
      '6': '⁶',
      '7': '⁷',
      '8': '⁸',
      '9': '⁹',
      '+': '⁺',
      '-': '⁻',
      '=': '⁼',
      '(': '⁽',
      ')': '⁾',
      'a': 'ᵃ',
      'b': 'ᵇ',
      'c': 'ᶜ',
      'd': 'ᵈ',
      'e': 'ᵉ',
      'f': 'ᶠ',
      'g': 'ᵍ',
      'h': 'ʰ',
      'i': 'ⁱ',
      'j': 'ʲ',
      'k': 'ᵏ',
      'l': 'ˡ',
      'm': 'ᵐ',
      'n': 'ⁿ',
      'o': 'ᵒ',
      'p': 'ᵖ',
      'r': 'ʳ',
      's': 'ˢ',
      't': 'ᵗ',
      'u': 'ᵘ',
      'v': 'ᵛ',
      'w': 'ʷ',
      'x': 'ˣ',
      'y': 'ʸ',
      'z': 'ᶻ',
    };

    // Processar subscritos _{...}
    text = text.replaceAllMapped(RegExp(r'_\{([^}]+)\}'), (match) {
      final content = match.group(1)!;
      return content.split('').map((char) => subMap[char] ?? char).join();
    });

    // Processar superscritos ^{...}
    text = text.replaceAllMapped(RegExp(r'\^\{([^}]+)\}'), (match) {
      final content = match.group(1)!;
      return content.split('').map((char) => supMap[char] ?? char).join();
    });

    // Processar subscritos simples _x
    text = text.replaceAllMapped(RegExp(r'_(\w)'), (match) {
      final char = match.group(1)!;
      return subMap[char] ?? char;
    });

    // Processar superscritos simples ^x
    text = text.replaceAllMapped(RegExp(r'\^(\w)'), (match) {
      final char = match.group(1)!;
      return supMap[char] ?? char;
    });

    return text;
  }

  /// Constrói conteúdo misto (texto + matemática inline)
  Widget _buildMixedContent(String line) {
    final parts = <Widget>[];
    final regex = RegExp(r'\$([^$]+)\$');
    int lastEnd = 0;

    for (final match in regex.allMatches(line)) {
      // Texto antes da matemática
      if (match.start > lastEnd) {
        final textBefore = line.substring(lastEnd, match.start);
        if (textBefore.isNotEmpty) {
          parts.add(_buildFormattedText(textBefore));
        }
      }

      // Matemática inline
      parts.add(
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
          decoration: BoxDecoration(
            color: Colors.green.withAlpha(30),
            borderRadius: BorderRadius.circular(4),
          ),
          child: _buildMathExpression(match.group(1)!),
        ),
      );

      lastEnd = match.end;
    }

    // Texto após a última matemática
    if (lastEnd < line.length) {
      final textAfter = line.substring(lastEnd);
      if (textAfter.isNotEmpty) {
        parts.add(_buildFormattedText(textAfter));
      }
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        children: parts,
      ),
    );
  }

  /// Constrói texto com formatação (negrito entre ** **)
  Widget _buildFormattedText(String text) {
    // Processar texto para melhor espaçamento
    String processedText = _improveTextSpacing(text);

    final regex = RegExp(r'\*\*([^*]+)\*\*');
    final widgets = <Widget>[];

    int lastIndex = 0;
    for (final match in regex.allMatches(processedText)) {
      // Texto antes do negrito
      if (match.start > lastIndex) {
        final before = processedText.substring(lastIndex, match.start);
        if (before.isNotEmpty) {
          widgets.add(
            Text(
              before,
              style:
                  textStyle ??
                  TextStyle(fontSize: 16, color: Colors.white, height: 1.5),
            ),
          );
        }
      }

      // Texto em negrito
      final boldText = match.group(1)!;
      widgets.add(
        Text(
          boldText,
          style: (textStyle ??
                  TextStyle(fontSize: 16, color: Colors.white, height: 1.5))
              .copyWith(fontWeight: FontWeight.bold),
        ),
      );

      lastIndex = match.end;
    }

    // Texto após o último negrito
    if (lastIndex < processedText.length) {
      final after = processedText.substring(lastIndex);
      if (after.isNotEmpty) {
        widgets.add(
          Text(
            after,
            style:
                textStyle ??
                TextStyle(fontSize: 16, color: Colors.white, height: 1.5),
          ),
        );
      }
    }

    // Se não há formatação, retornar texto simples
    if (widgets.isEmpty) {
      return Text(
        processedText,
        style:
            textStyle ??
            TextStyle(fontSize: 16, color: Colors.white, height: 1.5),
      );
    }

    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: widgets,
    );
  }

  /// Melhora o espaçamento do texto para evitar que fique "colado"
  String _improveTextSpacing(String text) {
    // Adicionar espaços após números seguidos de ponto e vírgula
    text = text.replaceAllMapped(RegExp(r'(\d+)([.,])([A-Za-z])'), (match) {
      return '${match.group(1)}${match.group(2)} ${match.group(3)}';
    });

    // Adicionar espaços após números seguidos de texto
    text = text.replaceAllMapped(RegExp(r'(\d+)([A-Za-z])'), (match) {
      return '${match.group(1)} ${match.group(2)}';
    });

    // Adicionar espaços antes de números que começam parágrafos
    text = text.replaceAllMapped(RegExp(r'([.!?])(\d+)'), (match) {
      return '${match.group(1)} ${match.group(2)}';
    });

    // Adicionar espaços após operações matemáticas
    text = text.replaceAllMapped(RegExp(r'([=+\-*/])([A-Za-z])'), (match) {
      return '${match.group(1)} ${match.group(2)}';
    });

    // ✅ CORREÇÕES ESPECÍFICAS PARA O PROBLEMA:

    // Corrigir "2. Substituímos" -> "2. Substituímos" (espaço após número + ponto)
    text = text.replaceAllMapped(RegExp(r'(\d+)\.([A-Z])'), (match) {
      return '${match.group(1)}. ${match.group(2)}';
    });

    // Corrigir "34$### Resposta final" -> "34$ ### Resposta final"
    text = text.replaceAllMapped(RegExp(r'(\d+)\$###'), (match) {
      return '${match.group(1)}\$ ###';
    });

    // Corrigir "37-$37-3" -> "37 - $37-3" (espaço antes de operação matemática)
    text = text.replaceAllMapped(RegExp(r'(\d+)([+\-*/])(\d+)'), (match) {
      return '${match.group(1)} ${match.group(2)} ${match.group(3)}';
    });

    // Corrigir "12-$6" -> "12 - $6" (espaço antes de operação com $)
    text = text.replaceAllMapped(RegExp(r'(\d+)-(\$\d+)'), (match) {
      return '${match.group(1)} - ${match.group(2)}';
    });

    // Corrigir "3$2." -> "3$ 2." (espaço após $ seguido de número)
    text = text.replaceAllMapped(RegExp(r'(\d+)\$(\d+)'), (match) {
      return '${match.group(1)}\$ ${match.group(2)}';
    });

    return text;
  }

  /// Verifica se a linha é um header
  bool _isHeader(String line) {
    final trimmed = line.trim();
    return trimmed.startsWith('#### ') ||
        trimmed.startsWith('### ') ||
        trimmed.startsWith('## ') ||
        trimmed.startsWith('# ');
  }

  /// Constrói header baseado no nível
  Widget _buildHeader(String line) {
    final trimmed = line.trim();

    if (trimmed.startsWith('#### ')) {
      return _buildSubsectionHeader(trimmed.substring(5));
    } else if (trimmed.startsWith('### ')) {
      return _buildSectionHeader(trimmed.substring(4));
    } else if (trimmed.startsWith('## ')) {
      return _buildSubsectionHeader(trimmed.substring(3));
    } else if (trimmed.startsWith('# ')) {
      return _buildMainHeader(trimmed.substring(2));
    }

    return _buildText(line);
  }

  /// Separa o prefixo de texto de uma linha de cabeçalho de qualquer LaTeX inline.
  /// Ex: "Resposta final$x = 5$" → label="Resposta final", math="x = 5"
  ({String label, String? inlineMath}) _splitHeaderMath(String text) {
    final dollarIdx = text.indexOf(r'$');
    if (dollarIdx == -1) return (label: text, inlineMath: null);

    final label = text.substring(0, dollarIdx).trim();
    final rest = text.substring(dollarIdx);
    // "rest" pode ser "$x = 5$" ou "$x = 5$ texto extra" — captura o bloco inteiro
    return (label: label, inlineMath: rest);
  }

  /// Constrói header de seção (### )
  Widget _buildSectionHeader(String text) {
    final isFinalAnswer = text.toLowerCase().contains('resposta final');
    final (:label, :inlineMath) = _splitHeaderMath(text);

    final titleStyle = TextStyle(
      fontSize: isFinalAnswer ? 22 : 20,
      fontWeight: FontWeight.bold,
      color: isFinalAnswer ? Colors.green[100] : Colors.green[200],
    );

    Widget titleWidget;
    if (inlineMath != null) {
      titleWidget = Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          if (label.isNotEmpty)
            Text(label, style: titleStyle),
          if (label.isNotEmpty) const SizedBox(width: 6),
          _buildMixedContent(inlineMath),
        ],
      );
    } else {
      titleWidget = Text(text, style: titleStyle);
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Container(
        padding: isFinalAnswer ? const EdgeInsets.all(12) : EdgeInsets.zero,
        decoration: isFinalAnswer
            ? BoxDecoration(
                color: Colors.green.withAlpha(30),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: Colors.green.withAlpha(100),
                  width: 1,
                ),
              )
            : null,
        child: titleWidget,
      ),
    );
  }

  /// Constrói header de subseção (## ou #### )
  Widget _buildSubsectionHeader(String text) {
    final (:label, :inlineMath) = _splitHeaderMath(text);

    final style = TextStyle(
      fontSize: 18,
      fontWeight: FontWeight.bold,
      color: Colors.green[200],
    );

    Widget titleWidget;
    if (inlineMath != null) {
      titleWidget = Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          if (label.isNotEmpty) Text(label, style: style),
          if (label.isNotEmpty) const SizedBox(width: 6),
          _buildMixedContent(inlineMath),
        ],
      );
    } else {
      titleWidget = Text(text, style: style);
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: titleWidget,
    );
  }

  /// Constrói header principal (# )
  Widget _buildMainHeader(String text) {
    final (:label, :inlineMath) = _splitHeaderMath(text);

    final style = TextStyle(
      fontSize: 22,
      fontWeight: FontWeight.bold,
      color: Colors.green[200],
    );

    Widget titleWidget;
    if (inlineMath != null) {
      titleWidget = Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          if (label.isNotEmpty) Text(label, style: style),
          if (label.isNotEmpty) const SizedBox(width: 6),
          _buildMixedContent(inlineMath),
        ],
      );
    } else {
      titleWidget = Text(text, style: style);
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: titleWidget,
    );
  }

  /// Constrói texto normal
  Widget _buildText(String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: _buildFormattedText(text),
    );
  }
}

/// Widget que desenha √ com o traço superior alinhado ao conteúdo
class _SqrtWidget extends StatelessWidget {
  final Widget child;
  final Color color;

  const _SqrtWidget({required this.child, required this.color});

  @override
  Widget build(BuildContext context) {
    return IntrinsicWidth(
      child: IntrinsicHeight(
        child: CustomPaint(
          painter: _SqrtPainter(color: color),
          child: Padding(
            padding: const EdgeInsets.only(
              left: 22,
              top: 6,
              right: 4,
              bottom: 2,
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// Desenha o símbolo √ com traço horizontal exatamente do tamanho do widget
class _SqrtPainter extends CustomPainter {
  final Color color;
  const _SqrtPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2.0
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final h = size.height;
    final w = size.width;

    final path = Path()
      ..moveTo(0, h * 0.55)
      ..lineTo(6, h * 0.78)
      ..lineTo(16, 3)
      ..lineTo(w, 3);

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(_SqrtPainter old) => old.color != color;
}

/// Desenha uma chave esquerda { que se estende por toda a altura disponível.
class _LeftBracePainter extends CustomPainter {
  final Color color;
  const _LeftBracePainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2.0
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final w = size.width;
    final h = size.height;
    final mid = h / 2;
    const curveSize = 6.0;

    final path = Path()
      ..moveTo(w * 0.9, mid)
      ..quadraticBezierTo(w * 0.3, mid - 2, w * 0.3, mid - curveSize)
      ..lineTo(w * 0.3, curveSize)
      ..quadraticBezierTo(w * 0.3, 0, w * 0.8, 0)
      ..moveTo(w * 0.9, mid)
      ..quadraticBezierTo(w * 0.3, mid + 2, w * 0.3, mid + curveSize)
      ..lineTo(w * 0.3, h - curveSize)
      ..quadraticBezierTo(w * 0.3, h, w * 0.8, h);

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(_LeftBracePainter old) => old.color != color;
}
