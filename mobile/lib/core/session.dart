import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';

enum AuthPhase { booting, signedOut, waiting, signedIn }

/// Auth + identity state. Mobile sign-in reuses the backend device flow:
/// start → open the Google sign-in page in an in-app browser → poll until approved.
class Session extends ChangeNotifier {
  Session() {
    Api.instance.unauthorized.addListener(_onUnauthorized);
  }

  AuthPhase phase = AuthPhase.booting;
  Map<String, dynamic>? me;
  bool? onboarded;
  String? error;
  String? userCode;
  String? _verificationUrl;
  bool _polling = false;
  int _ticket = 0;

  Map<String, dynamic>? get user => me?['user'] as Map<String, dynamic>?;
  Map<String, dynamic>? get subscription => me?['subscription'] as Map<String, dynamic>?;
  String get firstName => ((user?['full_name'] as String?) ?? 'there').split(' ').first;
  bool get isSuperadmin => user?['role'] == 'superadmin';

  Future<void> boot() async {
    await Api.instance.init();
    if (!Api.instance.hasSession) {
      phase = AuthPhase.signedOut;
      notifyListeners();
      return;
    }
    // Paint instantly from cache, then confirm with the server.
    final cachedMe = Api.instance.cached('/v1/me');
    final cachedOb = Api.instance.cached('/v1/onboarding');
    if (cachedMe is Map<String, dynamic> && cachedOb is Map) {
      me = cachedMe;
      onboarded = cachedOb['completed'] == true;
      phase = AuthPhase.signedIn;
      notifyListeners();
    }
    await refresh(silent: cachedMe != null);
  }

  Future<void> refresh({bool silent = false}) async {
    try {
      final results = await Future.wait([Api.instance.get('/v1/me'), Api.instance.get('/v1/onboarding')]);
      me = results[0] as Map<String, dynamic>;
      onboarded = (results[1] as Map)['completed'] == true;
      Api.instance.remember('/v1/me', me);
      Api.instance.remember('/v1/onboarding', results[1]);
      phase = AuthPhase.signedIn;
      error = null;
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) {
        await Api.instance.clearSession();
        phase = AuthPhase.signedOut;
        error = e.code == 'not_on_waitlist'
            ? 'This email isn’t on the SAGE beta list yet. Sign in with the email you joined the waitlist with.'
            : e.message;
      } else if (!silent) {
        error = e.message;
        if (phase == AuthPhase.booting) phase = AuthPhase.signedOut;
      }
    } catch (e) {
      if (!silent) {
        error = friendlyError(e);
        if (phase == AuthPhase.booting) phase = AuthPhase.signedOut;
      }
    }
    notifyListeners();
  }

  Future<void> signIn() async {
    error = null;
    final ticket = ++_ticket;
    try {
      final start = await Api.instance.postPublic('/v1/auth/device/start', {'client': 'mobile', 'device_name': 'SAGE Mobile'});
      userCode = start['user_code'] as String;
      _verificationUrl = start['verification_url'] as String;
      phase = AuthPhase.waiting;
      notifyListeners();
      await openBrowser();
      unawaited(_poll(ticket, start['device_code'] as String, (start['interval'] as num).toInt(),
          DateTime.now().add(Duration(seconds: (start['expires_in'] as num).toInt()))));
    } catch (e) {
      phase = AuthPhase.signedOut;
      error = friendlyError(e);
      notifyListeners();
    }
  }

  Future<void> openBrowser() async {
    final url = _verificationUrl;
    if (url == null) return;
    await launchUrl(Uri.parse(url), mode: LaunchMode.inAppBrowserView);
  }

  Future<void> _poll(int ticket, String deviceCode, int interval, DateTime deadline) async {
    if (_polling) return;
    _polling = true;
    try {
      while (ticket == _ticket && DateTime.now().isBefore(deadline) && phase == AuthPhase.waiting) {
        await Future.delayed(Duration(seconds: interval.clamp(2, 10)));
        if (ticket != _ticket) return;
        try {
          final r = await Api.instance.postPublic('/v1/auth/device/token', {'device_code': deviceCode});
          final status = r['status'];
          if (status == 'approved' && r['access_token'] != null) {
            await Api.instance.saveToken(r['access_token'] as String);
            try {
              await closeInAppWebView();
            } catch (_) {}
            await refresh();
            return;
          }
          if (status == 'denied' || status == 'expired' || status == 'consumed') {
            phase = AuthPhase.signedOut;
            error = status == 'denied' ? 'Sign-in was cancelled in the browser.' : 'That sign-in link expired. Please try again.';
            notifyListeners();
            return;
          }
        } catch (_) {/* transient; keep polling */}
      }
      if (ticket == _ticket && phase == AuthPhase.waiting) {
        phase = AuthPhase.signedOut;
        error = 'That sign-in link expired. Please try again.';
        notifyListeners();
      }
    } finally {
      _polling = false;
    }
  }

  void cancelSignIn() {
    _ticket++;
    phase = AuthPhase.signedOut;
    notifyListeners();
  }

  Future<void> signOut() async {
    try {
      await Api.instance.post('/v1/auth/logout');
    } catch (_) {}
    await Api.instance.clearSession();
    me = null;
    onboarded = null;
    phase = AuthPhase.signedOut;
    notifyListeners();
  }

  void markOnboarded() {
    onboarded = true;
    notifyListeners();
    unawaited(refresh(silent: true));
  }

  void _onUnauthorized() {
    if (phase != AuthPhase.signedIn) return;
    unawaited(Api.instance.clearSession());
    phase = AuthPhase.signedOut;
    error = 'Your session ended. Please sign in again.';
    notifyListeners();
  }
}
