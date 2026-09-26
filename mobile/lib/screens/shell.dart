import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/session.dart';
import '../core/theme.dart';
import '../core/workspace.dart';
import '../widgets/brand.dart';
import 'academics.dart';
import 'account.dart';
import 'ask.dart';
import 'career.dart';
import 'plan.dart';
import 'prep.dart';
import 'today.dart';

class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int index = 0;
  static const _tabs = [
    (Icons.wb_twilight_rounded, 'Today'),
    (Icons.work_outline_rounded, 'Career'),
    (Icons.calendar_month_rounded, 'Academics'),
    (Icons.style_outlined, 'Prep'),
    (Icons.route_rounded, 'Plan'),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<Workspace>().refresh());
  }

  void go(int i) {
    HapticFeedback.selectionClick();
    setState(() => index = i);
  }

  @override
  Widget build(BuildContext context) {
    final pages = [TodayScreen(onNavigate: go), const CareerScreen(), const AcademicsScreen(), const PrepScreen(), const PlanScreen()];
    return Scaffold(
      extendBody: true,
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          const _TopBar(),
          Expanded(child: IndexedStack(index: index, children: pages)),
        ]),
      ),
      bottomNavigationBar: _Dock(index: index, onTap: go, tabs: _tabs),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar();
  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final initials = (s.user?['full_name'] as String? ?? 'S').trim().split(RegExp(r'\s+')).take(2).map((w) => w.isEmpty ? '' : w[0]).join().toUpperCase();
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 12, 4),
      child: Row(children: [
        const Wordmark(),
        const Spacer(),
        _RoundAction(
          icon: Icons.auto_awesome_rounded,
          tooltip: 'Ask SAGE',
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AskScreen())),
        ),
        const SizedBox(width: 8),
        GestureDetector(
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AccountScreen())),
          child: Semantics(
            label: 'Account',
            button: true,
            child: Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: SageColors.ink, borderRadius: BorderRadius.circular(14)),
              child: Text(initials, style: SageText.body(13, color: SageColors.lime, weight: FontWeight.w800)),
            ),
          ),
        ),
      ]),
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({required this.icon, required this.tooltip, required this.onTap});
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Tooltip(
        message: tooltip,
        child: Material(
          color: SageColors.violetTint,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: onTap,
            child: SizedBox(width: 40, height: 40, child: Icon(icon, size: 19, color: SageColors.violet)),
          ),
        ),
      );
}

class _Dock extends StatelessWidget {
  const _Dock({required this.index, required this.onTap, required this.tabs});
  final int index;
  final ValueChanged<int> onTap;
  final List<(IconData, String)> tabs;
  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(14, 0, 14, bottom > 0 ? bottom : 14),
      child: Container(
        height: 68,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        decoration: BoxDecoration(
          color: SageColors.ink,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [BoxShadow(color: SageColors.ink.withValues(alpha: .28), blurRadius: 30, offset: const Offset(0, 12))],
        ),
        child: Row(children: [
          for (var i = 0; i < tabs.length; i++)
            Expanded(
              child: Semantics(
                selected: i == index,
                button: true,
                label: tabs[i].$2,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onTap(i),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 240),
                    curve: Curves.easeOutCubic,
                    margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
                    decoration: BoxDecoration(
                      color: i == index ? Colors.white.withValues(alpha: .09) : Colors.transparent,
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(tabs[i].$1, size: 22, color: i == index ? SageColors.lime : Colors.white.withValues(alpha: .55)),
                      const SizedBox(height: 3),
                      Text(tabs[i].$2,
                          style: SageText.body(10.5, color: i == index ? Colors.white : Colors.white.withValues(alpha: .55), weight: FontWeight.w700, height: 1)),
                    ]),
                  ),
                ),
              ),
            ),
        ]),
      ),
    );
  }
}
