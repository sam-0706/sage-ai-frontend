import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/academics.dart';
import '../core/api.dart';
import '../core/format.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../core/workspace.dart';
import '../widgets/ui.dart';
import 'career.dart' show handleUpgrade;

const readinessLabel = {'not_ready': 'Not ready yet', 'developing': 'Developing', 'nearly_ready': 'Nearly ready', 'ready': 'Exam ready'};
Tone readinessTone(String? r) => switch (r) { 'ready' => Tone.mint, 'nearly_ready' => Tone.violet, 'developing' => Tone.amber, _ => Tone.coral };

class PrepScreen extends StatefulWidget {
  const PrepScreen({super.key});
  @override
  State<PrepScreen> createState() => _PrepScreenState();
}

class _PrepScreenState extends State<PrepScreen> {
  String tab = 'notes';
  Map<String, dynamic>? overview;
  List<Map<String, dynamic>>? decks;
  String? error;

  @override
  void initState() {
    super.initState();
    overview = (Api.instance.cached('/v1/exam-prep/overview') as Map?)?.cast<String, dynamic>();
    final d = Api.instance.cached('/v1/exam-prep/decks');
    if (d is Map) decks = (d['items'] as List).cast<Map>().map((e) => e.cast<String, dynamic>()).toList();
    load();
  }

  Future<void> load() async {
    try {
      final r = await Future.wait([Api.instance.get('/v1/exam-prep/overview'), Api.instance.get('/v1/exam-prep/decks')]);
      Api.instance.remember('/v1/exam-prep/overview', r[0]);
      Api.instance.remember('/v1/exam-prep/decks', r[1]);
      if (!mounted) return;
      setState(() {
        overview = (r[0] as Map).cast<String, dynamic>();
        decks = ((r[1] as Map)['items'] as List).cast<Map>().map((e) => e.cast<String, dynamic>()).toList();
        error = null;
      });
    } catch (e) {
      if (mounted) setState(() => error = friendlyError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      const PageHeader(kicker: 'Exam prep', title: 'Learn it. Prove it.'),
      Segmented(
        options: const [('notes', 'Quick Notes'), ('study', 'Study AI'), ('library', 'BITSoM library'), ('results', 'Results')],
        value: tab,
        onChanged: (v) => setState(() => tab = v),
      ),
      const SizedBox(height: 8),
      Expanded(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          child: KeyedSubtree(
            key: ValueKey(tab),
            child: switch (tab) {
              'notes' => _QuickNotes(decks: decks, overview: overview, error: error, onChanged: load),
              'study' => _StudyAI(decks: decks, onChanged: load),
              'library' => const _Library(),
              _ => _Results(overview: overview, onRefresh: load),
            },
          ),
        ),
      ),
    ]);
  }
}

// ---------------------------------------------------------------- Quick Notes
class _QuickNotes extends StatefulWidget {
  const _QuickNotes({required this.decks, required this.overview, required this.error, required this.onChanged});
  final List<Map<String, dynamic>>? decks;
  final Map<String, dynamic>? overview;
  final String? error;
  final Future<void> Function() onChanged;
  @override
  State<_QuickNotes> createState() => _QuickNotesState();
}

class _QuickNotesState extends State<_QuickNotes> {
  String? subject;
  String _current = 'Custom';
  final topic = TextEditingController();
  final notes = TextEditingController();
  bool useNotes = false;
  int count = 12;
  bool busy = false;

  Future<void> generate() async {
    setState(() => busy = true);
    try {
      final t = topic.text.trim();
      final deck = await Api.instance.post('/v1/exam-prep/decks', {
        'topic': _current == 'Custom' ? t : '$_current: $t',
        'level': 'BITSoM MBA',
        'exam': _current == 'Custom' ? null : _current,
        'count': count,
        'notes': useNotes && notes.text.trim().isNotEmpty ? notes.text : null,
      }) as Map;
      HapticFeedback.mediumImpact();
      topic.clear();
      unawaited(widget.onChanged());
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => DeckScreen(deckId: '${deck['id']}', initial: deck.cast<String, dynamic>())));
      unawaited(widget.onChanged());
    } catch (e) {
      if (mounted) handleUpgrade(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final w = context.watch<Workspace>();
    final subjects = [...((w.profile['subjects'] as List?) ?? []).map((e) => '$e'), 'Custom'];
    // Profile subjects arrive after first paint; only a user pick sticks.
    _current = subject != null && subjects.contains(subject) ? subject! : subjects.first;
    final o = widget.overview;
    return PageBody(onRefresh: widget.onChanged, children: [
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: MetricTile(label: 'Cards due', value: '${o?['due_now'] ?? '—'}', icon: Icons.bolt_rounded, tone: Tone.lime)),
        const SizedBox(width: 12),
        Expanded(child: MetricTile(label: 'Streak', value: o == null ? '—' : '${o['streak_days']}d', icon: Icons.local_fire_department_outlined, tone: Tone.coral)),
      ]),
      const SizedBox(height: 14),
      SageCard(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Icon(Icons.auto_awesome_rounded, color: SageColors.violet, size: 20),
            const SizedBox(width: 8),
            Expanded(child: Text('Make cue cards', style: SageText.title(17))),
            Text('~20 s', style: SageText.mono(11.5)),
          ]),
          const FieldLabel('Subject'),
          DropdownButtonFormField<String>(
            key: ValueKey(subjects.join('|')),
            initialValue: _current,
            isExpanded: true,
            items: [for (final s in subjects) DropdownMenuItem(value: s, child: Text(s, overflow: TextOverflow.ellipsis))],
            onChanged: (v) => setState(() => subject = v),
          ),
          const FieldLabel('Topic'),
          TextField(
            controller: topic,
            onChanged: (_) => setState(() {}),
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(hintText: 'e.g. Porter’s five forces, NPV, Little’s law'),
          ),
          const FieldLabel('Cards'),
          ChoiceChips(options: const ['8', '12', '16', '20'], selected: {'$count'}, multi: false, onToggle: (v) => setState(() => count = int.parse(v))),
          const SizedBox(height: 10),
          Row(children: [
            Switch.adaptive(value: useNotes, activeTrackColor: SageColors.violet, onChanged: (v) => setState(() => useNotes = v)),
            const SizedBox(width: 6),
            Expanded(child: Text('Use my own notes', style: SageText.body(14, weight: FontWeight.w700))),
          ]),
          if (useNotes)
            TextField(controller: notes, minLines: 4, maxLines: 10, decoration: const InputDecoration(hintText: 'Paste lecture notes or a syllabus section — cards will use only this text')),
          const SizedBox(height: 14),
          SageButton('Generate cue cards', icon: Icons.style_outlined, kind: ButtonKind.violet, expand: true, loading: busy, onPressed: topic.text.trim().length >= 2 ? generate : null),
          if (busy) Padding(padding: const EdgeInsets.only(top: 10), child: Text('Writing your cards…', textAlign: TextAlign.center, style: SageText.body(12.5, color: SageColors.muted))),
        ]),
      ),
      const SectionTitle('Your decks'),
      if (widget.error != null && widget.decks == null) ErrorBanner(widget.error!, onRetry: widget.onChanged),
      if (widget.decks == null && widget.error == null) const SkeletonList(count: 3, height: 86),
      if (widget.decks != null && widget.decks!.isEmpty)
        const EmptyState(icon: Icons.style_outlined, title: 'No decks yet', message: 'Pick a subject and topic above. Your first deck takes about 20 seconds.'),
      for (final d in widget.decks ?? []) Padding(padding: const EdgeInsets.only(bottom: 10), child: DeckTile(deck: d, onChanged: widget.onChanged)),
    ]);
  }
}

