import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/attendance.dart';
import '../core/format.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../core/workspace.dart';
import '../widgets/ui.dart';
import 'plan.dart' show PlannerView;

class AcademicsScreen extends StatefulWidget {
  const AcademicsScreen({super.key});
  @override
  State<AcademicsScreen> createState() => _AcademicsScreenState();
}

class _AcademicsScreenState extends State<AcademicsScreen> {
  String tab = 'timetable';
  @override
  Widget build(BuildContext context) {
    final w = context.watch<Workspace>();
    return Column(children: [
      PageHeader(kicker: 'BITSoM · Mumbai · ${w.profile['batch'] ?? 2026}', title: 'Academics'),
      Segmented(
        options: const [('timetable', 'Timetable'), ('attendance', 'Attendance'), ('priorities', 'Class priorities'), ('assignments', 'Assignments'), ('fees', 'Fees')],
        value: tab,
        onChanged: (v) => setState(() => tab = v),
      ),
      const SizedBox(height: 8),
      Expanded(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          child: KeyedSubtree(
            key: ValueKey(tab),
            child: w.data == null
                ? PageBody(children: [const SizedBox(height: 12), if (w.error != null) ErrorBanner(w.error!, onRetry: w.refresh) else const SkeletonList()])
                : switch (tab) {
                    'timetable' => const _Timetable(),
                    'attendance' => const _Attendance(),
                    'priorities' => const PlannerView(kind: 'class_recommendations'),
                    'assignments' => const _Deadlines(fees: false),
                    _ => const _Deadlines(fees: true),
                  },
          ),
        ),
      ),
    ]);
  }
}

// ---------------------------------------------------------------- timetable
class _Timetable extends StatefulWidget {
  const _Timetable();
  @override
  State<_Timetable> createState() => _TimetableState();
}

class _TimetableState extends State<_Timetable> {
  int offset = 0;
  @override
  Widget build(BuildContext context) {
    final w = context.watch<Workspace>();
    final subjects = ((w.profile['subjects'] as List?) ?? []).map((e) => '$e').toList();
    final now = DateTime.now();
    final monday = DateTime(now.year, now.month, now.day).subtract(Duration(days: now.weekday - 1)).add(Duration(days: 7 * offset));
    final events = [...w.tasks, ...w.deadlines];
    return PageBody(onRefresh: w.refresh, children: [
      const SizedBox(height: 8),
      Row(children: [
        IconButton.filledTonal(onPressed: () => setState(() => offset--), icon: const Icon(Icons.chevron_left_rounded)),
        Expanded(
          child: Column(children: [
            Text(offset == 0 ? 'This week' : offset == 1 ? 'Next week' : offset == -1 ? 'Last week' : 'Week of', style: SageText.title(16)),
            Text('${dayOnly(monday.toIso8601String())} – ${dayOnly(monday.add(const Duration(days: 6)).toIso8601String())}', style: SageText.body(12, color: SageColors.muted)),
          ]),
        ),
        IconButton.filledTonal(onPressed: () => setState(() => offset++), icon: const Icon(Icons.chevron_right_rounded)),
      ]),
      const SizedBox(height: 8),
      const NoticeBanner('Illustrative schedule from your selected courses (IST). No official timetable feed is connected.', icon: Icons.calendar_today_outlined),
      for (var i = 0; i < 7; i++)
        Builder(builder: (_) {
          final day = monday.add(Duration(days: i));
          final classes = classesFor(day, subjects);
          final dayEvents = events.where((e) {
            final d = parseDate(e['due_at']);
            return d != null && sameDay(d, day);
          }).toList();
          final isToday = sameDay(day, now);
          return Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 52,
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(color: isToday ? SageColors.ink : SageColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: isToday ? SageColors.ink : SageColors.rule)),
                child: Column(children: [
                  Text(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i].toUpperCase(), style: SageText.mono(10, color: isToday ? SageColors.lime : SageColors.muted)),
                  Text('${day.day}', style: SageText.display(20, color: isToday ? Colors.white : SageColors.ink)),
                ]),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(children: [
                  if (classes.isEmpty && dayEvents.isEmpty)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: SageColors.paper2.withValues(alpha: .5), borderRadius: BorderRadius.circular(16)),
                      child: Text(day.weekday == DateTime.sunday ? 'Rest day' : 'Free', style: SageText.body(13, color: SageColors.muted)),
                    ),
                  for (final c in classes)
                    _Slot(time: '${c.$1}–${c.$1 == '09:00' ? '10:30' : '12:30'}', title: c.$2, meta: 'Class', color: SageColors.violet,
                        now: isToday && _isNow(c.$1, c.$1 == '09:00' ? '10:30' : '12:30')),
                  for (final e in dayEvents)
                    _Slot(
                      time: parseDate(e['due_at']) == null ? '' : '${parseDate(e['due_at'])!.hour.toString().padLeft(2, '0')}:${parseDate(e['due_at'])!.minute.toString().padLeft(2, '0')}',
                      title: '${e['title']}',
                      meta: e.containsKey('amount') ? 'Deadline · ${e['status']}' : 'Task · ${e['minutes']} min',
                      color: e.containsKey('amount') ? SageColors.coral : SageColors.mintInk,
                    ),
                ]),
              ),
            ]),
          );
        }),
    ]);
  }

  bool _isNow(String start, String end) {
    final n = DateTime.now();
    final t = '${n.hour.toString().padLeft(2, '0')}:${n.minute.toString().padLeft(2, '0')}';
    return t.compareTo(start) >= 0 && t.compareTo(end) < 0;
  }
}

