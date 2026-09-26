import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../core/workspace.dart';
import '../widgets/ui.dart';
import 'onboarding.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});
  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  List<Map<String, dynamic>>? sessions;

  @override
  void initState() {
    super.initState();
    loadSessions();
    context.read<Session>().refresh(silent: true);
  }

  Future<void> loadSessions() async {
    try {
      final r = await Api.instance.get('/v1/auth/sessions') as Map;
      if (mounted) setState(() => sessions = (r['items'] as List).cast<Map>().map((e) => e.cast<String, dynamic>()).toList());
    } catch (_) {
      if (mounted) setState(() => sessions = []);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final u = s.user ?? {};
    final sub = s.subscription;
    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 40), children: [
        InkHero(
          child: Row(children: [
            Container(
              width: 56,
              height: 56,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: SageColors.lime, borderRadius: BorderRadius.circular(18)),
              child: Text(((u['full_name'] as String?) ?? 'S').characters.first.toUpperCase(), style: SageText.display(24)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${u['full_name'] ?? ''}', style: SageText.title(18, color: Colors.white)),
                Text('${u['email'] ?? ''}', style: SageText.body(13, color: Colors.white60)),
                const SizedBox(height: 8),
                Wrap(spacing: 6, children: [Pill('${u['mode'] ?? 'student'}', tone: Tone.lime), if (sub != null) Pill('${sub['plan_name']}', tone: Tone.ink)]),
              ]),
            ),
          ]),
        ),
        const SizedBox(height: 12),
        SageButton('Edit goals & context', icon: Icons.tune_rounded, kind: ButtonKind.secondary, expand: true,
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const OnboardingScreen(editing: true)))),
        SectionTitle('Plan & usage', action: 'Upgrade', onAction: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PricingScreen()))),
        if (sub == null)
          const SkeletonList(count: 1, height: 160)
        else
          SageCard(
            child: Column(children: [
              _Usage('AI voice minutes', ((sub['voice']['used_seconds'] as num) / 60).round(), ((sub['voice']['allowance_seconds'] as num) / 60).round()),
              _Usage('AI plans & cue-card decks', sub['ai_requests']['used'] as num, sub['ai_requests']['allowance'] as num),
              _Usage('Ask SAGE messages', sub['chat_messages']['used'] as num, sub['chat_messages']['allowance'] as num),
              if (sub['period_end'] != null) Align(alignment: Alignment.centerLeft, child: Text('Renews ${dayOnly(sub['period_end'])}', style: SageText.body(12, color: SageColors.muted))),
            ]),
          ),
        const SectionTitle('Signed-in devices'),
        if (sessions == null) const SkeletonList(count: 2, height: 64),
        for (final d in sessions ?? [])
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: SageCard(
              child: Row(children: [
                Icon(d['client'] == 'mobile' ? Icons.phone_iphone_rounded : Icons.laptop_mac_rounded, color: SageColors.muted),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${d['device_name'] ?? d['client']}', style: SageText.title(14)),
                  Text('Last used ${relative(d['last_used_at'] ?? d['created_at']).replaceAll('overdue', 'ago')}', style: SageText.body(12, color: SageColors.muted)),
                ])),
                TextButton(
                  onPressed: () async {
                    await Api.instance.delete('/v1/auth/sessions/${d['id']}');
                    loadSessions();
                  },
                  child: const Text('Revoke'),
                ),
              ]),
            ),
          ),
        const SizedBox(height: 20),
        SageButton('Sign out', icon: Icons.logout_rounded, kind: ButtonKind.danger, expand: true, onPressed: () async {
          context.read<Workspace>().clear();
          Navigator.of(context).popUntil((r) => r.isFirst);
          await s.signOut();
        }),
        const SizedBox(height: 16),
        Text('SAGE AI mobile · ${kApiBase.replaceFirst('https://', '')}', textAlign: TextAlign.center, style: SageText.mono(10.5)),
      ]),
    );
  }
}

class _Usage extends StatelessWidget {
  const _Usage(this.label, this.used, this.allowance);
  final String label;
  final num used, allowance;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(label, style: SageText.body(13, weight: FontWeight.w700))),
            Text('${(allowance - used).clamp(0, allowance)} left of $allowance', style: SageText.mono(11.5, color: SageColors.ink2)),
          ]),
          const SizedBox(height: 6),
          Bar(value: allowance == 0 ? 0 : used / allowance),
        ]),
      );
}

