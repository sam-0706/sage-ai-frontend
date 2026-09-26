import 'package:intl/intl.dart';

DateTime? parseDate(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

String dayTime(Object? v) {
  final d = parseDate(v);
  return d == null ? '' : DateFormat('EEE d MMM · h:mm a').format(d);
}

String dayOnly(Object? v) {
  final d = parseDate(v);
  return d == null ? '' : DateFormat('EEE d MMM').format(d);
}

String relative(Object? v) {
  final d = parseDate(v);
  if (d == null) return '';
  final diff = d.difference(DateTime.now());
  if (diff.isNegative) {
    final a = -diff.inMinutes;
    if (a < 60) return '${a}m overdue';
    if (a < 1440) return '${a ~/ 60}h overdue';
    return '${a ~/ 1440}d overdue';
  }
  if (diff.inMinutes < 60) return 'in ${diff.inMinutes}m';
  if (diff.inHours < 24) return 'in ${diff.inHours}h';
  return 'in ${diff.inDays}d';
}

bool sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

String greeting() {
  final h = DateTime.now().hour;
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/// Demo recurring schedule (same rule as the desktop): two classes Mon–Sat drawn from the student's courses.
List<(String, String)> classesFor(DateTime day, List<String> subjects) {
  if (subjects.isEmpty || day.weekday == DateTime.sunday) return [];
  final i = day.weekday - 1;
  return [('09:00', subjects[(i * 2) % subjects.length]), ('11:00', subjects[(i * 2 + 1) % subjects.length])];
}
