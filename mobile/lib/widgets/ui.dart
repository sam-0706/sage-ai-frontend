import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme.dart';

// ---------------------------------------------------------------- surfaces
class SageCard extends StatelessWidget {
  const SageCard({super.key, required this.child, this.padding = const EdgeInsets.all(18), this.onTap, this.color, this.borderColor, this.radius = 22});
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final Color? color;
  final Color? borderColor;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radius),
      side: BorderSide(color: borderColor ?? SageColors.rule),
    );
    return Material(
      color: color ?? SageColors.card,
      shape: shape,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap == null
            ? null
            : () {
                HapticFeedback.selectionClick();
                onTap!();
              },
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

/// Ink hero surface with a soft violet bloom — the signature SAGE card.
class InkHero extends StatelessWidget {
  const InkHero({super.key, required this.child, this.padding = const EdgeInsets.all(22), this.onTap});
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const RadialGradient(
          center: Alignment(0.9, -1.1),
          radius: 1.35,
          colors: [Color(0xFF4B2BB0), SageColors.inkSoft, SageColors.ink],
          stops: [0, .45, 1],
        ),
        boxShadow: [BoxShadow(color: SageColors.violetDeep.withValues(alpha: .28), blurRadius: 40, offset: const Offset(0, 18))],
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(28),
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- type helpers
class Kicker extends StatelessWidget {
  const Kicker(this.text, {super.key, this.color = SageColors.violet, this.dot = true});
  final String text;
  final Color color;
  final bool dot;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        if (dot) ...[Container(width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle)), const SizedBox(width: 8)],
        Text(text.toUpperCase(), style: SageText.kicker(color: color)),
      ]);
}

class PageHeader extends StatelessWidget {
  const PageHeader({super.key, required this.kicker, required this.title, this.subtitle, this.trailing});
  final String kicker;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Kicker(kicker),
              const SizedBox(height: 10),
              Text(title, style: SageText.display(32)),
              if (subtitle != null) ...[const SizedBox(height: 6), Text(subtitle!, style: SageText.body(14, color: SageColors.muted))],
            ]),
          ),
          ?trailing,
        ]),
      );
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.action, this.onAction});
  final String text;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 22, bottom: 10),
        child: Row(children: [
          Expanded(child: Text(text, style: SageText.title(18))),
          if (action != null) TextButton(onPressed: onAction, child: Text(action!, style: SageText.body(13, color: SageColors.violet, weight: FontWeight.w700))),
        ]),
      );
}

// ---------------------------------------------------------------- pills & chips
enum Tone { violet, lime, coral, mint, amber, neutral, ink }

class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, this.tone = Tone.neutral, this.icon});
  final String text;
  final Tone tone;
  final IconData? icon;

  static (Color, Color) colors(Tone t) => switch (t) {
        Tone.violet => (SageColors.violetTint, SageColors.violet),
        Tone.lime => (SageColors.lime, SageColors.ink),
        Tone.coral => (SageColors.coralTint, const Color(0xFFB8321C)),
        Tone.mint => (SageColors.mint, SageColors.mintInk),
        Tone.amber => (SageColors.amberTint, SageColors.amberInk),
        Tone.ink => (SageColors.ink, Colors.white),
        Tone.neutral => (SageColors.paper2, SageColors.ink2),
      };

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = colors(tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 13, color: fg), const SizedBox(width: 4)],
        Flexible(child: Text(text, overflow: TextOverflow.ellipsis, style: SageText.body(12, color: fg, weight: FontWeight.w700, height: 1.2))),
      ]),
    );
  }
}

class ChoiceChips extends StatelessWidget {
  const ChoiceChips({super.key, required this.options, required this.selected, required this.onToggle, this.multi = true});
  final List<String> options;
  final Set<String> selected;
  final ValueChanged<String> onToggle;
  final bool multi;
  @override
  Widget build(BuildContext context) => Wrap(spacing: 8, runSpacing: 8, children: [
        for (final o in options)
          GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              onToggle(o);
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: selected.contains(o) ? SageColors.ink : SageColors.card,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: selected.contains(o) ? SageColors.ink : SageColors.rule),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                if (selected.contains(o)) ...[const Icon(Icons.check_rounded, size: 15, color: SageColors.lime), const SizedBox(width: 6)],
                Flexible(child: Text(o, style: SageText.body(13, color: selected.contains(o) ? Colors.white : SageColors.ink2, weight: FontWeight.w600, height: 1.25))),
              ]),
            ),
          ),
      ]);
}