class DeckTile extends StatelessWidget {
  const DeckTile({super.key, required this.deck, required this.onChanged, this.tab});
  final Map<String, dynamic> deck;
  final Future<void> Function() onChanged;
  final String? tab;
  @override
  Widget build(BuildContext context) {
    final count = (deck['card_count'] as num?) ?? 0;
    final learned = (deck['learned'] as num?) ?? 0;
    final due = (deck['due_now'] as num?) ?? 0;
    return SageCard(
      onTap: () async {
        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => DeckScreen(deckId: '${deck['id']}', initialTab: tab)));
        unawaited(onChanged());
      },
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text('${deck['title']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: SageText.title(15.5))),
          if (deck['last_readiness'] != null) ...[const SizedBox(width: 8), Pill('${deck['last_score']}%', tone: readinessTone(deck['last_readiness'] as String?))],
        ]),
        const SizedBox(height: 10),
        Bar(value: count == 0 ? 0 : learned / count, height: 6),
        const SizedBox(height: 8),
        Row(children: [
          Text('$count cards · $learned learned', style: SageText.body(12.5, color: SageColors.muted)),
          const Spacer(),
          if (due > 0) Pill('$due due', tone: Tone.lime),
        ]),
      ]),
    );
  }
}

// ---------------------------------------------------------------- Study AI
class _StudyAI extends StatelessWidget {
  const _StudyAI({required this.decks, required this.onChanged});
  final List<Map<String, dynamic>>? decks;
  final Future<void> Function() onChanged;
  @override
  Widget build(BuildContext context) => PageBody(onRefresh: onChanged, children: [
        const SizedBox(height: 8),
        InkHero(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('STUDY AI', style: SageText.kicker(color: SageColors.lime)),
            const SizedBox(height: 10),
            Text('An AI tutor calls and quizzes you out loud.', style: SageText.display(24, color: Colors.white)),
            const SizedBox(height: 10),
            Text('Miss one and it explains. Afterwards you get a score, readiness, weak topics and a study plan — and weak cards come back into review.',
                style: SageText.body(13.5, color: Colors.white70)),
            const SizedBox(height: 16),
            Wrap(spacing: 8, runSpacing: 8, children: const [
              Pill('~5 min call', tone: Tone.lime),
              Pill('Consent first', tone: Tone.ink),
              Pill('Your number only', tone: Tone.ink),
            ]),
          ]),
        ),
        const SectionTitle('Pick a deck to be quizzed on'),
        if (decks == null) const SkeletonList(count: 3, height: 86),
        if (decks != null && decks!.isEmpty) const EmptyState(icon: Icons.headset_mic_outlined, title: 'Make a deck first', message: 'Study AI quizzes you on a deck. Create one in Quick Notes.'),
        for (final d in decks ?? []) Padding(padding: const EdgeInsets.only(bottom: 10), child: DeckTile(deck: d, onChanged: onChanged, tab: 'quiz')),
      ]);
}

// ---------------------------------------------------------------- Results dashboard
class _Results extends StatefulWidget {
  const _Results({required this.overview, required this.onRefresh});
  final Map<String, dynamic>? overview;
  final Future<void> Function() onRefresh;
  @override
  State<_Results> createState() => _ResultsState();
}

