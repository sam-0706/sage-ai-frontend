import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/theme.dart';
import '../core/workspace.dart';
import '../widgets/ui.dart';
import 'career.dart' show handleUpgrade;
import 'today.dart' show TaskTile;

class PlanScreen extends StatefulWidget {
  const PlanScreen({super.key});
  @override
  State<PlanScreen> createState() => _PlanScreenState();
}

class _PlanScreenState extends State<PlanScreen> {
  String tab = 'semester';
  @override
  Widget build(BuildContext context) => Column(children: [
        const PageHeader(kicker: 'Growth plan', title: 'Plan your semester'),
        Segmented(options: const [('semester', 'Semester plan'), ('progress', 'Progress'), ('activity', 'Activity')], value: tab, onChanged: (v) => setState(() => tab = v)),
        const SizedBox(height: 8),
        Expanded(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            child: KeyedSubtree(key: ValueKey(tab), child: tab == 'progress' ? const _Progress() : PlannerView(kind: tab)),
          ),
        ),
      ]);
}

const _focus = ['placements', 'internships', 'portfolio projects', 'networking', 'academic improvement'];

class PlannerView extends StatefulWidget {
  const PlannerView({super.key, required this.kind});
  final String kind; // semester | activity | class_recommendations
  @override
  State<PlannerView> createState() => _PlannerViewState();
}

class _PlannerViewState extends State<PlannerView> {
  late final goal = TextEditingController(text: '${context.read<Workspace>().profile['career_goal'] ?? ''}');
  int weeks = 8;
  String focus = 'placements';
  bool busy = false;

  String get title => switch (widget.kind) {
        'activity' => 'Projects, internships & networking',
        'class_recommendations' => 'Which classes matter most',
        _ => 'An end-to-end semester plan',
      };

  Future<void> plan() async {
    setState(() => busy = true);
    try {
      await Api.instance.post('/v1/campus/plans', {'kind': widget.kind, 'goal': goal.text.trim(), 'weeks': weeks, 'focus': focus});
      HapticFeedback.mediumImpact();
      if (mounted) await context.read<Workspace>().refresh();
    } catch (e) {
      if (mounted) handleUpgrade(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final w = context.watch<Workspace>();
    final latest = w.latestPlan(widget.kind);
    return PageBody(onRefresh: w.refresh, children: [
      const SizedBox(height: 8),
      SageCard(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(title, style: SageText.title(17)),
          const SizedBox(height: 4),
          Text('OpenAI plans around your courses, experience, goal and ${w.profile['daily_minutes'] ?? 60} minutes a day. Required attendance always stays protected.',
              style: SageText.body(12.5, color: SageColors.muted)),
          const FieldLabel('Goal'),
          TextField(controller: goal, onChanged: (_) => setState(() {}), textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(hintText: 'e.g. Land a product internship')),
          const FieldLabel('Horizon'),
          ChoiceChips(options: const ['2', '4', '8', '12', '24'].map((v) => '$v weeks').toList(), selected: {'$weeks weeks'}, multi: false, onToggle: (v) => setState(() => weeks = int.parse(v.split(' ').first))),
          const FieldLabel('Focus'),
          ChoiceChips(options: _focus, selected: {focus}, multi: false, onToggle: (v) => setState(() => focus = v)),
          const SizedBox(height: 16),
          SageButton('Plan with AI', icon: Icons.auto_awesome_rounded, kind: ButtonKind.violet, expand: true, loading: busy, onPressed: goal.text.trim().length >= 3 ? plan : null),
          if (busy) Padding(padding: const EdgeInsets.only(top: 10), child: Text('Building your structured plan — about 20 seconds…', textAlign: TextAlign.center, style: SageText.body(12.5, color: SageColors.muted))),
        ]),
      ),
      const SizedBox(height: 16),
      if (latest == null)
        const EmptyState(icon: Icons.route_rounded, title: 'No plan yet', message: 'Set your goal and tap Plan with AI. Your saved plan appears here and its tasks flow into Progress.')
      else
        PlanResult(output: (latest['output'] as Map).cast<String, dynamic>(), kind: widget.kind),
    ]);
  }
}

