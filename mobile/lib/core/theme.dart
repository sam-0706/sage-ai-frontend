import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

/// SAGE "Daylight" — shared with the desktop and web clients:
/// warm paper canvas, ink hero surfaces, electric violet anchor, lime/coral/mint signals.
class SageColors {
  static const paper = Color(0xFFF7F4EC);
  static const paper2 = Color(0xFFEFEAE0);
  static const card = Color(0xFFFFFDF8);
  static const ink = Color(0xFF17142A);
  static const ink2 = Color(0xFF3A3550);
  static const inkSoft = Color(0xFF231F3B);
  static const muted = Color(0xFF6A6479);
  static const rule = Color(0xFFE6E0EC);
  static const violet = Color(0xFF6F42E8);
  static const violetDeep = Color(0xFF3D247F);
  static const violetTint = Color(0xFFEEE8FD);
  static const lilac = Color(0xFFB9A4FF);
  static const lime = Color(0xFFC8F45A);
  static const coral = Color(0xFFFF6B52);
  static const coralTint = Color(0xFFFFE6E0);
  static const mint = Color(0xFFB8F1D2);
  static const mintInk = Color(0xFF1B7A4B);
  static const amber = Color(0xFFF4B740);
  static const amberTint = Color(0xFFFFF1D6);
  static const amberInk = Color(0xFF8A5A00);
}

class SageText {
  static TextStyle display(double size, {Color color = SageColors.ink, FontWeight weight = FontWeight.w800}) =>
      GoogleFonts.manrope(fontSize: size, fontWeight: weight, color: color, letterSpacing: -size * 0.035, height: 1.08);
  static TextStyle title(double size, {Color color = SageColors.ink, FontWeight weight = FontWeight.w700}) =>
      GoogleFonts.manrope(fontSize: size, fontWeight: weight, color: color, letterSpacing: -size * 0.015, height: 1.2);
  static TextStyle body(double size, {Color color = SageColors.ink2, FontWeight weight = FontWeight.w500, double height = 1.45}) =>
      GoogleFonts.manrope(fontSize: size, fontWeight: weight, color: color, height: height);
  static TextStyle mono(double size, {Color color = SageColors.muted, FontWeight weight = FontWeight.w600}) =>
      GoogleFonts.jetBrainsMono(fontSize: size, fontWeight: weight, color: color, letterSpacing: 0.6);
  static TextStyle kicker({Color color = SageColors.violet}) =>
      GoogleFonts.jetBrainsMono(fontSize: 11, fontWeight: FontWeight.w700, color: color, letterSpacing: 1.4);
}

ThemeData buildSageTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: SageColors.violet,
      primary: SageColors.violet,
      onPrimary: Colors.white,
      surface: SageColors.card,
      onSurface: SageColors.ink,
      error: SageColors.coral,
    ),
    scaffoldBackgroundColor: SageColors.paper,
    splashFactory: InkSparkle.splashFactory,
  );
  final text = GoogleFonts.manropeTextTheme(base.textTheme).apply(bodyColor: SageColors.ink2, displayColor: SageColors.ink);
  OutlineInputBorder border(Color c, [double w = 1]) =>
      OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: c, width: w));
  return base.copyWith(
    textTheme: text,
    appBarTheme: AppBarTheme(
      backgroundColor: SageColors.paper,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      systemOverlayStyle: SystemUiOverlayStyle.dark,
      titleTextStyle: SageText.title(17),
      iconTheme: const IconThemeData(color: SageColors.ink),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: SageColors.card,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      labelStyle: SageText.body(14, color: SageColors.muted),
      floatingLabelStyle: SageText.body(14, color: SageColors.violet, weight: FontWeight.w700),
      hintStyle: SageText.body(14, color: SageColors.muted.withValues(alpha: .7)),
      border: border(SageColors.rule),
      enabledBorder: border(SageColors.rule),
      focusedBorder: border(SageColors.violet, 1.6),
      errorBorder: border(SageColors.coral),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: SageColors.ink,
      contentTextStyle: SageText.body(14, color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: SageColors.paper,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
    ),
    dividerTheme: const DividerThemeData(color: SageColors.rule, thickness: 1, space: 1),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
    }),
    sliderTheme: const SliderThemeData(
      activeTrackColor: SageColors.violet,
      inactiveTrackColor: SageColors.violetTint,
      thumbColor: SageColors.violet,
      overlayColor: Color(0x226F42E8),
    ),
  );
}
