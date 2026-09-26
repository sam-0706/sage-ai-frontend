import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../core/workspace.dart';
import '../widgets/ui.dart';
import 'account.dart';
import 'prep.dart';

class CareerScreen extends StatefulWidget {
  const CareerScreen({super.key});
  @override
  State<CareerScreen> createState() => _CareerScreenState();
}

class _CareerScreenState extends State<CareerScreen> {
  String tab = 'jobs';
  static const tabs = [
    ('jobs', 'On-campus jobs'),
    ('interview', 'Interview AI'),
    ('internships', 'Internships'),
    ('workshops', 'Workshops'),
    ('research', 'Faculty projects'),
    ('networking', 'Industry network'),
  ];

  @override
  Widget build(BuildContext context) {
    final w = context.watch<Workspace>();
    return Column(children: [
      const PageHeader(kicker: 'Placements & exposure', title: 'Career'),
      Segmented(options: tabs, value: tab, onChanged: (v) => setState(() => tab = v)),
      const SizedBox(height: 8),
      Expanded(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          child: KeyedSubtree(
            key: ValueKey(tab),
            child: w.data == null
                ? PageBody(children: [const SizedBox(height: 12), if (w.error != null) ErrorBanner(w.error!, onRetry: w.refresh) else const SkeletonList()])
                : tab == 'interview'
                    ? const _InterviewAI()
                    : _Opportunities(kind: {'jobs': 'job', 'internships': 'internship', 'workshops': 'workshop', 'research': 'research', 'networking': 'networking'}[tab]!),
          ),
        ),
      ),
    ]);
  }
}

// ---------------------------------------------------------------- opportunities (jobs & exposure)
class _Opportunities extends StatefulWidget {
  const _Opportunities({required this.kind});
  final String kind;
  @override
  State<_Opportunities> createState() => _OpportunitiesState();
}

class _OpportunitiesState extends State<_Opportunities> {
  String query = '';
  String location = 'All';
  double minSalary = 0;
  bool recommended = false;
  bool busy = false;
  List<Map<String, dynamic>>? ranked;

  bool get isJobs => widget.kind == 'job' || widget.kind == 'internship';

  Future<void> recommend() async {
    setState(() => busy = true);
    try {
      final r = await Api.instance.post('/v1/campus/recommendations') as Map;
      ranked = ((r['items'] as List?) ?? []).cast<Map>().map((e) => e.cast<String, dynamic>()).toList();
      recommended = true;
    } catch (e) {
      if (mounted) handleUpgrade(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final w = context.watch<Workspace>();
    var items = w.opportunities.where((o) => o['kind'] == widget.kind).map((o) => Map<String, dynamic>.of(o)).toList();
    if (recommended && ranked != null) {
      for (final o in items) {
        final r = ranked!.where((x) => x['id'] == o['id']).firstOrNull;
        if (r != null) o.addAll({'score': r['score'], 'explanation': r['explanation']});
      }
      items.sort((a, b) => ((b['score'] as num?) ?? -1).compareTo((a['score'] as num?) ?? -1));
    }
    final locations = {'All', ...items.map((o) => '${o['location']}')}.toList();
    items = items.where((o) {
      final text = '${o['title']} ${o['organisation']} ${(o['skills'] as List?)?.join(' ')}'.toLowerCase();
      return text.contains(query.toLowerCase()) &&
          (location == 'All' || o['location'] == location) &&
          (minSalary == 0 || ((o['salary_lpa'] as num?) ?? 0) >= minSalary);
    }).toList();

    return PageBody(
      onRefresh: w.refresh,
      children: [
        const SizedBox(height: 8),
        const NoticeBanner('Synthetic demo opportunities — not live vacancies. Use Live search for verified openings.', icon: Icons.science_outlined),
        const SizedBox(height: 12),
        TextField(
          onChanged: (v) => setState(() => query = v),
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Search roles, companies, skills'),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 38,
          child: ListView(scrollDirection: Axis.horizontal, children: [
            for (final l in locations)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(l),
                  selected: location == l,
                  onSelected: (_) => setState(() => location = l),
                  selectedColor: SageColors.ink,
                  labelStyle: SageText.body(13, color: location == l ? Colors.white : SageColors.ink2, weight: FontWeight.w700),
                  showCheckmark: false,
                  side: const BorderSide(color: SageColors.rule),
                  backgroundColor: SageColors.card,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
          ]),
        ),
        if (widget.kind == 'job') ...[
          const SizedBox(height: 6),
          Row(children: [
            Text('Min salary', style: SageText.body(13, weight: FontWeight.w700)),
            Expanded(child: Slider(value: minSalary, min: 0, max: 40, divisions: 8, onChanged: (v) => setState(() => minSalary = v))),
            SizedBox(width: 72, child: Text(minSalary == 0 ? 'Any' : '₹${minSalary.round()}+ LPA', textAlign: TextAlign.right, style: SageText.mono(12, color: SageColors.ink2))),
          ]),
        ],
        if (isJobs) ...[
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: SageButton(recommended ? 'Ranked for you' : 'AI picks',
                  icon: Icons.auto_awesome_rounded, kind: recommended ? ButtonKind.violet : ButtonKind.primary, loading: busy, onPressed: recommend, compact: true),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: SageButton(recommended ? 'Show all' : 'Live search', icon: recommended ? Icons.list_rounded : Icons.travel_explore_rounded, kind: ButtonKind.secondary, compact: true,
                  onPressed: recommended ? () => setState(() => recommended = false) : () => sheet(context, const _LiveSearchSheet())),
            ),
          ]),
          if (recommended)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text('Ranked by OpenAI embeddings: 70% semantic fit with your goal and skills, 20% target salary, 10% specialisation. A discovery score, not a placement probability.',
                  style: SageText.body(12, color: SageColors.muted)),
            ),
        ],
        const SizedBox(height: 14),
        if (items.isEmpty) const EmptyState(icon: Icons.search_off_rounded, title: 'Nothing matches', message: 'Try clearing a filter.'),
        for (final o in items) Padding(padding: const EdgeInsets.only(bottom: 12), child: OpportunityCard(o: o)),
      ],
    );
  }
}