class _ResultsState extends State<_Results> {
  List<Map<String, dynamic>>? items;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final r = await Api.instance.get('/v1/exam-prep/assessments') as Map;
      if (mounted) setState(() => items = (r['items'] as List).cast<Map>().map((e) => e.cast<String, dynamic>()).toList());
    } catch (_) {
      if (mounted) setState(() => items = []);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ok = (items ?? []).where((a) => a['status'] == 'succeeded').toList();
    final avg = ok.isEmpty ? 0.0 : ok.map((a) => (a['overall_score'] as num).toDouble()).reduce((a, b) => a + b) / ok.length;
    return PageBody(
      onRefresh: () async {
        await Future.wait([load(), widget.onRefresh()]);
      },
      children: [
        const SizedBox(height: 8),
        InkHero(
          child: Row(children: [
            ProgressRing(value: avg / 100, size: 96, stroke: 9, color: SageColors.lime, track: Colors.white12, child: Text('${avg.round()}%', style: SageText.display(22, color: Colors.white))),
            const SizedBox(width: 18),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('EXAM READINESS', style: SageText.kicker(color: Colors.white54)),
                const SizedBox(height: 8),
                Text(ok.isEmpty ? 'No quizzes yet' : 'Average across ${ok.length} quiz${ok.length == 1 ? '' : 'zes'}', style: SageText.title(17, color: Colors.white)),
                const SizedBox(height: 6),
                Text('${widget.overview?['reviewed_today'] ?? 0} cards reviewed today · ${widget.overview?['streak_days'] ?? 0}-day streak', style: SageText.body(12.5, color: Colors.white60)),
              ]),
            ),
          ]),
        ),
        if (ok.length >= 2) ...[
          const SectionTitle('Score trend'),
          SageCard(child: SizedBox(height: 120, child: _Trend(values: ok.reversed.map((a) => (a['overall_score'] as num).toDouble()).toList()))),
        ],
        const SectionTitle('Quiz history'),
        if (items == null) const SkeletonList(count: 3, height: 72),
        if (items != null && items!.isEmpty) const EmptyState(icon: Icons.insights_rounded, title: 'Your analytics live here', message: 'Take a Study AI quiz and SAGE shows exactly where you stand.'),
        for (final a in items ?? [])
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: SageCard(
              onTap: a['status'] == 'succeeded' ? () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => AssessmentScreen(id: '${a['id']}'))) : null,
              child: Row(children: [
                ProgressRing(value: ((a['overall_score'] as num?) ?? 0) / 100, size: 48, stroke: 5, child: Text('${a['overall_score'] ?? '–'}', style: SageText.title(13))),
                const SizedBox(width: 14),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${a['deck_title'] ?? 'Quiz'}', maxLines: 1, overflow: TextOverflow.ellipsis, style: SageText.title(14.5)),
                  Text(dayTime(a['created_at']), style: SageText.body(12, color: SageColors.muted)),
                ])),
                if (a['readiness'] != null) Pill(readinessLabel[a['readiness']] ?? '', tone: readinessTone(a['readiness'] as String?)),
              ]),
            ),
          ),
      ],
    );
  }
}

class _Trend extends StatelessWidget {
  const _Trend({required this.values});
  final List<double> values;
  @override
  Widget build(BuildContext context) => CustomPaint(painter: _TrendPainter(values), size: Size.infinite);
}

class _TrendPainter extends CustomPainter {
  _TrendPainter(this.v);
  final List<double> v;
  @override
  void paint(Canvas canvas, Size s) {
    if (v.length < 2) return;
    final dx = s.width / (v.length - 1);
    Offset pt(int i) => Offset(i * dx, s.height - (v[i] / 100) * (s.height - 12) - 6);
    final line = Path()..moveTo(pt(0).dx, pt(0).dy);
    for (var i = 1; i < v.length; i++) {
      final a = pt(i - 1), b = pt(i);
      line.cubicTo((a.dx + b.dx) / 2, a.dy, (a.dx + b.dx) / 2, b.dy, b.dx, b.dy);
    }
    final fill = Path.from(line)..lineTo(s.width, s.height)..lineTo(0, s.height)..close();
    canvas.drawPath(fill, Paint()..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [SageColors.violet.withValues(alpha: .25), SageColors.violet.withValues(alpha: 0)]).createShader(Offset.zero & s));
    canvas.drawPath(line, Paint()..color = SageColors.violet..style = PaintingStyle.stroke..strokeWidth = 3..strokeCap = StrokeCap.round);
    for (var i = 0; i < v.length; i++) {
      canvas.drawCircle(pt(i), 4.5, Paint()..color = Colors.white);
      canvas.drawCircle(pt(i), 4.5, Paint()..color = SageColors.violet..style = PaintingStyle.stroke..strokeWidth = 2.5);
    }
  }

  @override
  bool shouldRepaint(covariant _TrendPainter o) => o.v != v;
}

// ---------------------------------------------------------------- BITSoM starter library (offline)
class _Library extends StatelessWidget {
  const _Library();
  @override
  Widget build(BuildContext context) => PageBody(children: [
        const SizedBox(height: 8),
        const NoticeBanner(curriculumNotice, icon: Icons.menu_book_outlined, tone: Tone.violet),
        for (final term in [1, 2, 3]) ...[
          SectionTitle('Term $term'),
          for (final c in starterCourses.where((c) => c.term == term))
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SageCard(
                onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => StarterDeckScreen(course: c))),
                child: Row(children: [
                  Container(width: 40, height: 40, alignment: Alignment.center, decoration: BoxDecoration(color: SageColors.violetTint, borderRadius: BorderRadius.circular(12)), child: Text('T$term', style: SageText.mono(12, color: SageColors.violet, weight: FontWeight.w800))),
                  const SizedBox(width: 12),
                  Expanded(child: Text(c.name, style: SageText.title(14.5))),
                  Pill('${c.cards.length} cards'),
                ]),
              ),
            ),
        ],
      ]);
}

class StarterDeckScreen extends StatefulWidget {
  const StarterDeckScreen({super.key, required this.course});
  final StarterCourse course;
  @override
  State<StarterDeckScreen> createState() => _StarterDeckScreenState();
}

class _StarterDeckScreenState extends State<StarterDeckScreen> {
  bool practice = false;
  @override
  Widget build(BuildContext context) {
    final cards = widget.course.cards.map((c) => {'id': null, 'front': c.question, 'back': c.answer, 'concept': widget.course.name, 'difficulty': 'core'}).toList();
    return Scaffold(
      appBar: AppBar(title: Text(widget.course.name, overflow: TextOverflow.ellipsis)),
      body: Column(children: [
        Segmented(options: const [('qa', 'Questions & answers'), ('practice', 'Cue cards')], value: practice ? 'practice' : 'qa', onChanged: (v) => setState(() => practice = v == 'practice')),
        const SizedBox(height: 12),
        Expanded(child: practice ? FlipPractice(cards: cards) : _QAList(cards: cards)),
      ]),
    );
  }
}