class _Slot extends StatelessWidget {
  const _Slot({required this.time, required this.title, required this.meta, required this.color, this.now = false});
  final String time, title, meta;
  final Color color;
  final bool now;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: .07),
          borderRadius: BorderRadius.circular(16),
          border: Border(left: BorderSide(color: color, width: 4)),
        ),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(time, style: SageText.mono(11.5, color: color, weight: FontWeight.w800)),
              const SizedBox(height: 3),
              Text(title, style: SageText.title(14)),
              Text(meta, style: SageText.body(11.5, color: SageColors.muted)),
            ]),
          ),
          if (now) const Pill('Now', tone: Tone.lime),
        ]),
      );
}

// ---------------------------------------------------------------- attendance
class _Attendance extends StatefulWidget {
  const _Attendance();
  @override
  State<_Attendance> createState() => _AttendanceState();
}

class _AttendanceState extends State<_Attendance> {
  final upcoming = TextEditingController(text: '236');
  final willAttend = TextEditingController(text: '170');

  @override
  Widget build(BuildContext context) {
    final book = context.watch<AttendanceBook>();
    final s = context.read<Session>();
    final w = context.read<Workspace>();
    if (book.rows.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => book.load('${s.user?['id']}', ((w.profile['subjects'] as List?) ?? []).map((e) => '$e').toList()));
      return const Padding(padding: EdgeInsets.all(20), child: SkeletonList());
    }
    final o = book.overall;
    final up = int.tryParse(upcoming.text) ?? 0;
    final will = int.tryParse(willAttend.text) ?? 0;
    final valid = up >= 0 && will >= 0 && will <= up;
    final projected = valid && book.held + up > 0 ? 100 * (book.attended + will) / (book.held + up) : null;
    final behind = (o.needed ?? 1) > 0;
    return PageBody(children: [
      const SizedBox(height: 8),
      InkHero(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            ProgressRing(
              value: (o.percentage ?? 0) / 100,
              size: 104,
              stroke: 10,
              color: behind ? SageColors.coral : SageColors.lime,
              track: Colors.white12,
              child: Text('${o.percentage?.toStringAsFixed(1) ?? '—'}%', style: SageText.display(21, color: Colors.white)),
            ),
            const SizedBox(width: 18),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('OVERALL ATTENDANCE', style: SageText.kicker(color: Colors.white54)),
                const SizedBox(height: 8),
                Text('${book.attended} of ${book.held} classes', style: SageText.title(17, color: Colors.white)),
                const SizedBox(height: 6),
                Text(
                  o.needed == null
                      ? '100% can’t be recovered after an absence.'
                      : o.needed! > 0
                          ? 'Attend the next ${o.needed} classes in a row to reach ${book.target.round()}%.'
                          : 'On target. You can miss ${o.canMiss} more and stay at ${book.target.round()}%+.',
                  style: SageText.body(13, color: behind ? const Color(0xFFFFB4A6) : SageColors.lime, weight: FontWeight.w700),
                ),
              ]),
            ),
          ]),
          const SizedBox(height: 16),
          Text('Target', style: SageText.body(12, color: Colors.white54, weight: FontWeight.w700)),
          const SizedBox(height: 8),
          Row(children: [
            for (final t in [75, 80, 85, 90])
              Expanded(
                child: GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    book.setTarget(t.toDouble());
                  },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: book.target == t ? SageColors.lime : Colors.white.withValues(alpha: .07), borderRadius: BorderRadius.circular(12)),
                    child: Text('$t%', style: SageText.title(14, color: book.target == t ? SageColors.ink : Colors.white)),
                  ),
                ),
              ),
          ]),
        ]),
      ),
      const SectionTitle('What-if calculator'),
      SageCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: TextField(controller: upcoming, keyboardType: TextInputType.number, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Upcoming classes'))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: willAttend, keyboardType: TextInputType.number, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'You’ll attend'))),
          ]),
          const SizedBox(height: 14),
          if (!valid)
            Text('Attended classes must be between zero and the upcoming total.', style: SageText.body(13, color: SageColors.coral))
          else
            Row(children: [
              Expanded(child: Text('Attend $will of the next $up →', style: SageText.body(14, weight: FontWeight.w600))),
              Text('${projected?.toStringAsFixed(1)}%', style: SageText.display(26, color: (projected ?? 0) >= book.target ? SageColors.mintInk : SageColors.coral)),
            ]),
          const SizedBox(height: 6),
          Text('(${book.attended} + $will) ÷ (${book.held} + $up) × 100', style: SageText.mono(11)),
        ]),
      ),
      const SectionTitle('By course'),
      for (var i = 0; i < book.rows.length; i++)
        Builder(builder: (_) {
          final r = book.rows[i];
          final c = attendanceFor(r.attended, r.held, book.target);
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: SageCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(r.course, style: SageText.title(14.5))),
                  Pill('${c.$1.toStringAsFixed(1)}%', tone: c.$2 > 0 ? Tone.amber : Tone.mint),
                ]),
                const SizedBox(height: 8),
                Bar(value: r.held == 0 ? 0 : r.attended / r.held, color: c.$2 > 0 ? SageColors.amber : SageColors.mintInk),
                const SizedBox(height: 8),
                Text(
                  '${r.attended}/${r.held} · ${c.$2 > 0 ? '${c.$2} in a row needed' : 'can miss ${c.$3}'}',
                  style: SageText.body(12.5, color: SageColors.muted),
                ),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(child: SageButton('Present', icon: Icons.check_rounded, compact: true, kind: ButtonKind.secondary, onPressed: () => book.mark(i, present: true))),
                  const SizedBox(width: 8),
                  Expanded(child: SageButton('Absent', icon: Icons.close_rounded, compact: true, kind: ButtonKind.secondary, onPressed: () => book.mark(i, present: false))),
                  IconButton(onPressed: () => book.undo(i), tooltip: 'Undo last', icon: const Icon(Icons.undo_rounded, color: SageColors.muted)),
                ]),
              ]),
            ),
          );
        }),
      const SizedBox(height: 4),
      Text('Tracked on this device — no student portal is connected. The target is a planning assumption, not a verified BITSoM policy.', style: SageText.body(12, color: SageColors.muted)),
      TextButton(onPressed: book.reset, child: const Text('Reset demo attendance')),
    ]);
  }
}