class OpportunityCard extends StatelessWidget {
  const OpportunityCard({super.key, required this.o});
  final Map<String, dynamic> o;
  @override
  Widget build(BuildContext context) {
    final score = o['score'] as num?;
    final salary = (o['salary_lpa'] as num?) ?? 0;
    return SageCard(
      onTap: () => sheet(context, _OpportunitySheet(o: o)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _Logo(name: '${o['organisation']}'),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${o['title']}', style: SageText.title(16)),
              const SizedBox(height: 2),
              Text('${o['organisation']} · ${o['location']}', style: SageText.body(12.5, color: SageColors.muted)),
            ]),
          ),
          if (score != null)
            ProgressRing(value: score / 100, size: 46, stroke: 5, color: score >= 70 ? SageColors.mintInk : score >= 50 ? SageColors.violet : SageColors.amber,
                child: Text('${score.round()}', style: SageText.title(13))),
        ]),
        const SizedBox(height: 12),
        Text('${o['description']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: SageText.body(13.5)),
        const SizedBox(height: 12),
        Wrap(spacing: 6, runSpacing: 6, children: [
          if (salary > 0) Pill('₹$salary LPA · demo', tone: Tone.lime),
          if (o['event_at'] != null) Pill(dayTime(o['event_at']), tone: Tone.violet, icon: Icons.event_rounded),
          for (final s in ((o['skills'] as List?) ?? []).take(3)) Pill('$s'),
        ]),
      ]),
    );
  }
}

class _Logo extends StatelessWidget {
  const _Logo({required this.name});
  final String name;
  @override
  Widget build(BuildContext context) {
    final letters = name.replaceAll('Demo ', '').split(' ').where((w) => w.isNotEmpty).take(2).map((w) => w[0]).join();
    final hue = (name.codeUnits.fold(0, (a, b) => a + b) % 360).toDouble();
    return Container(
      width: 44,
      height: 44,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: HSLColor.fromAHSL(1, hue, .55, .92).toColor(), borderRadius: BorderRadius.circular(14)),
      child: Text(letters, style: SageText.title(15, color: HSLColor.fromAHSL(1, hue, .5, .3).toColor())),
    );
  }
}