// ---------------------------------------------------------------- Deck detail
class DeckScreen extends StatefulWidget {
  const DeckScreen({super.key, required this.deckId, this.initialTab, this.initial, this.interview = false});
  final String deckId;
  final String? initialTab;
  final Map<String, dynamic>? initial;
  final bool interview;
  @override
  State<DeckScreen> createState() => _DeckScreenState();
}

class _DeckScreenState extends State<DeckScreen> {
  late String tab = widget.initialTab ?? 'qa';
  Map<String, dynamic>? deck;
  String? error;

  @override
  void initState() {
    super.initState();
    deck = widget.initial;
    load();
  }

  Future<void> load() async {
    try {
      final d = await Api.instance.get('/v1/exam-prep/decks/${widget.deckId}') as Map;
      if (mounted) setState(() => deck = d.cast<String, dynamic>());
    } catch (e) {
      if (mounted) setState(() => error = friendlyError(e));
    }
  }

  Future<void> delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete deck?'),
        content: const Text('This removes the deck and its review history.'),
        actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep')), TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete deck'))],
      ),
    );
    if (ok != true) return;
    await Api.instance.delete('/v1/exam-prep/decks/${widget.deckId}');
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final d = deck;
    final cards = ((d?['cards'] as List?) ?? []).cast<Map>().map((e) => e.cast<String, dynamic>()).toList();
    final concepts = ((d?['key_concepts'] as List?) ?? []).cast<Map>();
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.interview ? 'Interview AI' : 'Deck'),
        actions: [IconButton(onPressed: d == null ? null : delete, icon: const Icon(Icons.delete_outline_rounded), tooltip: 'Delete deck')],
      ),
      body: d == null
          ? Padding(padding: const EdgeInsets.all(20), child: error != null ? ErrorBanner(error!, onRetry: load) : const SkeletonList())
          : Column(children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${d['title']}', style: SageText.display(24)),
                  const SizedBox(height: 8),
                  Text('${d['summary']}', maxLines: 3, overflow: TextOverflow.ellipsis, style: SageText.body(13.5, color: SageColors.muted)),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 30,
                    child: ListView(scrollDirection: Axis.horizontal, children: [
                      for (final k in concepts) Padding(padding: const EdgeInsets.only(right: 6), child: Tooltip(message: '${k['explanation']}', child: Pill('${k['name']}', tone: Tone.violet))),
                    ]),
                  ),
                ]),
              ),
              Segmented(
                options: [('qa', 'Q&A'), ('practice', 'Cue cards'), ('quiz', widget.interview ? 'Mock call' : 'Voice quiz'), ('results', 'Results')],
                value: tab,
                onChanged: (v) => setState(() => tab = v),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: switch (tab) {
                  'qa' => _QAList(cards: cards),
                  'practice' => FlipPractice(cards: cards, deckId: widget.deckId, onDone: load),
                  'quiz' => ListView(padding: const EdgeInsets.fromLTRB(20, 0, 20, 40), children: [
                      CallPanel(deckId: widget.deckId, interview: widget.interview, onAnalysed: (id) async {
                        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => AssessmentScreen(id: id)));
                        unawaited(load());
                      }),
                    ]),
                  _ => ListView(padding: const EdgeInsets.fromLTRB(20, 0, 20, 40), children: [
                      if (((d['assessments'] as List?) ?? []).isEmpty) const EmptyState(icon: Icons.insights_rounded, title: 'No results yet', message: 'Take the voice quiz to see where you stand.'),
                      for (final a in ((d['assessments'] as List?) ?? []).cast<Map>())
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: SageCard(
                            onTap: a['status'] == 'succeeded' ? () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => AssessmentScreen(id: '${a['id']}'))) : null,
                            child: Row(children: [
                              ProgressRing(value: ((a['overall_score'] as num?) ?? 0) / 100, size: 46, stroke: 5, child: Text('${a['overall_score'] ?? '–'}', style: SageText.title(13))),
                              const SizedBox(width: 14),
                              Expanded(child: Text(readinessLabel[a['readiness']] ?? '${a['status']}', style: SageText.title(15))),
                              Text(relative(a['created_at']).replaceAll('overdue', 'ago'), style: SageText.body(12, color: SageColors.muted)),
                            ]),
                          ),
                        ),
                    ]),
                },
              ),
            ]),
    );
  }
}

class _QAList extends StatelessWidget {
  const _QAList({required this.cards});
  final List<Map<String, dynamic>> cards;
  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 40),
        itemCount: cards.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (_, i) {
          final c = cards[i];
          return SageCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text('Q${i + 1}', style: SageText.mono(12, color: SageColors.violet, weight: FontWeight.w800)),
                const SizedBox(width: 8),
                Expanded(child: Text('${c['concept'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: SageText.body(12, color: SageColors.muted, weight: FontWeight.w700))),
                if (c['difficulty'] != null) Pill('${c['difficulty']}'),
              ]),
              const SizedBox(height: 8),
              Text('${c['front']}', style: SageText.title(15.5)),
              const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider()),
              Text('${c['back']}', style: SageText.body(14)),
              if (c['mnemonic'] != null) ...[
                const SizedBox(height: 8),
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Icon(Icons.lightbulb_outline_rounded, size: 16, color: SageColors.violet),
                  const SizedBox(width: 6),
                  Expanded(child: Text('${c['mnemonic']}', style: SageText.body(13, color: SageColors.violet, weight: FontWeight.w700))),
                ]),
              ],
            ]),
          );
        },
      );
}

