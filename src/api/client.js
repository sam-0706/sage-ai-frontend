// SAGE AI API client — shared by the web app and the Electron shell.
// Every request carries the Clerk session token; the backend owns all authorization.

export function createSageClient({ baseUrl, getToken }) {
  async function request(method, path, body) {
    const token = await getToken();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json();
    if (!res.ok) {
      // Consistent envelope: { error: { code, message, details, correlation_id } }
      const err = new Error(data?.error?.message || `HTTP ${res.status}`);
      Object.assign(err, { status: res.status, ...data?.error });
      throw err;
    }
    return data;
  }

  // Server-Sent Events over POST for the knowledge assistant.
  async function streamChat(sessionId, content, { onMeta, onDelta, onDone, onError } = {}) {
    const token = await getToken();
    const res = await fetch(`${baseUrl}/v1/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, stream: true }),
    });
    if (!res.ok) throw Object.assign(new Error('chat failed'), (await res.json()).error);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const ev = JSON.parse(line.slice(6));
        ({ meta: onMeta, delta: onDelta, done: onDone, error: onError })[ev.type]?.(ev);
      }
    }
  }

  const newKey = () => crypto.randomUUID();

  return {
    me: () => request('GET', '/v1/me'),
    home: () => request('GET', '/v1/home'),
    updateMe: (patch) => request('PATCH', '/v1/me', patch),
    profile: () => request('GET', '/v1/profile'),
    saveProfile: (mode, data) => request('PUT', '/v1/profile', { mode, data }),
    demoProfiles: (mode) => request('GET', `/v1/demo-profiles${mode ? `?mode=${mode}` : ''}`),
    loadDemo: (key) => request('POST', '/v1/profile/load-demo', { key }),
    signals: () => request('GET', '/v1/signals'),
    addSignal: (s) => request('POST', '/v1/signals', s),
    updateSignal: (id, patch) => request('PATCH', `/v1/signals/${id}`, patch),
    prioritize: () => request('POST', '/v1/interventions/prioritize'),
    callPreflight: (interventionId) => request('GET', `/v1/calls/preflight?intervention_id=${interventionId}`),
    // idempotencyKey: create once per "Start check-in" screen so repeated taps never create duplicate calls
    startCall: ({ interventionId, destination, idempotencyKey = newKey() }) =>
      request('POST', '/v1/calls', { intervention_id: interventionId, destination, consent: true, consent_version: 'v1', idempotency_key: idempotencyKey }),
    simulateCall: (interventionId) => request('POST', '/v1/calls/simulate', { intervention_id: interventionId, idempotency_key: newKey() }),
    call: (id) => request('GET', `/v1/calls/${id}`), // poll every ~5s until status is final and extraction_status settles
    cancelCall: (id) => request('POST', `/v1/calls/${id}/cancel`),
    transcript: (id) => request('GET', `/v1/calls/${id}/transcript`),
    plans: () => request('GET', '/v1/plans'),
    plan: (id) => request('GET', `/v1/plans/${id}`),
    editPlan: (id, patch) => request('PATCH', `/v1/plans/${id}`, patch),
    acceptPlan: (id) => request('POST', `/v1/plans/${id}/accept`),
    sharePlan: (id, includeTranscript = false) => request('POST', `/v1/plans/${id}/share`, { confirm: true, include_transcript: includeTranscript }),
    advisorTemplates: () => request('GET', '/v1/advisor-templates'),
    directory: (q) => request('GET', `/v1/directory${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    newChat: () => request('POST', '/v1/chat/sessions', {}),
    chatSessions: () => request('GET', '/v1/chat/sessions'),
    chatMessages: (id) => request('GET', `/v1/chat/sessions/${id}/messages`),
    streamChat,
    billingPlans: () => request('GET', '/v1/billing/plans'),
    createOrder: (planCode, idempotencyKey = newKey()) => request('POST', '/v1/billing/orders', { plan_code: planCode, idempotency_key: idempotencyKey }),
    verifyPayment: (resp) => request('POST', '/v1/billing/verify', resp), // pass Razorpay handler response as-is
    request,
  };
}
