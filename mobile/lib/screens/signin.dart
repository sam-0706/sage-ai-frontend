import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/session.dart';
import '../core/theme.dart';
import '../widgets/brand.dart';
import '../widgets/ui.dart';

class SignInScreen extends StatelessWidget {
  const SignInScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final waiting = s.phase == AuthPhase.waiting;
    return Scaffold(
      backgroundColor: SageColors.ink,
      body: Stack(children: [
        const Positioned.fill(child: _Bloom()),
        SafeArea(
          child: LayoutBuilder(
            builder: (context, c) => SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: c.maxHeight - 40),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Wordmark(light: true),
                  const SizedBox(height: 56),
                  Text('BITSoM MBA · BETA', style: SageText.kicker(color: SageColors.lime)),
                  const SizedBox(height: 14),
                  Text('Your semester,\nhandled.', style: SageText.display(46, color: Colors.white)),
                  const SizedBox(height: 14),
                  Text('Placements, classes, deadlines and exam prep in one calm plan — with an AI that calls you when it matters.',
                      style: SageText.body(16, color: Colors.white.withValues(alpha: .66))),
                  const SizedBox(height: 32),
                  const _Feature(Icons.work_outline_rounded, 'AI-ranked on-campus roles', 'Matched to your goal and dream salary'),
                  const _Feature(Icons.calendar_month_rounded, 'Timetable & attendance', 'Know exactly which classes you can’t miss'),
                  const _Feature(Icons.headset_mic_outlined, 'Study AI & Interview AI', 'Voice practice with a real score after'),
                  const SizedBox(height: 32),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 250),
                    child: waiting ? _Waiting(code: s.userCode ?? '') : const _Start(),
                  ),
                  if (s.error != null) ...[const SizedBox(height: 16), ErrorBanner(s.error!)],
                  const SizedBox(height: 24),
                  Row(children: [
                    Icon(Icons.lock_outline_rounded, size: 14, color: Colors.white.withValues(alpha: .45)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text('Invite-only beta — use the email you joined the waitlist with. Your session is stored in the device keychain.',
                          style: SageText.body(12, color: Colors.white.withValues(alpha: .45))),
                    ),
                  ]),
                ]),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

class _Start extends StatefulWidget {
  const _Start();
  @override
  State<_Start> createState() => _StartState();
}

class _StartState extends State<_Start> {
  bool busy = false;
  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: busy
              ? null
              : () async {
                  setState(() => busy = true);
                  await context.read<Session>().signIn();
                  if (mounted) setState(() => busy = false);
                },
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 17),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              if (busy)
                const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: SageColors.ink))
              else
                const _GoogleG(),
              const SizedBox(width: 12),
              Text('Continue with Google', style: SageText.body(16, color: SageColors.ink, weight: FontWeight.w800)),
            ]),
          ),
        ),
      );
}

class _Waiting extends StatelessWidget {
  const _Waiting({required this.code});
  final String code;
  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: .07), borderRadius: BorderRadius.circular(22), border: Border.all(color: Colors.white12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: SageColors.lime)),
          const SizedBox(width: 12),
          Expanded(child: Text('Finish signing in with Google in the browser.', style: SageText.body(15, color: Colors.white, weight: FontWeight.w700))),
        ]),
        const SizedBox(height: 14),
        Text('PAIRING CODE', style: SageText.kicker(color: Colors.white54)),
        const SizedBox(height: 6),
        Text(code, style: SageText.mono(26, color: SageColors.lime, weight: FontWeight.w800)),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: SageButton('Reopen browser', icon: Icons.open_in_new_rounded, kind: ButtonKind.lime, onPressed: s.openBrowser, compact: true)),
          const SizedBox(width: 10),
          TextButton(onPressed: s.cancelSignIn, child: Text('Cancel', style: SageText.body(14, color: Colors.white70, weight: FontWeight.w700))),
        ]),
      ]),
    );
  }
}

class _Feature extends StatelessWidget {
  const _Feature(this.icon, this.title, this.subtitle);
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Row(children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: .08), borderRadius: BorderRadius.circular(14)),
            child: Icon(icon, size: 20, color: SageColors.lilac),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: SageText.body(15, color: Colors.white, weight: FontWeight.w700, height: 1.3)),
              Text(subtitle, style: SageText.body(13, color: Colors.white.withValues(alpha: .55), height: 1.3)),
            ]),
          ),
        ]),
      );
}

class _GoogleG extends StatelessWidget {
  const _GoogleG();
  @override
  Widget build(BuildContext context) => Container(
        width: 22,
        height: 22,
        alignment: Alignment.center,
        decoration: const BoxDecoration(shape: BoxShape.circle, gradient: SweepGradient(colors: [Color(0xFF4285F4), Color(0xFF34A853), Color(0xFFFBBC05), Color(0xFFEA4335), Color(0xFF4285F4)])),
        child: Container(
          width: 12,
          height: 12,
          decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
          alignment: Alignment.center,
          child: Text('G', style: SageText.body(9, color: const Color(0xFF4285F4), weight: FontWeight.w900, height: 1)),
        ),
      );
}

class _Bloom extends StatelessWidget {
  const _Bloom();
  @override
  Widget build(BuildContext context) => const DecoratedBox(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(1.1, -0.9),
            radius: 1.2,
            colors: [Color(0xFF4B2BB0), Color(0x0017142A)],
          ),
        ),
      );
}