/// Flip-to-reveal practice. With a deckId, ratings go to spaced repetition; otherwise it's self-check only.
class FlipPractice extends StatefulWidget {
  const FlipPractice({super.key, required this.cards, this.deckId, this.onDone});
  final List<Map<String, dynamic>> cards;
  final String? deckId;
  final VoidCallback? onDone;
  @override
  State<FlipPractice> createState() => _FlipPracticeState();
}

class _FlipPracticeState extends State<FlipPractice> {
  late List<Map<String, dynamic>> queue = List.of(widget.cards);
  int i = 0;
  bool flipped = false;
  int known = 0;

  Future<void> rate(int r) async {
    final c = queue[i];
    HapticFeedback.selectionClick();
    if (widget.deckId != null && c['id'] != null) {
      unawaited(Api.instance.post('/v1/exam-prep/cards/${c['id']}/review', {'rating': r}).catchError((_) => null));
    }
    setState(() {
      if (r >= 3) known++;
      if (r == 1) queue.add(c);
      i++;
      flipped = false;
    });
    if (i >= queue.length) widget.onDone?.call();
  }

  @override
  Widget build(BuildContext context) {
    if (queue.isEmpty) return const Padding(padding: EdgeInsets.all(20), child: EmptyState(icon: Icons.style_outlined, title: 'No cards', message: 'This deck is empty.'));
    if (i >= queue.length) {
      return Padding(
        padding: const EdgeInsets.all(20),
        child: EmptyState(
          icon: Icons.celebration_outlined,
          title: 'Round complete',
          message: '$known of ${widget.cards.length} marked known. Cards you missed come back just before you’d forget them.',
          action: SageButton('Go again', icon: Icons.replay_rounded, onPressed: () => setState(() {
                queue = List.of(widget.cards);
                i = 0;
                known = 0;
              })),
        ),
      );
    }
    final c = queue[i];
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 110),
      child: Column(children: [
        Row(children: [
          Text('${i + 1} / ${queue.length}', style: SageText.mono(12, color: SageColors.ink2)),
          const SizedBox(width: 12),
          Expanded(child: Bar(value: (i) / queue.length, height: 6)),
        ]),
        const SizedBox(height: 16),
        Expanded(
          child: GestureDetector(
            onTap: () {
              HapticFeedback.lightImpact();
              setState(() => flipped = !flipped);
            },
            child: TweenAnimationBuilder<double>(
              key: ValueKey(i),
              tween: Tween(begin: 0, end: flipped ? 1 : 0),
              duration: const Duration(milliseconds: 420),
              curve: Curves.easeInOutCubic,
              builder: (_, t, _) {
                final showBack = t > .5;
                return Transform(
                  alignment: Alignment.center,
                  transform: Matrix4.identity()
                    ..setEntry(3, 2, 0.0012)
                    ..rotateY(math.pi * t),
                  child: Transform(
                    alignment: Alignment.center,
                    transform: Matrix4.identity()..rotateY(showBack ? math.pi : 0),
                    child: _CardFace(back: showBack, text: showBack ? '${c['back']}' : '${c['front']}', concept: '${c['concept'] ?? ''}', hint: c['hint'] as String?),
                  ),
                );
              },
            ),
          ),
        ),
        const SizedBox(height: 16),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 200),
          child: !flipped
              ? SageButton('Show answer', key: const ValueKey('show'), icon: Icons.flip_rounded, expand: true, onPressed: () => setState(() => flipped = true))
              : Row(key: const ValueKey('rate'), children: [
                  Expanded(child: SageButton('Again', kind: ButtonKind.danger, compact: true, onPressed: () => rate(1))),
                  const SizedBox(width: 6),
                  Expanded(child: SageButton('Hard', kind: ButtonKind.secondary, compact: true, onPressed: () => rate(2))),
                  const SizedBox(width: 6),
                  Expanded(child: SageButton('Good', kind: ButtonKind.primary, compact: true, onPressed: () => rate(3))),
                  const SizedBox(width: 6),
                  Expanded(child: SageButton('Easy', kind: ButtonKind.lime, compact: true, onPressed: () => rate(4))),
                ]),
        ),
      ]),
    );
  }
}

class _CardFace extends StatelessWidget {
  const _CardFace({required this.back, required this.text, required this.concept, this.hint});
  final bool back;
  final String text, concept;
  final String? hint;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(26),
        decoration: BoxDecoration(
          color: back ? SageColors.ink : SageColors.card,
          borderRadius: BorderRadius.circular(30),
          border: Border.all(color: back ? SageColors.ink : SageColors.rule),
          boxShadow: [BoxShadow(color: SageColors.violetDeep.withValues(alpha: back ? .3 : .08), blurRadius: 36, offset: const Offset(0, 16))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(back ? 'ANSWER' : 'QUESTION', style: SageText.kicker(color: back ? SageColors.lime : SageColors.violet)),
            const Spacer(),
            Flexible(child: Text(concept, maxLines: 1, overflow: TextOverflow.ellipsis, style: SageText.body(12, color: back ? Colors.white54 : SageColors.muted, weight: FontWeight.w700))),
          ]),
          const Spacer(),
          Text(text, style: back ? SageText.body(19, color: Colors.white, weight: FontWeight.w600, height: 1.45) : SageText.display(25)),
          const Spacer(),
          if (!back && hint != null) Text('Hint: $hint', style: SageText.body(13, color: SageColors.muted)),
          if (!back) Text('Tap to flip', style: SageText.mono(11)),
        ]),
      );
}

// ---------------------------------------------------------------- Call panel (consent-first voice quiz / mock interview)
class CallPanel extends StatefulWidget {
  const CallPanel({super.key, required this.deckId, required this.onAnalysed, this.interview = false});
  final String deckId;
  final bool interview;
  final ValueChanged<String> onAnalysed;
  @override
  State<CallPanel> createState() => _CallPanelState();
}