class _OpportunitySheet extends StatelessWidget {
  const _OpportunitySheet({required this.o});
  final Map<String, dynamic> o;
  @override
  Widget build(BuildContext context) {
    final ex = o['explanation'] as Map?;
    final isJob = o['kind'] == 'job' || o['kind'] == 'internship';
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .75,
      maxChildSize: .95,
      builder: (_, controller) => ListView(controller: controller, padding: const EdgeInsets.fromLTRB(20, 0, 20, 32), children: [
        Row(children: [_Logo(name: '${o['organisation']}'), const SizedBox(width: 12), Expanded(child: Text('${o['organisation']}', style: SageText.body(14, weight: FontWeight.w700)))]),
        const SizedBox(height: 14),
        Text('${o['title']}', style: SageText.display(26)),
        const SizedBox(height: 6),
        Text('${o['location']}${((o['salary_lpa'] as num?) ?? 0) > 0 ? ' · ₹${o['salary_lpa']} LPA (demo)' : ''}', style: SageText.body(14, color: SageColors.muted)),
        const SizedBox(height: 16),
        Text('${o['description']}', style: SageText.body(15)),
        const SizedBox(height: 16),
        Wrap(spacing: 6, runSpacing: 6, children: [for (final s in (o['skills'] as List? ?? [])) Pill('$s', tone: Tone.violet)]),
        if (ex != null) ...[
          const SectionTitle('Why it fits you'),
          _FitBar('Semantic match', (ex['semantic'] as num).toDouble()),
          _FitBar('Target salary', (ex['salary_alignment'] as num).toDouble()),
          _FitBar('Specialisation', (ex['specialisation_alignment'] as num).toDouble()),
          const SizedBox(height: 8),
          Text('${ex['notice']}', style: SageText.body(12, color: SageColors.muted)),
        ],
        const SizedBox(height: 20),
        if (isJob)
          SageButton('Practice an interview for this role', icon: Icons.record_voice_over_outlined, kind: ButtonKind.violet, expand: true, onPressed: () {
            Navigator.pop(context);
            Navigator.of(context).push(MaterialPageRoute(builder: (_) => InterviewSetupScreen(initialJobId: '${o['id']}')));
          }),
        if (o['source_url'] != null) ...[
          const SizedBox(height: 10),
          SageButton('Open source', icon: Icons.open_in_new_rounded, kind: ButtonKind.secondary, expand: true, onPressed: () => launchUrl(Uri.parse('${o['source_url']}'))),
        ],
        const SizedBox(height: 12),
        if (o['is_demo'] == true) Text('Demo opportunity — no employer affiliation is asserted.', textAlign: TextAlign.center, style: SageText.body(12, color: SageColors.muted)),
      ]),
    );
  }
}

class _FitBar extends StatelessWidget {
  const _FitBar(this.label, this.value);
  final String label;
  final double value;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [Expanded(child: Text(label, style: SageText.body(13, weight: FontWeight.w700))), Text('${value.round()}%', style: SageText.mono(12, color: SageColors.ink2))]),
          const SizedBox(height: 6),
          Bar(value: value / 100),
        ]),
      );
}

// ---------------------------------------------------------------- live web search
class _LiveSearchSheet extends StatefulWidget {
  const _LiveSearchSheet();
  @override
  State<_LiveSearchSheet> createState() => _LiveSearchSheetState();
}

class _LiveSearchSheetState extends State<_LiveSearchSheet> {
  late final role = TextEditingController(text: '${context.read<Workspace>().profile['target_role'] ?? ''}');
  final location = TextEditingController(text: 'Mumbai');
  String mode = 'any';
  bool busy = false;
  Map<String, dynamic>? result;
  String? error;

