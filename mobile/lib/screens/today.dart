import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/attendance.dart';
import '../core/format.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../core/workspace.dart';
import '../widgets/ui.dart';
import 'ask.dart';

class TodayScreen extends StatelessWidget {
  const TodayScreen({super.key, required this.onNavigate});
  final ValueChanged<int> onNavigate;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final w = context.watch<Workspace>();
    final book = context.watch<AttendanceBook>();
    final p = w.profile;
    final subjects = ((p['subjects'] as List?) ?? []).map((e) => '$e').toList();
    if (w.data != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => book.load('${s.user?['id']}', subjects));
    }
    final a = w.analytics;
    final completion = ((a['completion_percent'] as num?) ?? 0).toDouble();
    final pending = w.tasks.where((t) => t['status'] == 'pending').toList();
    final deadlines = w.deadlines.where((d) => d['status'] == 'pending').toList()
      ..sort((x, y) => '${x['due_at']}'.compareTo('${y['due_at']}'));
    final latest = w.assessments.isNotEmpty ? w.assessments.first : null;

    return PageBody(
      onRefresh: () async {
        await Future.wait([w.refresh(), s.refresh(silent: true)]);
      },
      children: [
        const SizedBox(height: 8),
        if (w.error != null && w.data == null) ...[ErrorBanner(w.error!, onRetry: w.refresh), const SizedBox(height: 12)],
        _Hero(name: s.firstName, role: p['target_role'] as String?, minutes: p['daily_minutes'], salary: p['salary_lpa'], completion: completion, loading: w.data == null),
        const SizedBox(height: 14),
        if (w.data == null)
          const SkeletonList(count: 3, height: 84)
        else ...[
          Row(children: [
            Expanded(child: MetricTile(label: 'Attendance', value: book.rows.isEmpty ? '—' : '${book.overall.percentage?.toStringAsFixed(1)}%', icon: Icons.fact_check_outlined, caption: 'Target ${book.target.round()}% · demo', tone: (book.overall.needed ?? 0) > 0 ? Tone.amber : Tone.mint)),
            const SizedBox(width: 12),
            Expanded(child: MetricTile(label: 'Tasks done', value: '${a['tasks_completed'] ?? 0}/${a['tasks_total'] ?? 0}', icon: Icons.task_alt_rounded, caption: 'From your plan', tone: Tone.violet)),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: MetricTile(label: 'Overdue', value: '${a['overdue'] ?? 0}', icon: Icons.schedule_rounded, caption: 'Assignments & fees', tone: (a['overdue'] ?? 0) > 0 ? Tone.coral : Tone.mint)),
            const SizedBox(width: 12),
            Expanded(child: MetricTile(label: 'Latest score', value: latest == null ? '—' : '${latest['overall_score']}%', icon: Icons.insights_rounded, caption: '${a['practice_sessions'] ?? 0} practice sessions', tone: Tone.lime)),
          ]),
          SectionTitle('Next moves', action: pending.isEmpty ? null : 'Open plan', onAction: () => onNavigate(4)),
          if (pending.isEmpty)
            EmptyState(
              icon: Icons.route_rounded,
              title: 'Your daily list is ready to be built',
              message: 'Create a semester plan and SAGE turns your goal into focused daily work.',
              action: SageButton('Build my plan', icon: Icons.auto_awesome_rounded, kind: ButtonKind.violet, onPressed: () => onNavigate(4)),
            )
          else
            for (final t in pending.take(4)) Padding(padding: const EdgeInsets.only(bottom: 10), child: TaskTile(task: t)),
          const SectionTitle('This week'),
          _WeekStrip(subjects: subjects, workspace: w),
          if (deadlines.isNotEmpty) ...[
            SectionTitle('Due soon', action: 'All', onAction: () => onNavigate(2)),
            for (final d in deadlines.take(3))
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: SageCard(
                  onTap: () => onNavigate(2),
                  child: Row(children: [
                    _DeadlineIcon(category: d['category'] as String?),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${d['title']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: SageText.title(14.5)),
                        const SizedBox(height: 3),
                        Text(dayTime(d['due_at']), style: SageText.body(12.5, color: SageColors.muted)),
                      ]),
                    ),
                    Pill(relative(d['due_at']), tone: (parseDate(d['due_at'])?.isBefore(DateTime.now()) ?? false) ? Tone.coral : Tone.amber),
                  ]),
                ),
              ),
          ],
          const SectionTitle('Jump in'),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.55,
            children: [
              _Quick(Icons.style_outlined, 'Quick Notes', 'Cue cards in 20s', () => onNavigate(3)),
              _Quick(Icons.headset_mic_outlined, 'Study AI', 'Voice quiz + score', () => onNavigate(3)),
              _Quick(Icons.record_voice_over_outlined, 'Interview AI', 'Mock for a real JD', () => onNavigate(1)),
              _Quick(Icons.auto_awesome_rounded, 'Ask SAGE', 'Policies, people, plans', () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AskScreen()))),
            ],
          ),
        ],
      ],
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.name, required this.role, required this.minutes, required this.salary, required this.completion, required this.loading});
  final String name;
  final String? role;
  final Object? minutes;
  final Object? salary;
  final double completion;
  final bool loading;
  @override
  Widget build(BuildContext context) => InkHero(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('YOUR DAY AT A GLANCE', style: SageText.kicker(color: Colors.white54)),
          const SizedBox(height: 12),
          Text('${greeting()},\n$name.', style: SageText.display(32, color: Colors.white)),
          const SizedBox(height: 10),
          Text(
            loading
                ? 'Loading your workspace…'
                : 'Your plan is centred on ${role?.isNotEmpty == true ? role : 'your next role'}. ${minutes ?? 60} focused minutes set aside today.',
            style: SageText.body(14, color: Colors.white.withValues(alpha: .66)),
          ),
          const SizedBox(height: 20),
          Row(children: [
            ProgressRing(
              value: completion / 100,
              size: 78,
              stroke: 8,
              color: SageColors.lime,
              track: Colors.white12,
              child: Text('${completion.round()}%', style: SageText.title(17, color: Colors.white)),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: .07), borderRadius: BorderRadius.circular(18), border: Border.all(color: Colors.white12)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Career target', style: SageText.body(12, color: Colors.white54, weight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(salary == null ? '—' : '₹$salary LPA', style: SageText.display(24, color: Colors.white)),
                  Text('Aspirational · plan completion ${completion.round()}%', style: SageText.body(11.5, color: Colors.white.withValues(alpha: .45))),
                ]),
              ),
            ),
          ]),
        ]),
      );
}

