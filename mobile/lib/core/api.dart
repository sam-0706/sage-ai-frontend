import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Base URL: production by default; `--dart-define=SAGE_API_URL=...` overrides.
const String _kApiBaseDefine = String.fromEnvironment('SAGE_API_URL', defaultValue: 'https://sage-ai-backend-hazel.vercel.app');

/// An empty define means "same origin" (web builds served behind the API).
String get kApiBase => _kApiBaseDefine.isEmpty ? Uri.base.origin : _kApiBaseDefine;

/// Debug builds only: authenticate as a waitlisted email against a backend running DEV_AUTH_BYPASS.
const String _kDevEmail = String.fromEnvironment('SAGE_DEV_EMAIL');
String? get devEmail => kDebugMode && _kDevEmail.isNotEmpty ? _kDevEmail : null;

class ApiException implements Exception {
  ApiException(this.message, {this.status = 0, this.code = 'error', this.details});
  final String message;
  final int status;
  final String code;
  final Object? details;

  bool get isUpgrade => code == 'upgrade_required' || code == 'plan_required' || code == 'quota_exceeded';
  bool get isAuth => status == 401;

  @override
  String toString() => message;
}

String friendlyError(Object e) {
  if (e is ApiException) {
    if (e.code == 'quota_exceeded') return '${e.message}. Upgrade your plan to continue.';
    return e.message;
  }
  if (e is TimeoutException) return 'That took too long. Check your connection and try again.';
  return 'Could not reach SAGE. Check your connection and try again.';
}

String newKey() {
  final r = Random.secure();
  return List.generate(24, (_) => r.nextInt(16).toRadixString(16)).join();
}

/// Thin JSON client over the SAGE /v1 API. The session token lives in the platform keychain.
class Api {
  Api._();
  static final Api instance = Api._();

  static const _tokenKey = 'sage.session.token';
  final _storage = const FlutterSecureStorage();
  final _client = http.Client();
  String? _token;
  SharedPreferences? _prefs;
  final Map<String, Object?> _memory = {};

  /// Fired when the server rejects the session so the app can return to sign-in.
  final ValueNotifier<int> unauthorized = ValueNotifier(0);

  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
    try {
      _token = await _storage.read(key: _tokenKey);
    } catch (_) {
      _token = null;
    }
  }

  bool get hasSession => devEmail != null || (_token?.isNotEmpty ?? false);

  Future<void> saveToken(String token) async {
    _token = token;
    await _storage.write(key: _tokenKey, value: token);
  }

  Future<void> clearSession() async {
    _token = null;
    _memory.clear();
    await _storage.delete(key: _tokenKey);
    final prefs = _prefs;
    if (prefs != null) {
      for (final k in prefs.getKeys().where((k) => k.startsWith('cache:'))) {
        await prefs.remove(k);
      }
    }
  }

  Map<String, String> _headers({bool json = false}) => {
        'Accept': 'application/json',
        if (json) 'Content-Type': 'application/json',
        'X-Dev-User-Email': ?devEmail,
        if (devEmail == null && _token != null) 'Authorization': 'Bearer $_token',
      };

  Future<dynamic> _send(String method, String path, {Object? body, Duration timeout = const Duration(seconds: 90), bool auth = true}) async {
    final uri = Uri.parse('$kApiBase$path');
    final req = http.Request(method, uri)..headers.addAll(auth ? _headers(json: body != null) : {'Content-Type': 'application/json'});
    if (body != null) req.body = jsonEncode(body);
    http.Response resp;
    try {
      resp = await http.Response.fromStream(await _client.send(req).timeout(timeout));
    } on TimeoutException {
      rethrow;
    } catch (_) {
      throw ApiException('Could not reach SAGE. Check your connection and try again.', code: 'network_error');
    }
    final text = utf8.decode(resp.bodyBytes);
    final data = text.isEmpty ? null : _decode(text);
    if (resp.statusCode >= 400) {
      final err = data is Map ? data['error'] as Map? : null;
      final ex = ApiException((err?['message'] as String?) ?? 'Request failed (HTTP ${resp.statusCode})',
          status: resp.statusCode, code: (err?['code'] as String?) ?? 'http_error', details: err?['details']);
      if (resp.statusCode == 401 && auth && devEmail == null && _token != null) unauthorized.value++;
      throw ex;
    }
    return data;
  }

  dynamic _decode(String text) {
    try {
      return jsonDecode(text);
    } catch (_) {
      return {'raw': text};
    }
  }

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body: body ?? {});
  Future<dynamic> patch(String path, Object body) => _send('PATCH', path, body: body);
  Future<dynamic> delete(String path) => _send('DELETE', path);
  Future<dynamic> postPublic(String path, Object body) => _send('POST', path, body: body, auth: false, timeout: const Duration(seconds: 20));

  /// Stale-while-revalidate: returns the last known value instantly (if any), then the fresh one.
  Stream<dynamic> watch(String path) async* {
    final cached = _memory[path] ?? _readDisk(path);
    if (cached != null) yield cached;
    final fresh = await get(path);
    _memory[path] = fresh;
    unawaited(_prefs?.setString('cache:$path', jsonEncode(fresh)));
    yield fresh;
  }

  dynamic cached(String path) => _memory[path] ?? _readDisk(path);

  void remember(String path, dynamic value) {
    _memory[path] = value;
    unawaited(_prefs?.setString('cache:$path', jsonEncode(value)));
  }

  dynamic _readDisk(String path) {
    final s = _prefs?.getString('cache:$path');
    if (s == null) return null;
    try {
      return jsonDecode(s);
    } catch (_) {
      return null;
    }
  }

  SharedPreferences get prefs => _prefs!;
}