  Future<void> search() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      result = (await Api.instance.post('/v1/campus/jobs/discover', {'role': role.text.trim(), 'location': location.text.trim(), 'work_mode': mode}) as Map).cast<String, dynamic>();
    } catch (e) {
      if (e is ApiException && e.isUpgrade && mounted) {
        Navigator.pop(context);
        handleUpgrade(context, e);
        return;
      }
      error = friendlyError(e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final jobs = ((result?['items'] as List?) ?? []).cast<Map>();
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: .8,
        maxChildSize: .95,
        builder: (_, controller) => ListView(controller: controller, padding: const EdgeInsets.fromLTRB(20, 0, 20, 32), children: [
          const Kicker('Live web search'),
          const SizedBox(height: 8),
          Text('Find verified openings', style: SageText.display(26)),
          const SizedBox(height: 6),
          Text('SAGE searches the web now and only returns roles with a working source and apply link.', style: SageText.body(13.5, color: SageColors.muted)),
          const FieldLabel('Role'),
          TextField(controller: role),
          const FieldLabel('Location'),
          TextField(controller: location),
          const FieldLabel('Work mode'),
          ChoiceChips(options: const ['any', 'remote', 'hybrid', 'onsite'], selected: {mode}, multi: false, onToggle: (v) => setState(() => mode = v)),
          const SizedBox(height: 18),
          SageButton('Search the web', icon: Icons.travel_explore_rounded, kind: ButtonKind.violet, expand: true, loading: busy, onPressed: search),
          if (busy) Padding(padding: const EdgeInsets.only(top: 10), child: Text('Checking live careers pages — this can take up to a minute…', textAlign: TextAlign.center, style: SageText.body(12.5, color: SageColors.muted))),
          if (error != null) ...[const SizedBox(height: 12), ErrorBanner(error!)],
          if (result != null) ...[
            const SizedBox(height: 18),
            Text('${result!['summary']}', style: SageText.body(13.5)),
            const SizedBox(height: 12),
            if (jobs.isEmpty) const EmptyState(icon: Icons.search_off_rounded, title: 'No verified openings', message: 'Try a broader role or location.'),
            for (final j in jobs)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: SageCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text('${j['title']}', style: SageText.title(15.5))),
                      Pill('${j['match_score']}% fit', tone: Tone.violet),
                    ]),
                    const SizedBox(height: 4),
                    Text('${j['company']} · ${j['location']} · ${j['work_mode']}', style: SageText.body(12.5, color: SageColors.muted)),
                    if (j['salary'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Pill('${j['salary']}', tone: Tone.lime)),
                    const SizedBox(height: 8),
                    for (final why in ((j['why_it_fits'] as List?) ?? []).take(2)) Text('• $why', style: SageText.body(13)),
                    const SizedBox(height: 10),
                    Row(children: [
                      Expanded(child: SageButton('Apply', icon: Icons.open_in_new_rounded, compact: true, onPressed: () => launchUrl(Uri.parse('${j['apply_url']}'), mode: LaunchMode.externalApplication))),
                      const SizedBox(width: 8),
                      Expanded(child: SageButton('Source', kind: ButtonKind.secondary, compact: true, onPressed: () => launchUrl(Uri.parse('${j['source_url']}')))),
                    ]),
                    const SizedBox(height: 6),
                    Text('via ${j['source_name']}', style: SageText.mono(11)),
                  ]),
                ),
              ),
          ],
        ]),
      ),
    );
  }
}

// ---------------------------------------------------------------- Interview AI
class _InterviewAI extends StatelessWidget {
  const _InterviewAI();
  @override
  Widget build(BuildContext context) {
    final w = context.watch<Workspace>();
    final jobs = w.opportunities.where((o) => o['kind'] == 'job').toList();
    return PageBody(onRefresh: w.refresh, children: [
      const SizedBox(height: 8),
      InkHero(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('INTERVIEW AI', style: SageText.kicker(color: SageColors.lime)),
          const SizedBox(height: 10),
          Text('A mock interview built from the JD and your resume.', style: SageText.display(24, color: Colors.white)),
          const SizedBox(height: 10),
          Text('Pick a role. SAGE prepares role-specific questions, calls you, and scores every answer afterwards.', style: SageText.body(13.5, color: Colors.white70)),
        ]),
      ),
      const SectionTitle('Choose a role'),
      for (final j in jobs)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: SageCard(
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => InterviewSetupScreen(initialJobId: '${j['id']}'))),
            child: Row(children: [
              _Logo(name: '${j['organisation']}'),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('${j['title']}', style: SageText.title(15)), Text('${j['organisation']}', style: SageText.body(12.5, color: SageColors.muted))])),
              const Icon(Icons.chevron_right_rounded, color: SageColors.muted),
            ]),
          ),
        ),
    ]);
  }
}