class _CallPanelState extends State<CallPanel> {
  Map<String, dynamic>? pre;
  Map<String, dynamic>? call;
  String dest = '';
  bool agree = false;
  bool busy = false;
  String? error;
  String key = newKey();
  Timer? _timer;

  static const finals = {'completed', 'no_answer', 'busy', 'failed', 'cancelled'};

  @override
  void initState() {
    super.initState();
    loadPre();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> loadPre() async {
    try {
      final p = (await Api.instance.get('/v1/exam-prep/calls/preflight?deck_id=${widget.deckId}') as Map).cast<String, dynamic>();
      setState(() {
        pre = p;
        final dests = (p['destinations'] as List?) ?? [];
        dest = dests.isEmpty ? '' : '${dests.first['number']}';
        if (p['live_call'] != null) {
          call = (p['live_call'] as Map).cast<String, dynamic>();
          _schedule();
        }
      });
    } catch (e) {
      setState(() => error = friendlyError(e));
    }
  }

  void _schedule([int seconds = 4]) {
    _timer?.cancel();
    _timer = Timer(Duration(seconds: seconds), poll);
  }

  Future<void> poll() async {
    final c = call;
    if (c == null) return;
    try {
      final fresh = (await Api.instance.get('/v1/exam-prep/calls/${c['id']}') as Map).cast<String, dynamic>();
      if (!mounted) return;
      setState(() => call = fresh);
      final a = fresh['assessment'];
      if (a is Map && fresh['extraction_status'] == 'succeeded') {
        HapticFeedback.heavyImpact();
        widget.onAnalysed('${a['id']}');
        return;
      }
      final settled = finals.contains(fresh['status']) && (fresh['status'] != 'completed' || ['failed', 'not_applicable'].contains(fresh['extraction_status']));
      if (!settled) _schedule();
    } catch (_) {
      if (mounted) _schedule(8);
    }
  }

  Future<void> start() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final c = (await Api.instance.post('/v1/exam-prep/calls', {'deck_id': widget.deckId, 'destination': dest, 'consent': true, 'consent_version': pre?['consent_version'] ?? 'v1', 'idempotency_key': key}) as Map)
          .cast<String, dynamic>();
      HapticFeedback.mediumImpact();
      setState(() => call = c);
      _schedule(3);
    } catch (e) {
      if (mounted) {
        if (e is ApiException && e.isUpgrade) {
          handleUpgrade(context, e);
        } else {
          setState(() => error = friendlyError(e));
        }
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> simulate() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final r = await Api.instance.post('/v1/exam-prep/calls/simulate', {'deck_id': widget.deckId, 'idempotency_key': newKey()}) as Map;
      setState(() => call = {'id': r['call_id'], 'status': 'completed', 'extraction_status': 'running', 'is_simulated': true});
      await poll();
    } catch (e) {
      if (mounted) setState(() => error = friendlyError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> cancel() async {
    try {
      await Api.instance.post('/v1/calls/${call!['id']}/cancel');
      await poll();
    } catch (e) {
      if (mounted) toast(context, friendlyError(e));
    }
  }

  void reset() {
    _timer?.cancel();
    setState(() {
      call = null;
      agree = false;
      key = newKey();
    });
    loadPre();
  }

  @override
  Widget build(BuildContext context) {
    final p = pre;
    if (p == null) return error != null ? ErrorBanner(error!, onRetry: loadPre) : const SkeletonList(count: 2, height: 120);
    final c = call;
    final isAdmin = context.read<Session>().isSuperadmin;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      InkHero(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(width: 44, height: 44, decoration: BoxDecoration(color: SageColors.lime, borderRadius: BorderRadius.circular(14)), child: const Icon(Icons.call_rounded, color: SageColors.ink)),
            const SizedBox(width: 12),
            Expanded(child: Text(widget.interview ? 'Mock interview call' : 'Spoken quiz', style: SageText.title(18, color: Colors.white))),
          ]),
          const SizedBox(height: 12),
          Text('${p['purpose']}', style: SageText.body(13.5, color: Colors.white70)),
          const SizedBox(height: 16),
          Row(children: [
            _Fact(flex: 2, 'Calling', ((p['destinations'] as List?) ?? []).isEmpty ? 'Add phone' : '${(p['destinations'] as List).firstWhere((d) => d['number'] == dest, orElse: () => (p['destinations'] as List).first)['masked']}'),
            _Fact('Length', '~${p['estimated_minutes']} min'),
            _Fact('Minutes left', '${((p['remaining_voice_seconds'] as num?) ?? 0) ~/ 60}'),
          ]),
        ]),
      ),
      const SizedBox(height: 14),
      if (c == null) ...[
        if (p['enabled'] != true) ...[const NoticeBanner('Voice calls aren’t available right now. Please try again later.', icon: Icons.phone_disabled_outlined), const SizedBox(height: 10)],
        if (p['may_exceed_allowance'] == true) ...[const NoticeBanner('This call may use more voice minutes than you have left.', icon: Icons.timer_outlined), const SizedBox(height: 10)],
        Text('${p['agent_disclosure']}', style: SageText.body(12.5, color: SageColors.muted)),
        const SizedBox(height: 12),
        SageCard(
          onTap: () => setState(() => agree = !agree),
          color: agree ? SageColors.violetTint : null,
          borderColor: agree ? SageColors.violet : null,
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(agree ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded, color: agree ? SageColors.violet : SageColors.muted),
            const SizedBox(width: 10),
            Expanded(child: Text('${p['consent_text']}', style: SageText.body(12.5))),
          ]),
        ),
        const SizedBox(height: 14),
        SageButton('Call me now', icon: Icons.call_rounded, kind: ButtonKind.violet, expand: true, loading: busy, onPressed: agree && dest.isNotEmpty && p['enabled'] == true ? start : null),
        if (isAdmin) ...[
          const SizedBox(height: 6),
          TextButton(onPressed: busy ? null : simulate, child: Text('Run labelled simulation (QA)', style: SageText.body(13, color: SageColors.muted, weight: FontWeight.w700))),
        ],
      ] else
        _CallStatus(call: c, onCancel: cancel, onReset: reset, onView: () {
          final a = c['assessment'];
          if (a is Map) widget.onAnalysed('${a['id']}');
        }, onRetry: () async {
          await Api.instance.post('/v1/exam-prep/calls/${c['id']}/analyze');
          await poll();
        }),
      if (error != null) ...[const SizedBox(height: 12), ErrorBanner(error!)],
      const SizedBox(height: 12),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        const Icon(Icons.shield_outlined, size: 14, color: SageColors.mintInk),
        const SizedBox(width: 6),
        Text('Only placed after you confirm. No one else is contacted.', style: SageText.body(11.5, color: SageColors.muted)),
      ]),
    ]);
  }
}