// ---------------------------------------------------------------- buttons
class SageButton extends StatelessWidget {
  const SageButton(this.label, {super.key, this.onPressed, this.icon, this.loading = false, this.kind = ButtonKind.primary, this.expand = false, this.compact = false});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  final ButtonKind kind;
  final bool expand;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final (bg, fg, border) = switch (kind) {
      ButtonKind.primary => (SageColors.ink, Colors.white, SageColors.ink),
      ButtonKind.violet => (SageColors.violet, Colors.white, SageColors.violet),
      ButtonKind.secondary => (SageColors.card, SageColors.ink, SageColors.rule),
      ButtonKind.ghost => (Colors.transparent, SageColors.violet, Colors.transparent),
      ButtonKind.lime => (SageColors.lime, SageColors.ink, SageColors.lime),
      ButtonKind.danger => (SageColors.coralTint, const Color(0xFFB8321C), SageColors.coralTint),
    };
    final disabled = onPressed == null || loading;
    final child = Row(mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.center, children: [
      if (loading)
        SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: fg))
      else if (icon != null)
        Icon(icon, size: 18, color: fg),
      if (loading || icon != null) const SizedBox(width: 8),
      Flexible(child: Text(label, overflow: TextOverflow.ellipsis, style: SageText.body(compact ? 13 : 15, color: fg, weight: FontWeight.w700, height: 1.1))),
    ]);
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 150),
      opacity: disabled && !loading ? .45 : 1,
      child: Material(
        color: bg,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: border)),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: disabled
              ? null
              : () {
                  HapticFeedback.lightImpact();
                  onPressed!();
                },
          child: Padding(padding: EdgeInsets.symmetric(horizontal: compact ? 14 : 20, vertical: compact ? 10 : 15), child: child),
        ),
      ),
    );
  }
}

enum ButtonKind { primary, violet, secondary, ghost, lime, danger }

// ---------------------------------------------------------------- segmented tabs
class Segmented extends StatelessWidget {
  const Segmented({super.key, required this.options, required this.value, required this.onChanged, this.padding = const EdgeInsets.symmetric(horizontal: 20)});
  final List<(String, String)> options; // (id, label)
  final String value;
  final ValueChanged<String> onChanged;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 44,
        child: ListView.separated(
          padding: padding,
          scrollDirection: Axis.horizontal,
          itemCount: options.length,
          separatorBuilder: (_, _) => const SizedBox(width: 8),
          itemBuilder: (_, i) {
            final (id, label) = options[i];
            final on = id == value;
            return GestureDetector(
              onTap: () {
                HapticFeedback.selectionClick();
                onChanged(id);
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: on ? SageColors.ink : SageColors.card,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: on ? SageColors.ink : SageColors.rule),
                ),
                child: Text(label, style: SageText.body(13.5, color: on ? Colors.white : SageColors.ink2, weight: FontWeight.w700, height: 1)),
              ),
            );
          },
        ),
      );
}

// ---------------------------------------------------------------- data display
class MetricTile extends StatelessWidget {
  const MetricTile({super.key, required this.label, required this.value, this.icon, this.caption, this.tone = Tone.violet});
  final String label;
  final String value;
  final IconData? icon;
  final String? caption;
  final Tone tone;
  @override
  Widget build(BuildContext context) {
    final (bg, fg) = Pill.colors(tone);
    return SageCard(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          if (icon != null)
            Container(width: 30, height: 30, decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)), child: Icon(icon, size: 16, color: fg)),
          if (icon != null) const SizedBox(width: 10),
          Expanded(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: SageText.body(12.5, color: SageColors.muted, weight: FontWeight.w700))),
        ]),
        const SizedBox(height: 12),
        FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(value, style: SageText.display(26))),
        if (caption != null) ...[const SizedBox(height: 4), Text(caption!, maxLines: 1, overflow: TextOverflow.ellipsis, style: SageText.body(12, color: SageColors.muted))],
      ]),
    );
  }
}

class ProgressRing extends StatelessWidget {
  const ProgressRing({super.key, required this.value, this.size = 96, this.stroke = 9, this.color = SageColors.violet, this.track, this.child});
  final double value;
  final double size;
  final double stroke;
  final Color color;
  final Color? track;
  final Widget? child;
  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: value.clamp(0, 1)),
        duration: const Duration(milliseconds: 900),
        curve: Curves.easeOutCubic,
        builder: (_, v, _) => SizedBox(
          width: size,
          height: size,
          child: CustomPaint(
            painter: _RingPainter(v, stroke, color, track ?? color.withValues(alpha: .14)),
            child: Center(child: child),
          ),
        ),
      );
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.value, this.stroke, this.color, this.track);
  final double value, stroke;
  final Color color, track;
  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final r = rect.deflate(stroke / 2);
    canvas.drawArc(r, 0, math.pi * 2, false, Paint()..color = track..style = PaintingStyle.stroke..strokeWidth = stroke);
    canvas.drawArc(r, -math.pi / 2, math.pi * 2 * value, false,
        Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = stroke..strokeCap = StrokeCap.round);
  }

  @override
  bool shouldRepaint(_RingPainter o) => o.value != value || o.color != color;
}

