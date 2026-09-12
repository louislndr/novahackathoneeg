/** Framework-independent frontend adapter. No npm dependencies. */
export type Layout = "conventional" | "guided";
export type Source = "live" | "replay" | "manual";
export interface SessionConfig {
  participant_id: string;
  field_ids: string[];
  task_key?: string;
  source?: Source;
  initial_layout?: Layout;
  policy?: "combined" | "behavior_only" | "observe";
  sample_rate?: number;
  channel_names?: string[];
  hesitation_seconds?: number;
  risk_threshold?: number;
  consecutive_windows?: number;
  calibration_session_id?: string;
}
export interface SessionState {
  session_id: string;
  phase: "setup" | "calibrating" | "ready" | "running" | "completed" | "abandoned" | "interrupted";
  layout: Layout;
  config: SessionConfig;
  adaptation_request: null | {
    request_id: string; layout: "guided"; reason: string; source: Source;
    policy: string; risk_score: number | null; at_seconds: number;
  };
  metrics: {
    elapsed_seconds: number; errors: number; completed: boolean;
    fields: Record<string, { errors: number; valid: boolean; focused_seconds: number }>;
    layout_changes: Array<{ at_seconds: number; from: Layout; to: Layout; reason: string }>;
  };
  eeg: {
    source: Source; quality: string; risk_score: number | null;
    features: Record<string, number> | null; total_windows: number; rejected_windows: number;
  };
  calibration: {
    ready: boolean; trial_count: number; fluent_trials: number; difficulty_proxy_trials: number;
    active_trial_id: string | null; active_trial_usable_windows: number;
    report: Record<string, unknown> | null;
  };
}
type EventPayload =
  | { type: "field_focus" | "field_blur" | "field_changed"; field_id: string }
  | { type: "field_validation"; field_id: string; correct: boolean }
  | { type: "layout_changed"; layout: Layout; reason: "manual" | "adaptation"; request_id?: string }
  | { type: "task_complete" | "task_abandon" };

export class FrictionFixClient {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(public readonly baseUrl = "http://127.0.0.1:8000") {}

  async request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(this.baseUrl + path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`FrictionFix ${response.status}: ${await response.text()}`);
    return response.json() as Promise<T>;
  }
  create(config: SessionConfig) { return this.request<SessionState>("/sessions", config); }
  state(id: string) { return this.request<SessionState>(`/sessions/${id}`); }
  start(id: string) { return this.request<SessionState>(`/sessions/${id}/start`, {}); }
  event(id: string, payload: EventPayload, eventId: string = crypto.randomUUID()) {
    // Keep edits, validation and completion ordered. Reuse eventId for retries.
    const send = () => this.request<SessionState>(`/sessions/${id}/events`, { ...payload, event_id: eventId });
    const result = this.queue.then(send);
    // A failed event must be handled by the UI; it must not poison subsequent requests.
    this.queue = result.catch(() => undefined);
    return result;
  }
  startCalibration(id: string) { return this.request<SessionState>(`/sessions/${id}/calibration/start`, {}); }
  startTrial(id: string) { return this.request<SessionState>(`/sessions/${id}/calibration/trials/start`, {}); }
  endTrial(id: string, success: boolean, errors: number) {
    return this.request<SessionState>(`/sessions/${id}/calibration/trials/end`, { success, errors });
  }
  cancelTrial(id: string) { return this.request<SessionState>(`/sessions/${id}/calibration/trials/cancel`, {}); }
  fitCalibration(id: string) { return this.request<SessionState>(`/sessions/${id}/calibration/fit`, {}); }
  compare(ids: string[]) { return this.request<Record<string, unknown>>("/compare", { session_ids: ids }); }
  exportUrl(id: string) { return `${this.baseUrl}/sessions/${id}/export`; }

  subscribe(id: string, onState: (state: SessionState) => void, onError: () => void) {
    const url = new URL(`/sessions/${id}/ws`, this.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    socket.onmessage = event => onState(JSON.parse(event.data) as SessionState);
    socket.onerror = onError;
    // Use GET /sessions/{id} polling if the connection is lost. Show disconnection.
    socket.onclose = onError;
    return () => { socket.onclose = null; socket.close(); };
  }
}