class PlanResult extends StatelessWidget {
  const PlanResult({super.key, required this.output, required this.kind});
  final Map<String, dynamic> output;
  final String kind;
  @override
  Widget build(BuildContext context) {
    final o = output;
    final milestones = ((o['milestones'] as List?) ?? []).cast<Map>();
    final tasks = ((o['tasks'] as List?) ?? []).cast<Map>()..sort((a, b) => ((a['day'] as num?) ?? 0).compareTo((b['day'] as num?) ?? 0));
    final priorities = ((o['class_priorities'] as List?) ?? []).map((e) => '$e').toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      InkHero(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('YOUR PLAN', style: SageText.kicker(color: SageColors.lime)),
          const SizedBox(height: 10),
          Text('${o['title']}', style: SageText.display(24, color: Colors.white)),
          const SizedBox(height: 10),
          Text('${o['summary']}', style: SageText.body(13.5, color: Colors.white70)),
          const SizedBox(height: 16),
          Wrap(spacing: 8, runSpacing: 8, children: [
            Pill('${o['recommended_internships']} internship targets', tone: Tone.lime),
            Pill('${o['recommended_projects']} projects', tone: Tone.ink),
            Pill('${o['weekly_hours']} h / week', tone: Tone.ink),
          ]),
          if ((o['salary_context'] ?? '').toString().isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('${o['salary_context']}', style: SageText.body(12, color: Colors.white54)),
          ],
        ]),
      ),
      if (kind == 'class_recommendations' || priorities.isNotEmpty) ...[
        SectionTitle(kind == 'class_recommendations' ? 'Class priorities' : 'Course priorities'),
        for (final (i, p) in priorities.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: SageCard(
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  width: 28,
                  height: 28,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: i < 2 ? SageColors.lime : SageColors.paper2, borderRadius: BorderRadius.circular(9)),
                  child: Text('${i + 1}', style: SageText.title(13)),
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(p, style: SageText.body(14, color: SageColors.ink, weight: FontWeight.w600))),
              ]),
            ),
          ),
      ],
      if (milestones.isNotEmpty) ...[
        const SectionTitle('Milestones'),
        SageCard(
          child: Column(children: [
            for (final (i, m) in milestones.indexed)
              IntrinsicHeight(
                child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Column(children: [
                    Container(width: 14, height: 14, decoration: BoxDecoration(color: SageColors.violet, shape: BoxShape.circle, border: Border.all(color: SageColors.violetTint, width: 3))),
                    if (i < milestones.length - 1) Expanded(child: Container(width: 2, color: SageColors.rule)),
                  ]),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('WEEK ${m['week']}', style: SageText.kicker()),
                        const SizedBox(height: 3),
                        Text('${m['title']}', style: SageText.title(14.5)),
                        const SizedBox(height: 3),
                        Text('Evidence: ${m['evidence']}', style: SageText.body(12.5, color: SageColors.muted)),
                      ]),
                    ),
                  ),
                ]),
              ),
          ]),
        ),
      ],
      if (tasks.isNotEmpty) ...[
        const SectionTitle('Daily work'),
        for (final t in tasks)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: SageCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Wrap(spacing: 6, runSpacing: 6, children: [Pill('Day ${t['day']}', tone: Tone.ink), Pill('${t['minutes']} min'), Pill('${t['category']}', tone: _categoryTone('${t['category']}'))]),
                const SizedBox(height: 10),
                Text('${t['title']}', style: SageText.title(15)),
                const SizedBox(height: 6),
                Text('Deliverable: ${t['deliverable']}', style: SageText.body(13)),
                const SizedBox(height: 4),
                Text('Real-world use: ${t['real_world_use']}', style: SageText.body(12.5, color: SageColors.muted)),
              ]),
            ),
          ),
      ],
      if (((o['assumptions'] as List?) ?? []).isNotEmpty) ...[
        const SizedBox(height: 6),
        Text('Assumptions: ${(o['assumptions'] as List).join(' · ')}', style: SageText.body(12, color: SageColors.muted)),
      ],
    ]);
  }
}

