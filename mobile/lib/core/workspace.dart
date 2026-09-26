import 'dart:async';

import 'package:flutter/foundation.dart';

import 'api.dart';

/// The student's campus workspace (profile, plans, tasks, deadlines, opportunities, analytics).
class Workspace extends ChangeNotifier {
  Map<String, dynamic>? data;
  String? error;
  bool loading = false;
  StreamSubscription? _sub;

  Map<String, dynamic> get profile => (data?['profile'] as Map?)?.cast<String, dynamic>() ?? {};
  List<Map<String, dynamic>> list(String key) => ((data?[key] as List?) ?? []).cast<Map>().map((e) => e.cast<String, dynamic>()).toList();
  Map<String, dynamic> get analytics => (data?['analytics'] as Map?)?.cast<String, dynamic>() ?? {};
  List<Map<String, dynamic>> get tasks => list('tasks');
  List<Map<String, dynamic>> get deadlines => list('deadlines');
  List<Map<String, dynamic>> get opportunities => list('opportunities');
  List<Map<String, dynamic>> get plans => list('plans');
  List<Map<String, dynamic>> get assessments => list('assessments');
  Map<String, dynamic>? latestPlan(String kind) {
    for (final p in plans) {
      if (p['kind'] == kind) return p;
    }
    return null;
  }

  Future<void> refresh() {
    final done = Completer<void>();
    loading = true;
    notifyListeners();
    _sub?.cancel();
    _sub = Api.instance.watch('/v1/campus/workspace').listen((v) {
      data = (v as Map).cast<String, dynamic>();
      error = null;
      notifyListeners();
    }, onError: (Object e) {
      error = friendlyError(e);
      loading = false;
      notifyListeners();
      if (!done.isCompleted) done.complete();
    }, onDone: () {
      loading = false;
      notifyListeners();
      if (!done.isCompleted) done.complete();
    });
    return done.future;
  }

  void clear() {
    data = null;
    error = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