(double, int, int) attendanceFor(int attended, int held, double target) {
  final pct = held == 0 ? 0.0 : 100 * attended / held;
  final needed = target >= 100 ? (attended == held ? 0 : 999) : ((target * held - 100 * attended) / (100 - target)).ceil().clamp(0, 9999);
  final canMiss = ((100 * attended - target * held) / target).floor().clamp(0, 9999);
  return (pct, needed, canMiss);
}

// ---------------------------------------------------------------- assignments & fees
class _Deadlines extends StatefulWidget {
  const _Deadlines({required this.fees});
  final bool fees;
  @override
  State<_Deadlines> createState() => _DeadlinesState();
}

class _DeadlinesState extends State<_Deadlines> {
  String busy = '';

  Future<void> act(Map<String, dynamic> d) async {
    setState(() => busy = '${d['id']}');
    try {
      final r = await Api.instance.post('/v1/campus/deadlines/${d['id']}/${widget.fees ? 'checkout' : 'complete'}', {'idempotency_key': newKey()}) as Map?;
      if (widget.fees && r?['checkout_url'] != null) {
        await launchUrl(Uri.parse('${r!['checkout_url']}'), mode: LaunchMode.inAppBrowserView);
      } else {
        HapticFeedback.mediumImpact();
      }
      if (mounted) await context.read<Workspace>().refresh();
    } catch (e) {
      if (mounted) toast(context, friendlyError(e));
    } finally {
      if (mounted) setState(() => busy = '');
    }
  }

