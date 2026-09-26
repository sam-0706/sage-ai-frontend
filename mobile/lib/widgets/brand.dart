import 'package:flutter/material.dart';

import '../core/theme.dart';

/// The SAGE mark: an ascending path from action to growth (matches the desktop icon).
class SageMark extends StatelessWidget {
  const SageMark({super.key, this.size = 40});
  final double size;
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(size * .28),
          gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF2A1F5C), Color(0xFF120F24)]),
          boxShadow: [BoxShadow(color: SageColors.violet.withValues(alpha: .35), blurRadius: size * .5, offset: Offset(0, size * .15))],
        ),
        child: CustomPaint(painter: _MarkPainter()),
      );
}

class _MarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size s) {
    final w = s.width;
    final path = Path()
      ..moveTo(w * .29, w * .67)
      ..cubicTo(w * .41, w * .67, w * .46, w * .55, w * .55, w * .49)
      ..cubicTo(w * .63, w * .43, w * .67, w * .38, w * .71, w * .31);
    canvas.drawPath(
        path,
        Paint()
          ..shader = const LinearGradient(colors: [Color(0xFF7C5CFF), Color(0xFFC4B5FD)]).createShader(Offset.zero & s)
          ..style = PaintingStyle.stroke
          ..strokeWidth = w * .075
          ..strokeCap = StrokeCap.round);
    canvas.drawCircle(Offset(w * .29, w * .67), w * .06, Paint()..color = const Color(0xFFA78BFA));
    final head = Path()
      ..moveTo(w * .77, w * .20)
      ..lineTo(w * .78, w * .34)
      ..lineTo(w * .65, w * .28)
      ..close();
    canvas.drawPath(head, Paint()..color = const Color(0xFFEDE9FE));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.light = false});
  final bool light;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        const SageMark(size: 30),
        const SizedBox(width: 10),
        Text('SAGE', style: SageText.display(19, color: light ? Colors.white : SageColors.ink)),
        Text(' AI', style: SageText.display(19, color: SageColors.violet)),
      ]);
}