Tone _categoryTone(String c) => switch (c) {
      'learning' => Tone.violet,
      'project' => Tone.lime,
      'internship' => Tone.mint,
      'networking' => Tone.amber,
      'application' => Tone.coral,
      _ => Tone.neutral,
    };

class _Progress extends StatefulWidget {
  const _Progress();
  @override
  State<_Progress> createState() => _ProgressState();
}

class _ProgressState extends State<_Progress> {
  String filter = 'pending';
  @override
  Widget build(BuildContext context) {
    final w = context.watch<Workspace>();
    final a = w.analytics;
    final pending = w.tasks.where((t) => t['status'] == 'pending').toList();
    final remaining = pending.fold<int>(0, (n, t) => n + ((t['minutes'] as num?)?.toInt() ?? 0));
    final daily = ((w.profile['daily_minutes'] as num?) ?? 60).toDouble();
    final byCat = <String, (int, int)>{};
    for (final t in w.tasks) {
      final c = '${t['category']}';
      final v = byCat[c] ?? (0, 0);
      byCat[c] = (v.$1 + (t['status'] == 'done' ? 1 : 0), v.$2 + 1);
    }
    final shown = w.tasks.where((t) => filter == 'all' || t['status'] == filter).toList();
    return PageBody(onRefresh: w.refresh, children: [
      const SizedBox(height: 8),
      InkHero(
        child: Row(children: [
          ProgressRing(
            value: ((a['completion_percent'] as num?) ?? 0) / 100,
            size: 96,
            stroke: 9,
            color: SageColors.lime,
            track: Colors.white12,
            child: Text('${a['completion_percent'] ?? 0}%', style: SageText.display(22, color: Colors.white)),
          ),
          const SizedBox(width: 18),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('PROGRESS', style: SageText.kicker(color: Colors.white54)),
              const SizedBox(height: 8),
              Text('${a['tasks_completed'] ?? 0} of ${a['tasks_total'] ?? 0} tasks done', style: SageText.title(17, color: Colors.white)),
              const SizedBox(height: 6),
              Text(pending.isEmpty ? 'All caught up.' : 'Projected: ${(remaining / daily).ceil()} study days left at ${daily.round()} min/day ($remaining min).',
                  style: SageText.body(12.5, color: Colors.white60)),
            ]),
          ),
        ]),
      ),
      if (byCat.isNotEmpty) ...[
        const SectionTitle('By area'),
        SageCard(
          child: Column(children: [
            for (final e in byCat.entries)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(e.key[0].toUpperCase() + e.key.substring(1), style: SageText.body(13, weight: FontWeight.w700))),
                    Text('${e.value.$1}/${e.value.$2}', style: SageText.mono(12, color: SageColors.ink2)),
                  ]),
                  const SizedBox(height: 6),
                  Bar(value: e.value.$2 == 0 ? 0 : e.value.$1 / e.value.$2, color: Pill.colors(_categoryTone(e.key)).$2 == SageColors.ink ? SageColors.violet : Pill.colors(_categoryTone(e.key)).$2),
                ]),
              ),
          ]),
        ),
      ],
      const SizedBox(height: 16),
      Segmented(options: const [('pending', 'To do'), ('done', 'Done'), ('all', 'All')], value: filter, onChanged: (v) => setState(() => filter = v), padding: EdgeInsets.zero),
      const SizedBox(height: 12),
      if (w.tasks.isEmpty) const EmptyState(icon: Icons.checklist_rounded, title: 'No tasks yet', message: 'Create a semester or activity plan first — its tasks appear here day by day.'),
      for (final t in shown) Padding(padding: const EdgeInsets.only(bottom: 10), child: TaskTile(key: ValueKey('${t['id']}-${t['status']}'), task: t)),
    ]);
  }
}