class _Fact extends StatelessWidget {
  const _Fact(this.k, this.v, {this.flex = 1});
  final String k, v;
  final int flex;
  @override
  Widget build(BuildContext context) => Expanded(
        flex: flex,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(k, style: SageText.body(11, color: Colors.white54, weight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(v, maxLines: 1, overflow: TextOverflow.ellipsis, style: SageText.title(14, color: Colors.white)),
        ]),
      );
}

class _CallStatus extends StatelessWidget {
  const _CallStatus({required this.call, required this.onCancel, required this.onReset, required this.onRetry, required this.onView});
  final Map<String, dynamic> call;
  final VoidCallback onCancel, onReset, onRetry, onView;
  @override
  Widget build(BuildContext context) {
    final status = '${call['status']}';
    final ext = '${call['extraction_status']}';
    const order = ['dispatching', 'dispatched', 'in_progress', 'completed'];
    final idx = status == 'requested' ? 0 : order.indexOf(status).clamp(0, 3);
    final failed = {'no_answer', 'busy', 'failed', 'cancelled'}.contains(status);
    final labels = ['Placing', 'Ringing', 'On call', call['is_simulated'] == true ? 'Simulated' : 'Analysis'];
    return SageCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          for (var i = 0; i < 4; i++)
            Expanded(
              child: Column(children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  height: 6,
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  decoration: BoxDecoration(color: !failed && (i < idx || (i == idx)) ? SageColors.violet : SageColors.rule, borderRadius: BorderRadius.circular(9)),
                ),
                const SizedBox(height: 6),
                Text(labels[i], style: SageText.body(11, color: i <= idx && !failed ? SageColors.ink : SageColors.muted, weight: FontWeight.w700)),
              ]),
            ),
        ]),
        const SizedBox(height: 16),
        if (!failed && status != 'completed')
          Row(children: [
            const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2, color: SageColors.violet)),
            const SizedBox(width: 12),
            Expanded(child: Text(status == 'in_progress' ? 'Talk naturally — hang up any time to end.' : 'Keep your phone nearby.', style: SageText.body(14, weight: FontWeight.w600))),
            if ({'dispatching', 'dispatched', 'requested'}.contains(status)) TextButton(onPressed: onCancel, child: const Text('Cancel')),
          ]),
        if (status == 'completed' && (ext == 'pending' || ext == 'running'))
          Row(children: [
            const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2, color: SageColors.violet)),
            const SizedBox(width: 12),
            Expanded(child: Text('Analysing your answers…', style: SageText.body(14, weight: FontWeight.w600))),
          ]),
        if (status == 'completed' && ext == 'failed')
          Row(children: [
            Expanded(child: Text('The analysis failed — your transcript is safe.', style: SageText.body(14, color: SageColors.coral, weight: FontWeight.w600))),
            TextButton(onPressed: onRetry, child: const Text('Retry')),
          ]),
        if (status == 'completed' && ext == 'succeeded' && call['assessment'] is Map)
          Row(children: [
            Expanded(child: SageButton('View results', icon: Icons.insights_rounded, kind: ButtonKind.violet, compact: true, onPressed: onView)),
            const SizedBox(width: 8),
            Expanded(child: SageButton('New call', icon: Icons.refresh_rounded, kind: ButtonKind.secondary, compact: true, onPressed: onReset)),
          ]),
        if (failed)
          Row(children: [
            Expanded(child: Text('${call['error'] ?? 'The call didn’t connect.'}', style: SageText.body(14, weight: FontWeight.w600))),
            TextButton(onPressed: onReset, child: const Text('Try again')),
          ]),
      ]),
    );
  }
}

// ---------------------------------------------------------------- Assessment dashboard
class AssessmentScreen extends StatefulWidget {
  const AssessmentScreen({super.key, required this.id});
  final String id;
  @override
  State<AssessmentScreen> createState() => _AssessmentScreenState();
}

class _AssessmentScreenState extends State<AssessmentScreen> {
  Map<String, dynamic>? a;
  String? error;
  @override
  void initState() {
    super.initState();
    Api.instance.get('/v1/exam-prep/assessments/${widget.id}').then((v) {
      if (mounted) setState(() => a = (v as Map).cast<String, dynamic>());
    }).catchError((Object e) {
      if (mounted) setState(() => error = friendlyError(e));
    });
  }

