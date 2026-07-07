import 'package:flutter/material.dart';

class LoadingIndicator extends StatelessWidget {
  final DateTime? loadingStartTime;
  final String? loadingText;
  final Color? color;
  final double? size;

  const LoadingIndicator({
    super.key,
    this.loadingStartTime,
    this.loadingText,
    this.color,
    this.size,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          width: size ?? 24,
          height: size ?? 24,
          child: CircularProgressIndicator(
            color: color ?? Colors.cyanAccent,
            strokeWidth: 2,
          ),
        ),
        if (loadingText != null) ...[
          SizedBox(height: 8),
          Text(
            loadingText!,
            style: TextStyle(
              color: (color ?? Colors.cyanAccent).withAlpha(150),
              fontSize: 12,
            ),
          ),
        ],
        if (loadingStartTime != null) ...[
          SizedBox(height: 4),
          Text(
            '⏰ ${DateTime.now().difference(loadingStartTime!).inSeconds}s',
            style: TextStyle(
              color: (color ?? Colors.cyanAccent).withAlpha(150),
              fontSize: 12,
            ),
          ),
        ],
      ],
    );
  }
}

// Indicador de carregamento compacto para o header
class CompactLoadingIndicator extends StatelessWidget {
  final String text;
  final Color? color;

  const CompactLoadingIndicator({
    super.key,
    this.text = 'IA pensando...',
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            valueColor: AlwaysStoppedAnimation<Color>(color ?? Colors.orange),
          ),
        ),
        SizedBox(width: 4),
        Text(
          text,
          style: TextStyle(
            color: color ?? Colors.orange,
            fontSize: 10,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}
