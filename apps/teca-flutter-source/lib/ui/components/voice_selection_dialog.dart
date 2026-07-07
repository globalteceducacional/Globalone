import 'package:flutter/material.dart';
import 'dart:math';
import 'dart:io';

class VoiceSelectionDialog extends StatefulWidget {
  final String selectedVoice;
  final List<Map<String, dynamic>> availableVoices;
  final Function(String) onVoiceChanged;
  final bool isLoading;

  const VoiceSelectionDialog({
    super.key,
    required this.selectedVoice,
    required this.availableVoices,
    required this.onVoiceChanged,
    required this.isLoading,
  });

  @override
  State<VoiceSelectionDialog> createState() => _VoiceSelectionDialogState();
}

class _VoiceSelectionDialogState extends State<VoiceSelectionDialog> {
  String? hoveredVoice;

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final isLandscape = mediaQuery.size.width > mediaQuery.size.height;
    final screenWidth = mediaQuery.size.width;
    final screenHeight = mediaQuery.size.height;
    final isMobile = screenWidth < 600;

    return Dialog(
      backgroundColor: Color(0xFF112B3C),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        width: isMobile ? screenWidth * 0.95 : (isLandscape ? 600 : 400),
        constraints: BoxConstraints(
          maxHeight: screenHeight * 0.9,
          maxWidth: screenWidth * 0.95,
        ),
        padding: EdgeInsets.all(isMobile ? 16 : 24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Escolha uma Personalidade',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: isMobile ? 18 : (isLandscape ? 24 : 20),
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              if (widget.isLoading) _buildLoadingWarning(),
              SizedBox(height: isMobile ? 16 : (isLandscape ? 32 : 24)),
              _buildVoiceGrid(context, isLandscape, isMobile),
              SizedBox(height: 16),
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(
                  'Fechar',
                  style: TextStyle(color: Colors.cyanAccent, fontSize: 16),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLoadingWarning() {
    return Container(
      margin: EdgeInsets.only(top: 8),
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.orange.withAlpha(100),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.orange, width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.info_outline, color: Colors.orange, size: 16),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'Aguarde a resposta da IA antes de trocar de personagem',
              style: TextStyle(
                color: Colors.orange,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVoiceGrid(
    BuildContext context,
    bool isLandscape,
    bool isMobile,
  ) {
    final screenWidth = MediaQuery.of(context).size.width;
    final availableWidth =
        isMobile ? screenWidth * 0.8 : (isLandscape ? 500 : 350);

    // Calcular tamanho dos hexágonos baseado na largura disponível
    double hexSize;
    double spacing;

    if (isMobile) {
      hexSize = (availableWidth / 3) * 0.8; // 3 hexágonos por linha, com margem
      spacing = 8;
    } else if (isLandscape) {
      hexSize = 140;
      spacing = 25;
    } else {
      hexSize = 120;
      spacing = 20;
    }

    return SizedBox(
      width: double.infinity,
      child: Column(
        children: [
          // Primeira linha: 2 hexágonos (superior)
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _buildImageHexagon(
                context: context,
                voice: widget.availableVoices[1],
                isSelected:
                    widget.availableVoices[1]['name'] == widget.selectedVoice,
                onTap: () {
                  widget.onVoiceChanged(widget.availableVoices[1]['name']);
                  Navigator.of(context).pop();
                },
                size: hexSize,
              ),
              SizedBox(width: spacing),
              _buildImageHexagon(
                context: context,
                voice: widget.availableVoices[2],
                isSelected:
                    widget.availableVoices[2]['name'] == widget.selectedVoice,
                onTap: () {
                  widget.onVoiceChanged(widget.availableVoices[2]['name']);
                  Navigator.of(context).pop();
                },
                size: hexSize,
              ),
            ],
          ),
          SizedBox(height: 4),
          // Segunda linha: 3 hexágonos (meio - com Teca central)
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _buildImageHexagon(
                context: context,
                voice: widget.availableVoices[3],
                isSelected:
                    widget.availableVoices[3]['name'] == widget.selectedVoice,
                onTap: () {
                  widget.onVoiceChanged(widget.availableVoices[3]['name']);
                  Navigator.of(context).pop();
                },
                size: hexSize,
              ),
              SizedBox(width: spacing * 0.4),
              // Hexágono central (Teca) - maior
              _buildImageHexagon(
                context: context,
                voice: widget.availableVoices[0],
                isSelected:
                    widget.availableVoices[0]['name'] == widget.selectedVoice,
                onTap: () {
                  widget.onVoiceChanged(widget.availableVoices[0]['name']);
                  Navigator.of(context).pop();
                },
                size: hexSize * (isMobile ? 1.1 : 1.2), // Teca é maior
              ),
              SizedBox(width: spacing * 0.4),
              _buildImageHexagon(
                context: context,
                voice: widget.availableVoices[4],
                isSelected:
                    widget.availableVoices[4]['name'] == widget.selectedVoice,
                onTap: () {
                  widget.onVoiceChanged(widget.availableVoices[4]['name']);
                  Navigator.of(context).pop();
                },
                size: hexSize,
              ),
            ],
          ),
          SizedBox(height: 4),
          // Terceira linha: 2 hexágonos (inferior)
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _buildImageHexagon(
                context: context,
                voice: widget.availableVoices[5],
                isSelected:
                    widget.availableVoices[5]['name'] == widget.selectedVoice,
                onTap: () {
                  widget.onVoiceChanged(widget.availableVoices[5]['name']);
                  Navigator.of(context).pop();
                },
                size: hexSize,
              ),
              SizedBox(width: spacing),
              _buildImageHexagon(
                context: context,
                voice: widget.availableVoices[6],
                isSelected:
                    widget.availableVoices[6]['name'] == widget.selectedVoice,
                onTap: () {
                  widget.onVoiceChanged(widget.availableVoices[6]['name']);
                  Navigator.of(context).pop();
                },
                size: hexSize,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildImageHexagon({
    required BuildContext context,
    required Map<String, dynamic> voice,
    required bool isSelected,
    required VoidCallback onTap,
    double size = 80,
  }) {
    final voiceName = voice['name'] as String;
    final isHovered = hoveredVoice == voiceName;
    final isDesktop = !Platform.isAndroid && !Platform.isIOS;

    Widget hexagonWidget = AnimatedContainer(
      duration: Duration(milliseconds: 200),
      transform:
          isHovered && !isSelected
              ? Matrix4.translationValues(0, -8, 0)
              : Matrix4.translationValues(0, 0, 0),
      child: GestureDetector(
        onTap: onTap,
        child: SizedBox(
          width: size,
          height: size,
          child: CustomPaint(
            painter: HexagonPainter(
              isSelected: isSelected,
              isHovered: isHovered && !isSelected,
              strokeColor:
                  isSelected
                      ? Colors.cyan
                      : isHovered
                      ? Colors.blue
                      : Colors.grey.withAlpha(100),
              fillColor:
                  isSelected
                      ? Colors.cyan.withAlpha(50)
                      : isHovered
                      ? Colors.blue.withAlpha(30)
                      : Color(0xFF0B2233).withAlpha(100),
              strokeWidth:
                  isSelected
                      ? 3
                      : isHovered
                      ? 2
                      : 1,
            ),
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SizedBox(
                    width: size * 0.6,
                    height: size * 0.6,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(size * 0.3),
                      child: Image.asset(
                        voice['imagePath'],
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) {
                          return Container(
                            decoration: BoxDecoration(
                              color: Colors.grey.withAlpha(100),
                              borderRadius: BorderRadius.circular(size * 0.3),
                            ),
                            child: Icon(
                              Icons.person,
                              size: size * 0.3,
                              color: Colors.white,
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    voice['displayName'],
                    style: TextStyle(
                      color:
                          isSelected
                              ? Colors.cyan
                              : isHovered
                              ? Colors.blue
                              : Colors.white,
                      fontSize: size < 80 ? size * 0.12 : size * 0.10,
                      fontWeight:
                          (isSelected || isHovered)
                              ? FontWeight.bold
                              : FontWeight.w500,
                    ),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );

    // Adicionar MouseRegion apenas em desktop
    if (isDesktop) {
      return MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) {
          setState(() {
            hoveredVoice = voiceName;
          });
        },
        onExit: (_) {
          setState(() {
            hoveredVoice = null;
          });
        },
        child: hexagonWidget,
      );
    }

    return hexagonWidget;
  }
}

class HexagonPainter extends CustomPainter {
  final bool isSelected;
  final bool isHovered;
  final Color strokeColor;
  final Color fillColor;
  final double strokeWidth;

  HexagonPainter({
    required this.isSelected,
    this.isHovered = false,
    required this.strokeColor,
    required this.fillColor,
    required this.strokeWidth,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint =
        Paint()
          ..color = fillColor
          ..style = PaintingStyle.fill;

    final strokePaint =
        Paint()
          ..color = strokeColor
          ..style = PaintingStyle.stroke
          ..strokeWidth = strokeWidth;

    final path = Path();
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width / 2) * 1.1;

    // Desenhar hexágono
    for (int i = 0; i < 6; i++) {
      final angle = (i * 60 - 30) * (pi / 180);
      final x = center.dx + radius * cos(angle);
      final y = center.dy + radius * sin(angle);

      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    path.close();

    // Preencher e desenhar borda
    canvas.drawPath(path, paint);
    canvas.drawPath(path, strokePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
