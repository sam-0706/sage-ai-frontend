import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'core/attendance.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'core/workspace.dart';
import 'screens/onboarding.dart';
import 'screens/shell.dart';
import 'screens/signin.dart';
import 'widgets/brand.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent, statusBarIconBrightness: Brightness.dark));
  runApp(MultiProvider(
    providers: [
      ChangeNotifierProvider(create: (_) => Session()..boot()),
      ChangeNotifierProvider(create: (_) => Workspace()),
      ChangeNotifierProvider(create: (_) => AttendanceBook()),
    ],
    child: const SageApp(),
  ));
}

class SageApp extends StatelessWidget {
  const SageApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'SAGE AI',
        debugShowCheckedModeBanner: false,
        theme: buildSageTheme(),
        home: const _Gate(),
      );
}

class _Gate extends StatelessWidget {
  const _Gate();
  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final Widget child = switch (s.phase) {
      AuthPhase.booting => const _Splash(),
      AuthPhase.signedOut || AuthPhase.waiting => const SignInScreen(),
      AuthPhase.signedIn => s.onboarded == false ? const OnboardingScreen() : const Shell(),
    };
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 320),
      switchInCurve: Curves.easeOutCubic,
      child: KeyedSubtree(
        key: ValueKey('${s.phase}-${s.onboarded}'),
        // Splash and sign-in sit on ink; everything after sits on paper.
        child: AnnotatedRegion<SystemUiOverlayStyle>(
          value: s.phase == AuthPhase.signedIn ? SystemUiOverlayStyle.dark : SystemUiOverlayStyle.light,
          child: child,
        ),
      ),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();
  @override
  Widget build(BuildContext context) => const Scaffold(
        backgroundColor: SageColors.ink,
        body: Center(child: SageMark(size: 72)),
      );
}