  Future<void> add() async {
    final title = TextEditingController();
    DateTime due = DateTime.now().add(const Duration(days: 3, hours: 2));
    await sheet(
      context,
      StatefulBuilder(
        builder: (ctx, set) => Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 24 + MediaQuery.viewInsetsOf(ctx).bottom),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Add assignment', style: SageText.display(24)),
            const FieldLabel('Title'),
            TextField(controller: title, autofocus: true, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(hintText: 'e.g. Marketing case write-up')),
            const FieldLabel('Due'),
            SageCard(
              onTap: () async {
                final d = await showDatePicker(context: ctx, initialDate: due, firstDate: DateTime.now().subtract(const Duration(days: 1)), lastDate: DateTime.now().add(const Duration(days: 365)));
                if (d == null || !ctx.mounted) return;
                final t = await showTimePicker(context: ctx, initialTime: TimeOfDay.fromDateTime(due));
                set(() => due = DateTime(d.year, d.month, d.day, t?.hour ?? 23, t?.minute ?? 59));
              },
              child: Row(children: [const Icon(Icons.event_rounded, color: SageColors.violet), const SizedBox(width: 10), Text(dayTime(due.toIso8601String()), style: SageText.body(14, weight: FontWeight.w700))]),
            ),
            const SizedBox(height: 20),
            SageButton('Add assignment', icon: Icons.add_rounded, kind: ButtonKind.violet, expand: true, onPressed: () async {
              if (title.text.trim().length < 2) return;
              try {
                await Api.instance.post('/v1/campus/deadlines', {'title': title.text.trim(), 'category': 'assignment', 'due_at': due.toUtc().toIso8601String()});
                if (ctx.mounted) Navigator.pop(ctx);
                if (mounted) await context.read<Workspace>().refresh();
              } catch (e) {
                if (ctx.mounted) toast(ctx, friendlyError(e));
              }
            }),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final w = context.watch<Workspace>();
    final items = w.deadlines.where((d) => widget.fees ? d['category'] != 'assignment' : d['category'] == 'assignment').toList()
      ..sort((a, b) => '${a['due_at']}'.compareTo('${b['due_at']}'));
    final pending = items.where((d) => d['status'] == 'pending').toList();
    final total = pending.fold<num>(0, (n, d) => n + ((d['amount'] as num?) ?? 0));
    return PageBody(onRefresh: w.refresh, children: [
      const SizedBox(height: 8),
      if (widget.fees)
        InkHero(
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('OUTSTANDING', style: SageText.kicker(color: Colors.white54)),
                const SizedBox(height: 8),
                Text(inr(total), style: SageText.display(32, color: Colors.white)),
                const SizedBox(height: 4),
                Text('${pending.length} fee${pending.length == 1 ? '' : 's'} due · Razorpay TEST', style: SageText.body(12.5, color: Colors.white60)),
              ]),
            ),
            const Icon(Icons.account_balance_wallet_outlined, color: SageColors.lime, size: 36),
          ]),
        )
      else
        Row(children: [
          Expanded(child: MetricTile(label: 'Pending', value: '${pending.length}', icon: Icons.assignment_outlined, tone: Tone.violet)),
          const SizedBox(width: 12),
          Expanded(
            child: MetricTile(
              label: 'Overdue',
              value: '${pending.where((d) => parseDate(d['due_at'])?.isBefore(DateTime.now()) ?? false).length}',
              icon: Icons.schedule_rounded,
              tone: Tone.coral,
            ),
          ),
        ]),
      const SizedBox(height: 12),
      NoticeBanner(
        widget.fees
            ? 'Demo fees. Checkout uses Razorpay TEST mode — no real money moves and this is not an institutional receipt.'
            : 'If a deadline passes and you opted in, SAGE calls your own number once (9 am–6 pm IST) to understand what got in the way.',
        icon: widget.fees ? Icons.science_outlined : Icons.phone_callback_outlined,
        tone: widget.fees ? Tone.amber : Tone.violet,
      ),
      const SizedBox(height: 12),
      Row(children: [
        if (!widget.fees) ...[Expanded(child: SageButton('Add assignment', icon: Icons.add_rounded, compact: true, onPressed: add)), const SizedBox(width: 8)],
        Expanded(
          child: SageButton('Load demo items', icon: Icons.auto_fix_high_rounded, compact: true, kind: ButtonKind.secondary, onPressed: () async {
            try {
              await Api.instance.post('/v1/campus/deadlines/demo');
              if (mounted) await context.read<Workspace>().refresh();
            } catch (e) {
              if (mounted) toast(context, friendlyError(e));
            }
          }),
        ),
      ]),
      const SizedBox(height: 14),
      if (items.isEmpty) EmptyState(icon: widget.fees ? Icons.receipt_long_outlined : Icons.assignment_turned_in_outlined, title: 'Nothing here yet', message: widget.fees ? 'Load demo fees to try the Razorpay test checkout.' : 'Add an assignment or load the demo set.'),
      for (final d in items)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: SageCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(child: Text('${d['title']}', style: SageText.title(15))),
                const SizedBox(width: 8),
                Pill(d['status'] == 'pending' ? relative(d['due_at']) : 'Done',
                    tone: d['status'] != 'pending' ? Tone.mint : (parseDate(d['due_at'])?.isBefore(DateTime.now()) ?? false) ? Tone.coral : Tone.amber),
              ]),
              const SizedBox(height: 6),
              Text('Due ${dayTime(d['due_at'])}${widget.fees ? ' · ${inr((d['amount'] as num?) ?? 0)}' : ''}', style: SageText.body(13, color: SageColors.muted)),
              if (d['reminder_state'] != null && d['reminder_state'] != 'pending' || d['reason'] != null) ...[
                const SizedBox(height: 6),
                Text('Follow-up: ${d['call_status'] ?? d['reminder_state']}${d['reason'] != null ? ' · Reason: ${d['reason']}' : ''}', style: SageText.body(12, color: SageColors.violet, weight: FontWeight.w600)),
              ],
              if (d['status'] == 'pending') ...[
                const SizedBox(height: 12),
                SageButton(widget.fees ? 'Pay with Razorpay TEST' : 'Mark completed',
                    icon: widget.fees ? Icons.lock_outline_rounded : Icons.check_rounded,
                    kind: widget.fees ? ButtonKind.violet : ButtonKind.secondary,
                    compact: true,
                    loading: busy == '${d['id']}',
                    onPressed: () => act(d)),
              ],
            ]),
          ),
        ),
    ]);
  }
}