class PricingScreen extends StatefulWidget {
  const PricingScreen({super.key});
  @override
  State<PricingScreen> createState() => _PricingScreenState();
}

class _PricingScreenState extends State<PricingScreen> {
  List<Map<String, dynamic>>? plans;
  String busy = '';
  String? error;

  @override
  void initState() {
    super.initState();
    Api.instance.get('/v1/billing/plans').then((r) {
      if (mounted) {
        setState(() => plans = ((r as Map)['items'] as List).cast<Map>().map((e) => e.cast<String, dynamic>()).where((p) => ['plus', 'pro', 'ultra'].contains(p['code'])).toList()
          ..sort((a, b) => (a['price_inr_paise'] as num).compareTo(b['price_inr_paise'] as num)));
      }
    }).catchError((Object e) {
      if (mounted) setState(() => error = friendlyError(e));
    });
  }

  List<String> features(Map<String, dynamic> p) => [
        'Academic dashboard, attendance & calendar',
        'Quick Notes cue cards & semester planning',
        '${p['ai_requests']} AI generations / recommendations',
        '${p['chat_messages']} Ask SAGE messages',
        '${p['voice_minutes']} AI voice minutes',
        if (p['code'] != 'plus') ...['AI-recommended jobs & live job search', 'Interview AI mock calls', 'Class priorities & deadline follow-up calls'],
      ];

  Future<void> choose(Map<String, dynamic> p) async {
    setState(() => busy = '${p['code']}');
    try {
      final r = await Api.instance.post('/v1/billing/orders', {'plan_code': p['code'], 'idempotency_key': newKey()}) as Map;
      await launchUrl(Uri.parse('${r['checkout_url']}'), mode: LaunchMode.inAppBrowserView);
      if (mounted) await context.read<Session>().refresh(silent: true);
    } catch (e) {
      if (mounted) toast(context, friendlyError(e));
    } finally {
      if (mounted) setState(() => busy = '');
    }
  }

  @override
  Widget build(BuildContext context) {
    final current = context.watch<Session>().subscription?['plan_code'];
    return Scaffold(
      appBar: AppBar(title: const Text('Plans')),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 40), children: [
        Text('Invest in your\nnext move.', style: SageText.display(32)),
        const SizedBox(height: 8),
        Text('Simple 30-day access for planning, placement practice and execution.', style: SageText.body(14, color: SageColors.muted)),
        const SizedBox(height: 12),
        const NoticeBanner('Razorpay TEST mode — no real money is collected.', icon: Icons.science_outlined),
        const SizedBox(height: 16),
        if (error != null) ErrorBanner(error!),
        if (plans == null && error == null) const SkeletonList(count: 3, height: 240),
        for (final p in plans ?? [])
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Builder(builder: (_) {
              final pro = p['code'] == 'pro';
              final fg = pro ? Colors.white : SageColors.ink;
              final body = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Text('${p['name']}', style: SageText.title(18, color: fg)),
                  const Spacer(),
                  if (pro) const Pill('Best fit', tone: Tone.lime),
                  if (current == p['code']) ...[const SizedBox(width: 6), const Pill('Current', tone: Tone.violet)],
                ]),
                const SizedBox(height: 10),
                Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text(inr(p['price_inr_paise'] as num), style: SageText.display(36, color: fg)),
                  const SizedBox(width: 6),
                  Padding(padding: const EdgeInsets.only(bottom: 6), child: Text('/ 30 days', style: SageText.body(13, color: pro ? Colors.white60 : SageColors.muted))),
                ]),
                const SizedBox(height: 14),
                for (final f in features(p))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Icon(Icons.check_circle_rounded, size: 18, color: pro ? SageColors.lime : SageColors.mintInk),
                      const SizedBox(width: 10),
                      Expanded(child: Text(f, style: SageText.body(13.5, color: pro ? Colors.white.withValues(alpha: .85) : SageColors.ink2))),
                    ]),
                  ),
                const SizedBox(height: 10),
                SageButton('Choose ${p['name']} · TEST', icon: Icons.lock_outline_rounded, expand: true, kind: pro ? ButtonKind.lime : ButtonKind.primary, loading: busy == p['code'], onPressed: () => choose(p)),
              ]);
              return pro ? InkHero(child: body) : SageCard(padding: const EdgeInsets.all(22), child: body);
            }),
          ),
        Text('Voice minutes are shared by study, interview and follow-up calls and reconciled after each call.', style: SageText.body(12, color: SageColors.muted)),
      ]),
    );
  }
}