class InterviewSetupScreen extends StatefulWidget {
  const InterviewSetupScreen({super.key, required this.initialJobId});
  final String initialJobId;
  @override
  State<InterviewSetupScreen> createState() => _InterviewSetupScreenState();
}

class _InterviewSetupScreenState extends State<InterviewSetupScreen> {
  late String jobId = widget.initialJobId;
  late final resume = TextEditingController(text: () {
    final p = context.read<Workspace>().profile;
    return [p['resume_summary'], p['experience_summary']].whereType<String>().where((s) => s.trim().isNotEmpty).join('\n\n');
  }());
  bool busy = false;
  String? error;

  Future<void> prepare() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final deck = await Api.instance.post('/v1/campus/interview', {'job_id': jobId, 'resume_text': resume.text.trim()}) as Map;
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => DeckScreen(deckId: '${deck['id']}', initialTab: 'quiz', interview: true)));
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

  @override
  Widget build(BuildContext context) {
    final jobs = context.watch<Workspace>().opportunities.where((o) => o['kind'] == 'job').toList();
    final job = jobs.where((j) => '${j['id']}' == jobId).firstOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('Interview AI')),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 32), children: [
        Text(job == null ? 'Mock interview' : 'Mock interview for\n${job['title']}', style: SageText.display(28)),
        const SizedBox(height: 8),
        if (job != null) Text('${job['organisation']} · ${job['location']}', style: SageText.body(14, color: SageColors.muted)),
        const FieldLabel('Role'),
        DropdownButtonFormField<String>(
          initialValue: jobs.any((j) => '${j['id']}' == jobId) ? jobId : null,
          isExpanded: true,
          items: [for (final j in jobs) DropdownMenuItem(value: '${j['id']}', child: Text('${j['title']} · ${j['organisation']}', overflow: TextOverflow.ellipsis))],
          onChanged: (v) => setState(() => jobId = v ?? jobId),
        ),
        const FieldLabel('Your resume facts', hint: 'Questions and reference answers use only what you write here'),
        TextField(controller: resume, minLines: 8, maxLines: 14, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: 'Education, roles, projects, metrics…')),
        const SizedBox(height: 10),
        const NoticeBanner('Practice only — no employer is contacted. You’ll confirm the call before it’s placed.', icon: Icons.shield_outlined, tone: Tone.violet),
        if (error != null) ...[const SizedBox(height: 12), ErrorBanner(error!)],
        const SizedBox(height: 18),
        SageButton('Prepare interview', icon: Icons.auto_awesome_rounded, kind: ButtonKind.violet, expand: true, loading: busy, onPressed: resume.text.trim().length >= 30 ? prepare : null),
        if (busy) Padding(padding: const EdgeInsets.only(top: 10), child: Text('Writing role-specific questions — about 20 seconds…', textAlign: TextAlign.center, style: SageText.body(12.5, color: SageColors.muted))),
        if (resume.text.trim().length < 30) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Add at least a few lines of resume facts.', textAlign: TextAlign.center, style: SageText.body(12.5, color: SageColors.muted))),
      ]),
    );
  }
}

/// Shows a friendly upgrade prompt when a feature needs a higher plan; otherwise a toast.
void handleUpgrade(BuildContext context, Object e) {
  if (e is ApiException && e.isUpgrade) {
    sheet(
      context,
      Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 32),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(
            width: 56,
            height: 56,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: SageColors.lime, borderRadius: BorderRadius.circular(18)),
            child: const Icon(Icons.bolt_rounded, color: SageColors.ink, size: 30),
          ),
          const SizedBox(height: 16),
          Text('Unlock this with Pro', style: SageText.display(26)),
          const SizedBox(height: 8),
          Text(e.message, style: SageText.body(14, color: SageColors.muted)),
          const SizedBox(height: 20),
          SageButton('See plans', icon: Icons.arrow_forward_rounded, kind: ButtonKind.violet, expand: true, onPressed: () {
            Navigator.pop(context);
            Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PricingScreen()));
          }),
        ]),
      ),
    );
  } else {
    toast(context, friendlyError(e));
  }
}