class TaskTile extends StatefulWidget {
  const TaskTile({super.key, required this.task});
  final Map<String, dynamic> task;
  @override
  State<TaskTile> createState() => _TaskTileState();
}

class _TaskTileState extends State<TaskTile> {
  bool busy = false;
  late bool done = widget.task['status'] == 'done';

  Future<void> toggle() async {
    setState(() {
      busy = true;
      done = !done;
    });
    try {
      await Api.instance.patch('/v1/campus/tasks/${widget.task['id']}', {'status': done ? 'done' : 'pending', 'evidence': widget.task['evidence'] ?? ''});
      if (mounted) await context.read<Workspace>().refresh();
    } catch (e) {
      if (mounted) {
        setState(() => done = !done);
        toast(context, friendlyError(e));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.task;
    return SageCard(
      padding: const EdgeInsets.fromLTRB(10, 12, 16, 12),
      onTap: busy ? null : toggle,
      child: Row(children: [
        AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          margin: const EdgeInsets.all(6),
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            color: done ? SageColors.violet : Colors.transparent,
            shape: BoxShape.circle,
            border: Border.all(color: done ? SageColors.violet : SageColors.rule, width: 2),
          ),
          child: done ? const Icon(Icons.check_rounded, size: 16, color: Colors.white) : null,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${t['title']}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: SageText.title(14.5, color: done ? SageColors.muted : SageColors.ink).copyWith(decoration: done ? TextDecoration.lineThrough : null)),
            const SizedBox(height: 4),
            Text('${t['minutes']} min · ${t['category']} · ${dayOnly(t['due_at'])}', style: SageText.body(12.5, color: SageColors.muted)),
          ]),
        ),
      ]),
    );
  }
}

