/** Framework-independent frontend adapter. No npm dependencies. */
export type Source = "live" | "replay" | "manual";
export type Policy = "combined" | "behavior_only" | "observe";

export interface SessionConfig {
  participant_id: string;
  website_url: string;
  website_name?: string;
  observation_label?: string;
  known_element_ids?: string[];
  source?: Source;
  policy?: Policy;
  sample_rate?: number;
  channel_names?: string[];
  calibration_session_id?: string;
  // Friction-evidence thresholds; all optional, sane defaults on the backend.
  risk_threshold?: number;
  consecutive_windows?: number;
  long_gaze_dwell_ms?: number;
  min_gaze_confidence?: number;
  rage_click_min_count?: number;
  repeated_click_min_count?: number;
  scroll_reversal_min_count?: number;
  inactivity_min_ms?: number;
  episode_merge_window_seconds?: number;
  min_friction_score?: number;
  auto_suggest?: boolean;
}

export interface SessionState {
  session_id: string;
  phase: "setup" | "calibrating" | "ready" | "observing" | "ended" | "interrupted";
  config: SessionConfig;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
  end_reason: string | null;
  context: { page_url: string | null; element_id: string | null };
  metrics: { elapsed_seconds: number; event_count: number; gaze_count: number };
  eeg: {
    source: Source; quality: "disconnected" | "waiting" | "usable" | "poor" | "stale";
    quality_details: Record<string, unknown> | null; risk_score: number | null;
    features: Record<string, number> | null; last_window_age_seconds: number | null;
    total_windows: number; rejected_windows: number; consecutive_high_windows: number;
  };
  calibration: {
    ready: boolean; report: Record<string, unknown> | null; trial_count: number;
    low_friction_trials: number; high_friction_trials: number; invalid_trials: number;
    active_trial_id: string | null; active_trial_usable_windows: number;
  };
  friction: { total: number; open_episodes: number; by_severity: Record<string, number> };
}

interface EventBase {
  event_id: string;
  page_url: string;
  // Seconds since this session's start() resolved, per the frontend's own clock.
  // Never epoch time -- see clientTs() below.
  client_ts: number;
  element_id?: string;
  metadata?: Record<string, string | number | boolean>;
}

export type BehaviorEvent =
  | (EventBase & { type: "element_enter"; element_id: string; x?: number; y?: number })
  | (EventBase & { type: "element_leave"; element_id: string; duration_ms: number })
  | (EventBase & { type: "element_click"; element_id: string; x: number; y: number })
  | (EventBase & { type: "repeated_click"; element_id: string; click_count: number; duration_ms: number })
  | (EventBase & { type: "rage_click"; element_id: string; click_count: number; duration_ms: number; x?: number; y?: number })
  | (EventBase & { type: "scroll"; direction: "up" | "down"; scroll_y?: number })
  | (EventBase & { type: "scroll_reversal"; reversal_count: number })
  | (EventBase & { type: "backtrack"; previous_page_url: string })
  | (EventBase & { type: "input_error"; element_id: string })
  | (EventBase & { type: "navigation"; previous_page_url?: string })
  | (EventBase & { type: "inactivity"; duration_ms: number })
  | (EventBase & { type: "observation_end"; reason?: "completed" | "abandoned" | "navigated_away" | "tab_closed" });

// What callers supply to `.event()` -- event_id/client_ts are filled in by the adapter.
// The conditional distributes Omit across the BehaviorEvent union so each variant keeps
// only its own extra fields (a plain Omit<Union, K> would collapse to the shared keys).
type DistributeOmit<T, K extends string> = T extends unknown ? Omit<T, K> : never;
export type EventInput = DistributeOmit<BehaviorEvent, "event_id" | "client_ts">;

export interface GazeObservation {
  observation_id: string;
  element_id?: string;
  page_url: string;
  // Same seconds-since-start convention as BehaviorEvent.client_ts.
  timestamp: number;
  x?: number;
  y?: number;
  dwell_ms: number;
  confidence: number;
  viewport_width?: number;
  viewport_height?: number;
}
export type GazeInput = Omit<GazeObservation, "observation_id" | "timestamp">;

export type CalibrationLabel = "low_friction" | "high_friction" | "invalid";

export interface SuggestionResult {
  problem: string;
  suggestion: string;
  priority: "low" | "medium" | "high";
  rationale: string;
}

export interface FrictionEvent {
  friction_event_id: string;
  page_url: string;
  element_id: string | null;
  friction_score: number;
  severity: "low" | "medium" | "high";
  evidence: string[];
  started_at: number;
  ended_at: number;
  source_mode: Policy;
  suggestion: SuggestionResult | null;
}

export class FrictionFixClient {
  private queue: Promise<unknown> = Promise.resolve();
  private observationStartedAt: number | null = null;
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

  async start(id: string) {
    const state = await this.request<SessionState>(`/sessions/${id}/start`, {});
    this.observationStartedAt = performance.now(); // anchors clientTs(); do this once per session
    return state;
  }

  end(id: string, reason?: "completed" | "abandoned" | "navigated_away") {
    return this.request<SessionState>(`/sessions/${id}/end`, { reason: reason ?? null });
  }

  /** Seconds since start() resolved. Call start() before event()/gaze(). */
  private clientTs(): number {
    if (this.observationStartedAt === null) {
      throw new Error("Call start() before recording events or gaze");
    }
    return (performance.now() - this.observationStartedAt) / 1000;
  }

  event(id: string, payload: EventInput, eventId: string = crypto.randomUUID()) {
    // Keep events ordered; a failed send must not poison subsequent ones.
    const send = () => this.request<SessionState>(`/sessions/${id}/events`,
      { ...payload, event_id: eventId, client_ts: this.clientTs() } as BehaviorEvent);
    const result = this.queue.then(send);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Submit one already-computed gaze observation from your eye-tracking pipeline. */
  gaze(id: string, payload: GazeInput, observationId: string = crypto.randomUUID()) {
    return this.request<SessionState>(`/sessions/${id}/gaze`,
      { ...payload, observation_id: observationId, timestamp: this.clientTs() } as GazeObservation);
  }

  startCalibration(id: string) { return this.request<SessionState>(`/sessions/${id}/calibration/start`, {}); }
  startTrial(id: string) { return this.request<SessionState>(`/sessions/${id}/calibration/trials/start`, {}); }
  endTrial(id: string, label: CalibrationLabel) {
    return this.request<SessionState>(`/sessions/${id}/calibration/trials/end`, { label });
  }
  cancelTrial(id: string) { return this.request<SessionState>(`/sessions/${id}/calibration/trials/cancel`, {}); }
  fitCalibration(id: string) { return this.request<SessionState>(`/sessions/${id}/calibration/fit`, {}); }

  frictionEvents(id: string) {
    return this.request<{ friction_events: FrictionEvent[] }>(`/sessions/${id}/friction-events`);
  }

  requestSuggestion(id: string, frictionEventId: string,
                    extra?: { element_type?: string; element_description?: string }) {
    return this.request<SuggestionResult>(
      `/sessions/${id}/friction-events/${frictionEventId}/suggestion`, extra ?? {});
  }

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
