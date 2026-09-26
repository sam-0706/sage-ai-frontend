import { createSageClient } from '../../src/api/client.js'

export const createClient = (getToken) => {
  const baseUrl = __API_BASE__.replace(/\/$/, '')
  const client = createSageClient({ baseUrl, getToken })
  return {
    ...client,
    onboarding: () => client.request('GET', '/v1/onboarding'),
    completeOnboarding: (body) => client.request('POST', '/v1/onboarding', body),
    campus: () => client.request('GET', '/v1/campus/workspace'),
    catalogue: () => client.request('GET', '/v1/campus/catalogue'),
    discoverJobs: (filters) => client.request('POST', '/v1/campus/jobs/discover', filters),
    generatePlan: (body) => client.request('POST', '/v1/campus/plans', body),
    subscription: () => client.request('GET', '/v1/billing/subscription'),
    plans: () => client.request('GET', '/v1/billing/plans'),
    autoApplyStatus: () => client.request('GET', '/v1/autoapply/status'),
    decks: () => client.request('GET', '/v1/exam-prep/decks'),
    createDeck: (body) => client.request('POST', '/v1/exam-prep/decks', body),
    deck: (id) => client.request('GET', `/v1/exam-prep/decks/${id}`),
    reviewCard: (id, rating) => client.request('POST', `/v1/exam-prep/cards/${id}/review`, { rating }),
    addDeadline: (body) => client.request('POST', '/v1/campus/deadlines', body),
    completeDeadline: (id) => client.request('POST', `/v1/campus/deadlines/${id}/complete`, {}),
  }
}
