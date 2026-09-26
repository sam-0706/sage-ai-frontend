import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'academics.dart';
import 'api.dart';

class CourseAttendance {
  CourseAttendance(this.course, this.attended, this.held);
  final String course;
  int attended;
  int held;
  Map<String, dynamic> toJson() => {'course': course, 'attended': attended, 'held': held};
}

/// Attendance is tracked on the device (no student portal is connected) — same model as the desktop app.
class AttendanceBook extends ChangeNotifier {
  String? _owner;
  List<CourseAttendance> rows = [];
  double target = 75;

  String get _key => 'attendance:v1:$_owner';

  void load(String owner, List<String> subjects) {
    if (_owner == owner && rows.isNotEmpty && rows.map((r) => r.course).toSet().containsAll(subjects)) return;
    _owner = owner;
    final raw = Api.instance.prefs.getString(_key);
    final saved = <String, CourseAttendance>{};
    if (raw != null) {
      try {
        final j = jsonDecode(raw) as Map;
        target = (j['target'] as num?)?.toDouble() ?? 75;
        for (final r in (j['rows'] as List)) {
          saved[r['course'] as String] = CourseAttendance(r['course'] as String, r['attended'] as int, r['held'] as int);
        }
      } catch (_) {}
    }
    const seedAttended = [14, 17, 18, 12, 16, 15, 17, 13];
    final list = subjects.isEmpty ? starterCourses.take(6).map((c) => c.name).toList() : subjects;
    rows = [
      for (var i = 0; i < list.length; i++) saved[list[i]] ?? CourseAttendance(list[i], seedAttended[i % seedAttended.length], 20),
    ];
    notifyListeners();
  }

  int get attended => rows.fold(0, (a, r) => a + r.attended);
  int get held => rows.fold(0, (a, r) => a + r.held);
  AttendanceResult get overall => attendanceMath(attended, held, target);

  void mark(int i, {required bool present}) {
    rows[i].held++;
    if (present) rows[i].attended++;
    _save();
  }

  void undo(int i) {
    if (rows[i].held == 0) return;
    if (rows[i].attended == rows[i].held) rows[i].attended--;
    rows[i].held--;
    _save();
  }

  void setTarget(double t) {
    target = t;
    _save();
  }

  void reset() {
    Api.instance.prefs.remove(_key);
    final subjects = rows.map((r) => r.course).toList();
    rows = [];
    load(_owner ?? 'demo', subjects);
  }

  void _save() {
    Api.instance.prefs.setString(_key, jsonEncode({'target': target, 'rows': rows.map((r) => r.toJson()).toList()}));
    notifyListeners();
  }
}