  @override
  Widget build(BuildContext context) {
    final o = (a?['output'] as Map?)?.cast<String, dynamic>();
    return Scaffold(
      appBar: AppBar(title: const Text('Where you stand')),
      body: o == null
          ? Padding(padding: const EdgeInsets.all(20), child: error != null ? ErrorBanner(error!) : const SkeletonList())
          : ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 40), children: [
              if (a!['is_simulated'] == true) ...[const NoticeBanner('SIMULATED QUIZ — generated for QA. No real call took place.', icon: Icons.science_outlined), const SizedBox(height: 12)],
              InkHero(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    ProgressRing(value: (o['overall_score'] as num) / 100, size: 104, stroke: 10, color: SageColors.lime, track: Colors.white12,
                        child: Text('${o['overall_score']}%', style: SageText.display(24, color: Colors.white))),
                    const SizedBox(width: 18),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Pill(readinessLabel[o['readiness']] ?? '', tone: readinessTone(o['readiness'] as String?)),
                        const SizedBox(height: 10),
                        Text('${a!['deck_title'] ?? a!['topic'] ?? ''}', maxLines: 3, overflow: TextOverflow.ellipsis, style: SageText.title(16, color: Colors.white)),
                        const SizedBox(height: 4),
                        Text('Confidence ${(((o['confidence'] as num?) ?? 0) * 100).round()}%', style: SageText.mono(11, color: Colors.white54)),
                      ]),
                    ),
                  ]),
                  const SizedBox(height: 16),
                  Text('${o['summary']}', style: SageText.body(14, color: Colors.white.withValues(alpha: .8))),
                  const SizedBox(height: 10),
                  Text('${o['encouragement']}', style: SageText.body(14, color: SageColors.lime, weight: FontWeight.w700)),
                ]),
              ),
              const SectionTitle('Concept mastery'),
              SageCard(
                child: Column(children: [
                  for (final c in ((o['concepts'] as List?) ?? []).cast<Map>())
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text('${c['concept']}', style: SageText.title(14))),
                          Pill(c['mastery'] == 'not_assessed' ? 'not asked' : '${c['mastery']} · ${c['score']}%',
                              tone: switch (c['mastery']) { 'strong' => Tone.mint, 'partial' => Tone.amber, 'weak' => Tone.coral, _ => Tone.neutral }),
                        ]),
                        if (c['mastery'] != 'not_assessed') ...[
                          const SizedBox(height: 8),
                          Bar(value: ((c['score'] as num?) ?? 0) / 100, color: switch (c['mastery']) { 'strong' => SageColors.mintInk, 'partial' => SageColors.amber, _ => SageColors.coral }),
                        ],
                        const SizedBox(height: 6),
                        Text('${c['evidence']}', style: SageText.body(12.5, color: SageColors.muted)),
                      ]),
                    ),
                ]),
              ),
              const SectionTitle('Your study plan'),
              for (final (i, s) in ((o['study_plan'] as List?) ?? []).cast<Map>().indexed)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: SageCard(
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Container(width: 30, height: 30, alignment: Alignment.center, decoration: BoxDecoration(color: SageColors.ink, borderRadius: BorderRadius.circular(10)), child: Text('${i + 1}', style: SageText.title(13, color: SageColors.lime))),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${s['step']}', style: SageText.body(14, color: SageColors.ink, weight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        Text('${s['focus_concept']} · ${s['minutes']} min', style: SageText.body(12, color: SageColors.muted)),
                      ])),
                    ]),
                  ),
                ),
              if (((o['misconceptions'] as List?) ?? []).isNotEmpty) ...[
                const SectionTitle('Misconceptions to fix'),
                for (final m in ((o['misconceptions'] as List?) ?? []).cast<Map>())
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: SageCard(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Icon(Icons.close_rounded, color: SageColors.coral, size: 18),
                          const SizedBox(width: 8),
                          Expanded(child: Text('${m['misconception']}', style: SageText.body(14, color: SageColors.ink, weight: FontWeight.w600))),
                        ]),
                        const SizedBox(height: 10),
                        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Icon(Icons.check_rounded, color: SageColors.mintInk, size: 18),
                          const SizedBox(width: 8),
                          Expanded(child: Text('${m['correction']}', style: SageText.body(14))),
                        ]),
                      ]),
                    ),
                  ),
              ],
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(child: _ListCard('Strengths', ((o['strengths'] as List?) ?? []).map((e) => '$e').toList(), Tone.mint)),
                const SizedBox(width: 10),
                Expanded(child: _ListCard('Gaps', ((o['gaps'] as List?) ?? []).map((e) => '$e').toList(), Tone.amber)),
              ]),
              const SectionTitle('Question by question'),
              for (final q in ((o['questions'] as List?) ?? []).cast<Map>())
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: SageCard(
                    padding: EdgeInsets.zero,
                    child: Theme(
                      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                      child: ExpansionTile(
                        leading: Icon(
                          switch (q['verdict']) { 'correct' => Icons.check_circle_rounded, 'partially_correct' => Icons.adjust_rounded, 'incorrect' => Icons.cancel_rounded, _ => Icons.help_outline_rounded },
                          color: switch (q['verdict']) { 'correct' => SageColors.mintInk, 'partially_correct' => SageColors.amber, 'incorrect' => SageColors.coral, _ => SageColors.muted },
                        ),
                        title: Text('${q['question']}', style: SageText.title(14)),
                        subtitle: Text('${q['concept']}', style: SageText.body(12, color: SageColors.muted)),
                        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        expandedCrossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('You said', style: SageText.kicker(color: SageColors.muted)),
                          const SizedBox(height: 4),
                          Text('${q['student_answer']}', style: SageText.body(14)),
                          const SizedBox(height: 10),
                          Text('Feedback', style: SageText.kicker()),
                          const SizedBox(height: 4),
                          Text('${q['feedback']}', style: SageText.body(14)),
                        ],
                      ),
                    ),
                  ),
                ),
            ]),
    );
  }
}

class _ListCard extends StatelessWidget {
  const _ListCard(this.title, this.items, this.tone);
  final String title;
  final List<String> items;
  final Tone tone;
  @override
  Widget build(BuildContext context) {
    final (bg, fg) = Pill.colors(tone);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: bg.withValues(alpha: .6), borderRadius: BorderRadius.circular(18)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: SageText.title(14, color: fg)),
        const SizedBox(height: 8),
        if (items.isEmpty) Text('—', style: SageText.body(13)),
        for (final t in items) Padding(padding: const EdgeInsets.only(bottom: 6), child: Text('• $t', style: SageText.body(12.5, color: SageColors.ink2))),
      ]),
    );
  }
}
