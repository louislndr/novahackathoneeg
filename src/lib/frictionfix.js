export class FrictionFixClient {
  constructor(baseUrl = 'http://127.0.0.1:8000') {
    this.baseUrl = baseUrl
    this.queue = Promise.resolve()
    this.observationStartedAt = null
  }

  async request(path, body) {
    const res = await fetch(this.baseUrl + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`FrictionFix ${res.status}: ${await res.text()}`)
    return res.json()
  }

  create(config) { return this.request('/sessions', config) }

  async start(id) {
    const state = await this.request(`/sessions/${id}/start`, {})
    this.observationStartedAt = performance.now()
    return state
  }

  end(id, reason) {
    return this.request(`/sessions/${id}/end`, { reason: reason ?? null })
  }

  clientTs() {
    if (this.observationStartedAt === null) throw new Error('Call start() first')
    return (performance.now() - this.observationStartedAt) / 1000
  }

  event(id, payload, eventId = crypto.randomUUID()) {
    const send = () => this.request(`/sessions/${id}/events`,
      { ...payload, event_id: eventId, client_ts: this.clientTs() })
    const result = this.queue.then(send)
    this.queue = result.catch(() => undefined)
    return result
  }

  gaze(id, payload, observationId = crypto.randomUUID()) {
    return this.request(`/sessions/${id}/gaze`,
      { ...payload, observation_id: observationId, timestamp: this.clientTs() })
  }

  frictionEvents(id) {
    return this.request(`/sessions/${id}/friction-events`)
  }
}
