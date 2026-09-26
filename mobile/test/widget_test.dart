import 'package:flutter_test/flutter_test.dart';
import 'package:sage_mobile/core/academics.dart';
import 'package:sage_mobile/core/format.dart';
import 'package:sage_mobile/screens/academics.dart' show attendanceFor;
import 'package:sage_mobile/widgets/ui.dart' show inr;

void main() {
  group('attendance maths (matches desktop + backend rules)', () {
    test('below target needs consecutive classes', () {
      final r = attendanceMath(92, 120, 75);
      expect(r.percentage!.toStringAsFixed(1), '76.7');
      expect(r.needed, 0);
      expect(r.canMiss, 2);
    });
    test('recovery count', () {
      final r = attendanceMath(12, 20, 75);
      expect(r.needed, 12); // (75*20 - 1200) / 25 = 12
    });
    test('100% unreachable after an absence', () {
      expect(attendanceMath(9, 10, 100).needed, isNull);
    });
    test('invalid input rejected', () {
      expect(() => attendanceMath(5, 4, 75), throwsArgumentError);
    });
    test('per-course helper agrees', () {
      final (pct, needed, miss) = attendanceFor(12, 20, 75);
      expect(pct, 60);
      expect(needed, 12);
      expect(miss, 0);
    });
  });

  test('Indian rupee grouping from paise', () {
    expect(inr(100000), '₹1,000');
    expect(inr(12345600), '₹1,23,456');
    expect(inr(4900000), '₹49,000');
  });

  test('demo schedule skips Sunday and rotates courses', () {
    final monday = DateTime(2026, 9, 28);
    expect(classesFor(monday, ['A', 'B', 'C']).map((c) => c.$2), ['A', 'B']);
    expect(classesFor(DateTime(2026, 9, 27), ['A']), isEmpty);
  });

  test('BITSoM starter library covers three terms', () {
    expect(starterCourses.length, 18);
    expect(starterCourses.map((c) => c.term).toSet(), {1, 2, 3});
  });
}
