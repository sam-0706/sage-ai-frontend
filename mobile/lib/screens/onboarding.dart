import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/academics.dart';
import '../core/api.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../widgets/brand.dart';
import '../widgets/ui.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, this.editing = false});
  final bool editing;
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

const _locations = ['Mumbai', 'Bengaluru', 'Delhi NCR', 'Hyderabad', 'Pune', 'Chennai', 'Remote'];
const _skills = ['Excel', 'SQL', 'Python', 'Financial modelling', 'Market research', 'Product thinking', 'Presentations', 'Negotiation', 'Data visualisation', 'Sales'];
const _windows = ['Weekday mornings', 'Weekday afternoons', 'Weekday evenings', 'Weekends', 'Any time'];

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _page = PageController();
  int step = 0;
  bool loading = true;
  bool saving = false;
  String? error;

  // identity
  final name = TextEditingController();
  final phone = TextEditingController();
  String email = '';
  String? segment;
  String mode = 'student';

  // programme
  int semester = 1;
  String specialisation = specialisations.first;
  final batch = TextEditingController(text: '2026');
  final section = TextEditingController();

  // courses
  List<Map<String, dynamic>> catalogue = [];
  final Set<String> subjects = {};

  // goals
  final targetRole = TextEditingController();
  final careerGoal = TextEditingController();
  double salary = 18;
  double minutes = 90;
  final Set<String> locations = {'Mumbai'};
  final Set<String> skills = {};

  // experience
  final experience = TextEditingController();
  final resume = TextEditingController();
  int internships = 0;

  // other modes
  final Map<String, TextEditingController> other = {};

  // calls
  bool callConsent = false;
  bool deadlineConsent = false;
  String window = 'Weekday evenings';

  bool get isStudent => mode == 'student';
  List<String> get stepTitles => isStudent
      ? ['You', 'Programme', 'Courses', 'Goals', 'Experience', 'Calls', 'Review']
      : ['You', 'Context', 'Calls', 'Review'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await Api.instance.get('/v1/onboarding') as Map;
      final p = (r['prefill'] as Map).cast<String, dynamic>();
      final prof = ((p['profile'] as Map?) ?? {}).cast<String, dynamic>();
      name.text = (p['full_name'] as String?) ?? '';
      phone.text = (p['phone'] as String?) ?? '';
      email = (p['email'] as String?) ?? '';
      segment = p['waitlist_segment'] as String?;
      mode = (p['mode'] as String?) ?? 'student';
      callConsent = p['call_consent'] == true;
      deadlineConsent = p['deadline_call_consent'] == true;
      semester = int.tryParse('${prof['semester'] ?? 1}')?.clamp(1, 6) ?? 1;
      if (specialisations.contains(prof['specialisation'])) specialisation = prof['specialisation'] as String;
      if (prof['batch'] != null) batch.text = '${prof['batch']}';
      section.text = (prof['section'] as String?) ?? '';
      targetRole.text = (prof['target_role'] as String?) ?? '';
      careerGoal.text = (prof['career_goal'] as String?) ?? '';
      salary = (double.tryParse('${prof['salary_lpa'] ?? 18}') ?? 18).clamp(3, 80);
      minutes = (double.tryParse('${prof['daily_minutes'] ?? 90}') ?? 90).clamp(15, 300);
      if (prof['preferred_locations'] is List) locations..clear()..addAll((prof['preferred_locations'] as List).map((e) => '$e'));
      if (prof['skills'] is List) skills.addAll((prof['skills'] as List).map((e) => '$e'));
      if (prof['subjects'] is List) subjects.addAll((prof['subjects'] as List).map((e) => '$e'));
      experience.text = (prof['experience_summary'] as String?) ?? '';
      resume.text = (prof['resume_summary'] as String?) ?? '';
      internships = int.tryParse('${prof['internships_completed'] ?? 0}') ?? 0;
      for (final f in _otherFields()) {
        final v = prof[f.$1];
        other[f.$1] = TextEditingController(text: v is List ? v.join(', ') : (v?.toString() ?? ''));
      }
    } catch (e) {
      error = friendlyError(e);
    }
    try {
      final c = await Api.instance.get('/v1/campus/catalogue') as Map;
      catalogue = ((c['courses'] as List?) ?? []).cast<Map>().map((e) => e.cast<String, dynamic>()).toList();
    } catch (_) {/* fall back to the bundled starter library */}
    if (mounted) setState(() => loading = false);
  }

  List<(String, String, bool)> _otherFields() => mode == 'founder'
      ? [('venture_name', 'Venture name', false), ('venture_stage', 'Stage (idea, pre-seed, seed…)', true), ('current_milestone', 'Current milestone', true), ('decisions', 'Decisions to make (comma separated)', false)]
      : [('current_role', 'Current role', false), ('target_role', 'Target role', true), ('skill_goals', 'Skills to build (comma separated)', true), ('weekly_availability_hours', 'Learning hours per week', true)];

  List<String> get termCourses {
    final year = (semester - 1) ~/ 3 + 1;
    final term = (semester - 1) % 3 + 1;
    final fromCatalogue = catalogue.where((c) => c['year'] == year && c['term'] == term).map((c) => '${c['title']}').toList();
    if (fromCatalogue.isNotEmpty) return fromCatalogue;
    return starterCourses.where((c) => c.term == term).map((c) => c.name).toList();
  }

  String? get blocker {
    final t = stepTitles[step];
    if (t == 'You' && name.text.trim().isEmpty) return 'Add your name';
    if (t == 'Programme' && (int.tryParse(batch.text) == null || int.parse(batch.text) < 2020 || int.parse(batch.text) > 2040)) return 'Enter a batch year between 2020 and 2040';
    if (t == 'Courses' && subjects.isEmpty) return 'Pick at least one course';
    if (t == 'Goals' && (targetRole.text.trim().length < 2 || careerGoal.text.trim().length < 3)) return 'Add your dream role and career goal';
    if (t == 'Context') {
      for (final f in _otherFields()) {
        if (f.$3 && (other[f.$1]?.text.trim().isEmpty ?? true)) return 'Fill in ${f.$2.split(' (').first.toLowerCase()}';
      }
    }
    if (t == 'Calls' && (callConsent || deadlineConsent) && phone.text.trim().length < 8) return 'Add your phone number to allow calls';
    return null;
  }

  void next() {
    if (blocker != null) {
      toast(context, blocker!);
      return;
    }
    FocusScope.of(context).unfocus();
    if (step < stepTitles.length - 1) {
      setState(() => step++);
      _page.animateToPage(step, duration: const Duration(milliseconds: 380), curve: Curves.easeOutCubic);
    } else {
      submit();
    }
  }

  void back() {
    if (step == 0) return;
    setState(() => step--);
    _page.animateToPage(step, duration: const Duration(milliseconds: 380), curve: Curves.easeOutCubic);
  }

  Future<void> submit() async {
    setState(() {
      saving = true;
      error = null;
    });
    final profile = isStudent
        ? {
            'onboarding_version': 2,
            'institution_name': 'BITSoM, Mumbai',
            'program': 'MBA',
            'semester': semester,
            'specialisation': specialisation,
            'batch': int.parse(batch.text),
            if (section.text.trim().isNotEmpty) 'section': section.text.trim(),
            'subjects': subjects.toList(),
            'target_role': targetRole.text.trim(),
            'career_goal': careerGoal.text.trim(),
            'salary_lpa': salary.round(),
            'daily_minutes': minutes.round(),
            'preferred_locations': locations.toList(),
            'skills': skills.toList(),
            if (experience.text.trim().isNotEmpty) 'experience_summary': experience.text.trim(),
            'internships_completed': internships,
            if (resume.text.trim().isNotEmpty) 'resume_summary': resume.text.trim(),
          }
        : {
            for (final f in _otherFields())
              if ((other[f.$1]?.text.trim() ?? '').isNotEmpty)
                f.$1: f.$1 == 'weekly_availability_hours'
                    ? (num.tryParse(other[f.$1]!.text.trim()) ?? other[f.$1]!.text.trim())
                    : (f.$2.contains('comma') ? other[f.$1]!.text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList() : other[f.$1]!.text.trim()),
          };
    try {
      await Api.instance.post('/v1/onboarding', {
        'full_name': name.text.trim(),
        'mode': mode,
        'phone': phone.text.trim().isEmpty ? null : phone.text.trim(),
        'profile': profile,
        'goals': [if (careerGoal.text.trim().isNotEmpty) careerGoal.text.trim()],
        'interests': isStudent ? ['exam_prep', 'placements', 'check_ins', 'ask_sage'] : ['check_ins', 'ask_sage'],
        'call_consent': callConsent,
        'deadline_call_consent': deadlineConsent,
        'preferred_call_window': callConsent || deadlineConsent ? window : null,
      });
      HapticFeedback.mediumImpact();
      if (!mounted) return;
      if (widget.editing) {
        context.read<Session>().refresh(silent: true);
        Navigator.of(context).pop();
      } else {
        context.read<Session>().markOnboarded();
      }
    } catch (e) {
      setState(() {
        saving = false;
        error = friendlyError(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: SageColors.violet)));
    }
    final titles = stepTitles;
    final pages = isStudent
        ? [_you(), _programme(), _courses(), _goals(), _experience(), _calls(), _review()]
        : [_you(), _context(), _calls(), _review()];
    return Scaffold(
      body: SafeArea(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 12, 0),
            child: Row(children: [
              const Wordmark(),
              const Spacer(),
              if (widget.editing) IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded)),
              if (!widget.editing) Text('${step + 1}/${titles.length}', style: SageText.mono(12)),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
            child: Row(children: [
              for (var i = 0; i < titles.length; i++)
                Expanded(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    height: 5,
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    decoration: BoxDecoration(
                      color: i <= step ? SageColors.violet : SageColors.rule,
                      borderRadius: BorderRadius.circular(9),
                    ),
                  ),
                ),
            ]),
          ),
          Expanded(
            child: PageView(controller: _page, physics: const NeverScrollableScrollPhysics(), children: pages),
          ),
          if (error != null) Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: ErrorBanner(error!)),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
            child: Row(children: [
              if (step > 0) ...[SageButton('Back', kind: ButtonKind.secondary, onPressed: back), const SizedBox(width: 10)],
              Expanded(
                child: SageButton(step == titles.length - 1 ? (widget.editing ? 'Save changes' : 'Build my workspace') : 'Continue',
                    icon: step == titles.length - 1 ? Icons.check_rounded : Icons.arrow_forward_rounded,
                    expand: true,
                    loading: saving,
                    kind: step == titles.length - 1 ? ButtonKind.violet : ButtonKind.primary,
                    onPressed: next),
              ),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _scroll(String kicker, String title, String subtitle, List<Widget> children) => ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
        children: [
          Kicker(kicker),
          const SizedBox(height: 10),
          Text(title, style: SageText.display(30)),
          const SizedBox(height: 8),
          Text(subtitle, style: SageText.body(14.5, color: SageColors.muted)),
          const SizedBox(height: 8),
          ...children,
        ],
      );

  Widget _you() => _scroll('Welcome${segment != null ? ' · $segment' : ''}', 'Hi${name.text.isNotEmpty ? ', ${name.text.split(' ').first}' : ''}. Let’s set up your semester.',
          'We pre-filled what we already know from the waitlist. Confirm and continue.', [
        const FieldLabel('Your name'),
        TextField(controller: name, textCapitalization: TextCapitalization.words, onChanged: (_) => setState(() {})),
        const FieldLabel('Email'),
        SageCard(padding: const EdgeInsets.all(14), child: Row(children: [const Icon(Icons.verified_rounded, size: 18, color: SageColors.mintInk), const SizedBox(width: 8), Text(email, style: SageText.body(14, weight: FontWeight.w600))])),
        const FieldLabel('I’m using SAGE as'),
        for (final m in [('student', 'MBA student', 'Classes, placements, exam prep', Icons.school_outlined), ('professional', 'Working professional', 'Upskilling and role change', Icons.badge_outlined), ('founder', 'Founder', 'Weekly priorities and learning', Icons.rocket_launch_outlined)])
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: SageCard(
              onTap: () => setState(() => mode = m.$1),
              color: mode == m.$1 ? SageColors.violetTint : null,
              borderColor: mode == m.$1 ? SageColors.violet : null,
              child: Row(children: [
                Icon(m.$4, color: mode == m.$1 ? SageColors.violet : SageColors.muted),
                const SizedBox(width: 14),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(m.$2, style: SageText.title(15.5)), Text(m.$3, style: SageText.body(13, color: SageColors.muted))])),
                if (mode == m.$1) const Icon(Icons.check_circle_rounded, color: SageColors.violet),
              ]),
            ),
          ),
      ]);

  Widget _programme() => _scroll('BITSoM · Mumbai', 'Your programme', 'MBA at BITS School of Management. Tell us where you are in it.', [
        const FieldLabel('Current term'),
        ChoiceChips(
          options: [for (var i = 1; i <= 6; i++) 'Term $i'],
          selected: {'Term $semester'},
          multi: false,
          onToggle: (o) => setState(() {
            semester = int.parse(o.split(' ').last);
            subjects.removeWhere((s) => !termCourses.contains(s));
          }),
        ),
        const FieldLabel('Specialisation'),
        ChoiceChips(options: specialisations, selected: {specialisation}, multi: false, onToggle: (o) => setState(() => specialisation = o)),
        Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const FieldLabel('Batch (graduating)'), TextField(controller: batch, keyboardType: TextInputType.number)])),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const FieldLabel('Section'), TextField(controller: section, decoration: const InputDecoration(hintText: 'Optional'))])),
        ]),
      ]);

  Widget _courses() {
    final list = termCourses;
    return _scroll('Term $semester', 'Your courses', 'Pick what you’re taking this term. SAGE builds your timetable, attendance and study plan around them.', [
      const SizedBox(height: 12),
      Row(children: [
        Pill('${subjects.length} selected', tone: Tone.violet),
        const Spacer(),
        TextButton(onPressed: () => setState(() => subjects.addAll(list)), child: const Text('Select all')),
      ]),
      const SizedBox(height: 6),
      for (final c in list)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: SageCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            onTap: () => setState(() => subjects.contains(c) ? subjects.remove(c) : subjects.add(c)),
            color: subjects.contains(c) ? SageColors.violetTint : null,
            borderColor: subjects.contains(c) ? SageColors.violet : null,
            child: Row(children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: subjects.contains(c) ? SageColors.violet : Colors.transparent,
                  borderRadius: BorderRadius.circular(7),
                  border: Border.all(color: subjects.contains(c) ? SageColors.violet : SageColors.rule, width: 1.5),
                ),
                child: subjects.contains(c) ? const Icon(Icons.check_rounded, size: 15, color: Colors.white) : null,
              ),
              const SizedBox(width: 14),
              Expanded(child: Text(c, style: SageText.body(14.5, color: SageColors.ink, weight: FontWeight.w600))),
            ]),
          ),
        ),
      const SizedBox(height: 8),
      Text('From the published BITSoM catalogue. Current official syllabus unverified.', style: SageText.body(12, color: SageColors.muted)),
    ]);
  }

  Widget _goals() => _scroll('Placements', 'Your goal', 'This drives job recommendations, class priorities and your semester plan.', [
        const FieldLabel('Dream role'),
        TextField(controller: targetRole, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(hintText: 'e.g. Product Manager, Investment Analyst')),
        const FieldLabel('Career goal'),
        TextField(controller: careerGoal, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(hintText: 'e.g. Convert a PPO in product at a consumer-tech company')),
        const FieldLabel('Dream salary', hint: 'An aspiration we plan toward — not a forecast'),
        SageCard(
          child: Column(children: [
            Row(children: [
              Text('₹${salary.round()} LPA', style: SageText.display(28, color: SageColors.violet)),
              const Spacer(),
              Pill(salary >= 30 ? 'Stretch' : salary >= 18 ? 'Ambitious' : 'Solid', tone: Tone.lime),
            ]),
            Slider(value: salary, min: 3, max: 80, divisions: 77, onChanged: (v) => setState(() => salary = v)),
          ]),
        ),
        const FieldLabel('Time you can give each day'),
        SageCard(
          child: Column(children: [
            Row(children: [
              Text('${minutes.round()} min', style: SageText.display(28)),
              const Spacer(),
              Text('${(minutes / 60).toStringAsFixed(1)} h / day', style: SageText.mono(12)),
            ]),
            Slider(value: minutes, min: 15, max: 300, divisions: 57, onChanged: (v) => setState(() => minutes = v)),
          ]),
        ),
        const FieldLabel('Preferred locations'),
        ChoiceChips(options: _locations, selected: locations, onToggle: (o) => setState(() => locations.contains(o) ? locations.remove(o) : locations.add(o))),
        const FieldLabel('Skills you already have'),
        ChoiceChips(options: _skills, selected: skills, onToggle: (o) => setState(() => skills.contains(o) ? skills.remove(o) : skills.add(o))),
      ]);

  Widget _experience() => _scroll('Resume facts', 'Your experience', 'Used for job fit and Interview AI. Only what you write here — nothing is invented.', [
        const FieldLabel('Internships completed'),
        SageCard(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Row(children: [
            IconButton(onPressed: internships > 0 ? () => setState(() => internships--) : null, icon: const Icon(Icons.remove_rounded)),
            Expanded(child: Text('$internships', textAlign: TextAlign.center, style: SageText.display(24))),
            IconButton(onPressed: () => setState(() => internships++), icon: const Icon(Icons.add_rounded)),
          ]),
        ),
        const FieldLabel('Projects, work experience and achievements'),
        TextField(controller: experience, minLines: 4, maxLines: 8, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(hintText: '2 years as a business analyst at…')),
        const FieldLabel('Resume summary', hint: 'Paste key lines from your resume'),
        TextField(controller: resume, minLines: 4, maxLines: 10, decoration: const InputDecoration(hintText: 'Education, roles, metrics, tools…')),
      ]);

  Widget _context() => _scroll(mode == 'founder' ? 'Founder' : 'Professional', 'Your context', 'SAGE uses this to pick priorities. Missing details are never guessed.', [
        for (final f in _otherFields()) ...[
          FieldLabel('${f.$2}${f.$3 ? ' *' : ''}'),
          TextField(controller: other[f.$1] ??= TextEditingController(), keyboardType: f.$1.contains('hours') ? TextInputType.number : TextInputType.text),
        ],
      ]);

  Widget _calls() => _scroll('AI calls', 'When should SAGE call?', 'Calls only go to your own number and always need your confirmation in the app.', [
        const FieldLabel('Phone number'),
        TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(hintText: '+91 98765 43210', prefixIcon: Icon(Icons.phone_rounded))),
        const SizedBox(height: 14),
        _switchCard('Study & interview practice calls', 'Let the AI tutor call you when you start a practice session', callConsent, (v) => setState(() => callConsent = v)),
        const SizedBox(height: 10),
        _switchCard('Missed-deadline follow-ups', 'If an assignment or fee deadline passes, SAGE may call once (9 am–6 pm IST) to understand why', deadlineConsent,
            (v) => setState(() => deadlineConsent = v)),
        if (callConsent || deadlineConsent) ...[
          const FieldLabel('Best time to call'),
          ChoiceChips(options: _windows, selected: {window}, multi: false, onToggle: (o) => setState(() => window = o)),
        ],
      ]);

  Widget _switchCard(String title, String subtitle, bool value, ValueChanged<bool> onChanged) => SageCard(
        child: Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: SageText.title(15)), const SizedBox(height: 3), Text(subtitle, style: SageText.body(12.5, color: SageColors.muted))])),
          const SizedBox(width: 10),
          Switch.adaptive(value: value, activeTrackColor: SageColors.violet, onChanged: onChanged),
        ]),
      );

  Widget _review() {
    final rows = isStudent
        ? [
            ('Name', name.text),
            ('Programme', 'BITSoM MBA · Term $semester · Batch ${batch.text}'),
            ('Specialisation', specialisation),
            ('Courses', '${subjects.length} selected'),
            ('Dream role', targetRole.text),
            ('Dream salary', '₹${salary.round()} LPA'),
            ('Daily time', '${minutes.round()} minutes'),
            ('Locations', locations.join(', ')),
            ('Calls', callConsent || deadlineConsent ? 'Allowed · $window' : 'Not now'),
          ]
        : [('Name', name.text), ('Mode', mode), for (final f in _otherFields()) (f.$2.split(' (').first, other[f.$1]?.text ?? '')];
    return _scroll('Almost there', 'Looks right?', 'You can change any of this later from your account.', [
      const SizedBox(height: 12),
      SageCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const Divider(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(width: 110, child: Text(rows[i].$1, style: SageText.body(13, color: SageColors.muted))),
                Expanded(child: Text(rows[i].$2.isEmpty ? '—' : rows[i].$2, style: SageText.body(14, color: SageColors.ink, weight: FontWeight.w700))),
              ]),
            ),
          ],
        ]),
      ),
    ]);
  }
}