class Bar extends StatelessWidget {
  const Bar({super.key, required this.value, this.color = SageColors.violet, this.height = 8});
  final double value;
  final Color color;
  final double height;
  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(99),
        child: Container(
          height: height,
          color: color.withValues(alpha: .13),
          alignment: Alignment.centerLeft,
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: value.clamp(0, 1)),
            duration: const Duration(milliseconds: 800),
            curve: Curves.easeOutCubic,
            builder: (_, v, _) => FractionallySizedBox(widthFactor: v, child: Container(decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(99)))),
          ),
        ),
      );
}

// ---------------------------------------------------------------- loading / empty / error
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, this.height = 16, this.width, this.radius = 10});
  final double height;
  final double? width;
  final double radius;
  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1300))..repeat();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (_, _) => Container(
          height: widget.height,
          width: widget.width,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.radius),
            gradient: LinearGradient(
              begin: Alignment(-1 + 3 * _c.value - 1, 0),
              end: Alignment(3 * _c.value - 1, 0),
              colors: const [SageColors.paper2, Color(0xFFF8F5EF), SageColors.paper2],
            ),
          ),
        ),
      );
}

class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 4, this.height = 92});
  final int count;
  final double height;
  @override
  Widget build(BuildContext context) => Column(children: [
        for (var i = 0; i < count; i++) Padding(padding: const EdgeInsets.only(bottom: 12), child: Skeleton(height: height, radius: 22)),
      ]);
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, required this.message, this.action});
  final IconData icon;
  final String title;
  final String message;
  final Widget? action;
  @override
  Widget build(BuildContext context) => SageCard(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(color: SageColors.violetTint, borderRadius: BorderRadius.circular(18)),
            child: Icon(icon, color: SageColors.violet),
          ),
          const SizedBox(height: 14),
          Text(title, textAlign: TextAlign.center, style: SageText.title(17)),
          const SizedBox(height: 6),
          Text(message, textAlign: TextAlign.center, style: SageText.body(14, color: SageColors.muted)),
          if (action != null) ...[const SizedBox(height: 16), action!],
        ]),
      );
}

class ErrorBanner extends StatelessWidget {
  const ErrorBanner(this.message, {super.key, this.onRetry});
  final String message;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: SageColors.coralTint, borderRadius: BorderRadius.circular(16)),
        child: Row(children: [
          const Icon(Icons.error_outline_rounded, color: Color(0xFFB8321C), size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: SageText.body(13.5, color: const Color(0xFF8C2413), weight: FontWeight.w600))),
          if (onRetry != null) TextButton(onPressed: onRetry, child: const Text('Retry')),
        ]),
      );
}

class NoticeBanner extends StatelessWidget {
  const NoticeBanner(this.message, {super.key, this.icon = Icons.info_outline_rounded, this.tone = Tone.amber});
  final String message;
  final IconData icon;
  final Tone tone;
  @override
  Widget build(BuildContext context) {
    final (bg, fg) = Pill.colors(tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, color: fg, size: 18),
        const SizedBox(width: 10),
        Expanded(child: Text(message, style: SageText.body(12.5, color: fg, weight: FontWeight.w600))),
      ]),
    );
  }
}

// ---------------------------------------------------------------- helpers
void toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

Future<T?> sheet<T>(BuildContext context, Widget child) => showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => child,
    );

class FieldLabel extends StatelessWidget {
  const FieldLabel(this.text, {super.key, this.hint});
  final String text;
  final String? hint;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8, top: 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(text, style: SageText.body(13.5, color: SageColors.ink, weight: FontWeight.w700)),
          if (hint != null) Text(hint!, style: SageText.body(12, color: SageColors.muted)),
        ]),
      );
}

/// A pull-to-refresh page body with consistent padding for the tab screens.
class PageBody extends StatelessWidget {
  const PageBody({super.key, required this.children, this.onRefresh, this.header});
  final List<Widget> children;
  final Future<void> Function()? onRefresh;
  final Widget? header;
  @override
  Widget build(BuildContext context) {
    final list = ListView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      padding: const EdgeInsets.only(bottom: 120),
      children: [
        ?header,
        Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children)),
      ],
    );
    if (onRefresh == null) return list;
    return RefreshIndicator(color: SageColors.violet, onRefresh: onRefresh!, child: list);
  }
}

String inr(num paise) {
  final rupees = paise / 100;
  final s = rupees.toStringAsFixed(0);
  final digits = s.split('');
  final buf = StringBuffer();
  final n = digits.length;
  for (var i = 0; i < n; i++) {
    buf.write(digits[i]);
    final rem = n - i - 1;
    if (rem > 0 && (rem == 3 || (rem > 3 && (rem - 3) % 2 == 0))) buf.write(',');
  }
  return '₹$buf';
}