class _WeekStrip extends StatefulWidget {
  const _WeekStrip({required this.subjects, required this.workspace});
  final List<String> subjects;
  final Workspace workspace;
  @override
  State<_WeekStrip> createState() => _WeekStripState();
}

class _WeekStripState extends State<_WeekStrip> {
  late DateTime selected = DateTime.now();
  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final monday = DateTime(now.year, now.month, now.day).subtract(Duration(days: now.weekday - 1));
    final classes = classesFor(selected, widget.subjects);
    final events = [...widget.workspace.tasks, ...widget.workspace.deadlines].where((e) {
      final d = parseDate(e['due_at']);
      return d != null && sameDay(d, selected);
    }).toList();
    return SageCard(
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          for (var i = 0; i < 7; i++)
            Expanded(
              child: Builder(builder: (_) {
                final day = monday.add(Duration(days: i));
                final on = sameDay(day, selected);
                final isToday = sameDay(day, now);
                return GestureDetector(
                  onTap: () => setState(() => selected = day),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(color: on ? SageColors.ink : Colors.transparent, borderRadius: BorderRadius.circular(14)),
                    child: Column(children: [
                      Text(['M', 'T', 'W', 'T', 'F', 'S', 'S'][i], style: SageText.mono(10.5, color: on ? Colors.white60 : SageColors.muted)),
                      const SizedBox(height: 4),
                      Text('${day.day}', style: SageText.title(16, color: on ? Colors.white : SageColors.ink)),
                      const SizedBox(height: 4),
                      Container(width: 5, height: 5, decoration: BoxDecoration(color: isToday ? SageColors.lime : Colors.transparent, shape: BoxShape.circle)),
                    ]),
                  ),
                );
              }),
            ),
        ]),
        const SizedBox(height: 12),
        if (classes.isEmpty && events.isEmpty)
          Padding(padding: const EdgeInsets.all(8), child: Text('Nothing scheduled. A good day for deep work.', textAlign: TextAlign.center, style: SageText.body(13, color: SageColors.muted))),
        for (final c in classes) _AgendaRow(time: c.$1, title: c.$2, kind: 'Class · demo schedule', color: SageColors.violet),
        for (final e in events)
          _AgendaRow(
            time: parseDate(e['due_at']) == null ? '' : '${parseDate(e['due_at'])!.hour.toString().padLeft(2, '0')}:${parseDate(e['due_at'])!.minute.toString().padLeft(2, '0')}',
            title: '${e['title']}',
            kind: e.containsKey('category') && e['amount'] != null ? 'Deadline' : 'Task',
            color: e.containsKey('amount') ? SageColors.coral : SageColors.mintInk,
          ),
      ]),
    );
  }
}

class _AgendaRow extends StatelessWidget {
  const _AgendaRow({required this.time, required this.title, required this.kind, required this.color});
  final String time, title, kind;
  final Color color;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(children: [
          SizedBox(width: 50, child: Text(time, style: SageText.mono(12, color: SageColors.ink2))),
          Container(width: 3, height: 34, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(9))),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: SageText.title(14)),
              Text(kind, style: SageText.body(11.5, color: SageColors.muted)),
            ]),
          ),
        ]),
      );
}

class _DeadlineIcon extends StatelessWidget {
  const _DeadlineIcon({required this.category});
  final String? category;
  @override
  Widget build(BuildContext context) {
    final fee = category != null && category!.contains('fee');
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(color: fee ? SageColors.amberTint : SageColors.violetTint, borderRadius: BorderRadius.circular(14)),
      child: Icon(fee ? Icons.account_balance_wallet_outlined : Icons.assignment_outlined, color: fee ? SageColors.amberInk : SageColors.violet, size: 20),
    );
  }
}

class _Quick extends StatelessWidget {
  const _Quick(this.icon, this.title, this.subtitle, this.onTap);
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => SageCard(
        onTap: onTap,
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Icon(icon, color: SageColors.violet),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: SageText.title(14.5)),
            Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: SageText.body(12, color: SageColors.muted)),
          ]),
        ]),
      );
}
