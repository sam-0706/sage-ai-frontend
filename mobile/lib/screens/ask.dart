import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';
import '../core/theme.dart';
import '../widgets/ui.dart';

class AskScreen extends StatefulWidget {
  const AskScreen({super.key});
  @override
  State<AskScreen> createState() => _AskScreenState();
}

class _AskScreenState extends State<AskScreen> {
  final input = TextEditingController();
  final scroll = ScrollController();
  final List<Map<String, dynamic>> messages = [];
  String? session;
  bool busy = false;

  static const starters = [
    'My attendance is below 75% — what are my options?',
    'Who should I contact about a section change?',
    'How should I prepare for product roles this term?',
    'Make me a one-week recovery plan for Statistics',
  ];

  Future<void> send(String text) async {
    final content = text.trim();
    if (content.isEmpty || busy) return;
    HapticFeedback.lightImpact();
    input.clear();
    setState(() {
      busy = true;
      messages.add({'role': 'user', 'content': content});
    });
    _scrollDown();
    try {
      session ??= '${(await Api.instance.post('/v1/chat/sessions') as Map)['id']}';
      final r = await Api.instance.post('/v1/chat/sessions/$session/messages', {'content': content, 'stream': false}) as Map;
      setState(() => messages.add({'role': 'assistant', 'content': r['content'], 'citations': r['citations'], 'safety': r['safety']}));
    } catch (e) {
      setState(() => messages.add({'role': 'error', 'content': friendlyError(e)}));
    } finally {
      if (mounted) setState(() => busy = false);
      _scrollDown();
    }
  }

  void _scrollDown() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (scroll.hasClients) scroll.animateTo(scroll.position.maxScrollExtent + 200, duration: const Duration(milliseconds: 350), curve: Curves.easeOutCubic);
      });

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Ask SAGE'), actions: [
          if (messages.isNotEmpty)
            IconButton(
              tooltip: 'New conversation',
              onPressed: () => setState(() {
                messages.clear();
                session = null;
              }),
              icon: const Icon(Icons.edit_square),
            ),
        ]),
        body: Column(children: [
          Expanded(
            child: messages.isEmpty
                ? ListView(padding: const EdgeInsets.all(20), children: [
                    Container(
                      width: 60,
                      height: 60,
                      decoration: BoxDecoration(color: SageColors.violetTint, borderRadius: BorderRadius.circular(20)),
                      child: const Icon(Icons.auto_awesome_rounded, color: SageColors.violet, size: 28),
                    ),
                    const SizedBox(height: 16),
                    Text('What’s on your mind?', style: SageText.display(28)),
                    const SizedBox(height: 8),
                    Text('Answers come from your college knowledge base and faculty directory, with sources. SAGE says so when it doesn’t know.',
                        style: SageText.body(14, color: SageColors.muted)),
                    const SizedBox(height: 20),
                    for (final s in starters)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: SageCard(
                          onTap: () => send(s),
                          child: Row(children: [
                            Expanded(child: Text(s, style: SageText.body(14, color: SageColors.ink, weight: FontWeight.w600))),
                            const Icon(Icons.north_east_rounded, size: 18, color: SageColors.violet),
                          ]),
                        ),
                      ),
                  ])
                : ListView.builder(
                    controller: scroll,
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    itemCount: messages.length + (busy ? 1 : 0),
                    itemBuilder: (_, i) {
                      if (i == messages.length) return const _Typing();
                      final m = messages[i];
                      if (m['role'] == 'user') {
                        return Align(
                          alignment: Alignment.centerRight,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 12, left: 48),
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            decoration: const BoxDecoration(color: SageColors.ink, borderRadius: BorderRadius.only(topLeft: Radius.circular(20), topRight: Radius.circular(20), bottomLeft: Radius.circular(20), bottomRight: Radius.circular(6))),
                            child: Text('${m['content']}', style: SageText.body(14.5, color: Colors.white)),
                          ),
                        );
                      }
                      if (m['role'] == 'error') return Padding(padding: const EdgeInsets.only(bottom: 12), child: ErrorBanner('${m['content']}'));
                      final cites = ((m['citations'] as List?) ?? []).cast<Map>();
                      final crisis = (m['safety'] as Map?)?['crisis'] == true;
                      return Container(
                        margin: const EdgeInsets.only(bottom: 12, right: 24),
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: SageColors.card,
                          borderRadius: const BorderRadius.only(topLeft: Radius.circular(20), topRight: Radius.circular(20), bottomRight: Radius.circular(20), bottomLeft: Radius.circular(6)),
                          border: Border.all(color: crisis ? SageColors.amber : SageColors.rule, width: crisis ? 2 : 1),
                        ),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          SelectableText('${m['content']}', style: SageText.body(14.5, color: SageColors.ink)),
                          if (cites.isNotEmpty) ...[
                            const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider()),
                            Wrap(spacing: 6, runSpacing: 6, children: [
                              for (final c in cites)
                                Tooltip(message: '${c['title']}\n\n${c['snippet'] ?? ''}', child: Pill('[${c['n']}] ${c['heading'] ?? c['title']}${c['is_demo'] == true ? ' · DEMO' : ''}', tone: Tone.violet)),
                            ]),
                          ],
                        ]),
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              decoration: const BoxDecoration(color: SageColors.paper, border: Border(top: BorderSide(color: SageColors.rule))),
              child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Expanded(
                  child: TextField(
                    controller: input,
                    minLines: 1,
                    maxLines: 5,
                    textCapitalization: TextCapitalization.sentences,
                    textInputAction: TextInputAction.send,
                    onSubmitted: send,
                    decoration: const InputDecoration(hintText: 'Ask about policies, people, plans…'),
                  ),
                ),
                const SizedBox(width: 8),
                Material(
                  color: SageColors.violet,
                  borderRadius: BorderRadius.circular(16),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: busy ? null : () => send(input.text),
                    child: const SizedBox(width: 50, height: 50, child: Icon(Icons.arrow_upward_rounded, color: Colors.white)),
                  ),
                ),
              ]),
            ),
          ),
        ]),
      );
}

class _Typing extends StatefulWidget {
  const _Typing();
  @override
  State<_Typing> createState() => _TypingState();
}

class _TypingState extends State<_Typing> with SingleTickerProviderStateMixin {
  late final AnimationController c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat();
  @override
  void dispose() {
    c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(color: SageColors.card, borderRadius: BorderRadius.circular(18), border: Border.all(color: SageColors.rule)),
          child: AnimatedBuilder(
            animation: c,
            builder: (_, _) => Row(mainAxisSize: MainAxisSize.min, children: [
              for (var i = 0; i < 3; i++)
                Container(
                  width: 7,
                  height: 7,
                  margin: const EdgeInsets.symmetric(horizontal: 2.5),
                  decoration: BoxDecoration(
                    color: SageColors.violet.withValues(alpha: .25 + .75 * (((c.value * 3 - i) % 3) < 1 ? 1 - ((c.value * 3 - i) % 3) : 0)),
                    shape: BoxShape.circle,
                  ),
                ),
              const SizedBox(width: 8),
              Text('Searching your knowledge base…', style: SageText.body(12.5, color: SageColors.muted)),
            ]),
          ),
        ),
      );
}
