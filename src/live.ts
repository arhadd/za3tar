// Talk: a voice session with Za3tar. The voice model (gpt-live-1, over
// WebRTC straight from the app) handles listening and speaking. It delegates
// every substantive turn to the client — us — and we answer with Za3tar's
// own brain: a model with the workspace snapshot and a small set of ops over
// the app's commands. The sideband that carries delegations needs a bearer
// header, which a browser WebSocket cannot set, so Rust holds it and relays
// events to us (live-event) and commentary back (live_send).
import { invoke, listen } from "./ipc";

export type TalkLine = {
  role: "you" | "za3tar" | "activity" | "error" | "status";
  text: string;
};

export type LiveOp =
  | { op: "park" | "unpark" | "done"; ref: string }
  | { op: "confirm" | "supersede"; ref: string }
  | { op: "move_thread"; id: string; summary?: string; status?: string }
  | { op: "open_thread"; id: string }
  | { op: "go"; view: string }
  | { op: "brief"; title: string; notes: string }
  | { op: "record" }
  | { op: "stop_recording" }
  | { op: "workspace"; id: string }
  | { op: "open_meeting"; id: string }
  | { op: "draft"; kind: "whatsapp" | "email" }
  | { op: "nudge"; ref: string }
  | {
      op: "person";
      name: string;
      phone?: string;
      email?: string;
      org?: string;
      role?: string;
    }
  | { op: "create_workspace"; name: string; description?: string }
  | {
      op: "create_thread";
      workspace: string;
      title: string;
      summary?: string;
      owner?: string;
    }
  | { op: "file_meeting"; id: string; thread: string }
  | { op: "route"; route: string; message: string };

export type LiveTurn = { say: string; ops: LiveOp[] };

type Handlers = {
  onLine: (l: TalkLine) => void;
  onState: (s: "idle" | "connecting" | "live" | "thinking") => void;
  snapshot: () => string;
  applyOps: (ops: LiveOp[]) => Promise<string[]>; // returns activity lines
  runtime: (route: string, message: string) => Promise<string | null>;
  onMuted?: (m: boolean) => void;
};

export class LiveSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private unlisten: (() => void) | null = null;
  private id = "";
  private you = "";
  private za3tar = "";
  private history: { role: "you" | "za3tar"; text: string }[] = [];
  private lastInputAt = 0;
  private busy = false;
  private seen = new Set<string>();
  private closed = false;

  constructor(private h: Handlers) {}

  get sessionId() {
    return this.id;
  }

  private muted = false;
  get isMuted() {
    return this.muted;
  }

  /** mute = the mic track sends silence; the session stays up */
  setMuted(m: boolean) {
    this.muted = m;
    for (const t of this.stream?.getAudioTracks() ?? []) t.enabled = !m;
    this.h.onLine({ role: "status", text: m ? "muted" : "listening" });
    this.h.onMuted?.(m);
  }

  async start(instructions: string) {
    this.h.onState("connecting");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const pc = new RTCPeerConnection();
    this.pc = pc;
    this.audio = new Audio();
    this.audio.autoplay = true;
    pc.ontrack = (e) => {
      if (this.audio) this.audio.srcObject = e.streams[0];
    };
    for (const t of this.stream.getTracks()) pc.addTrack(t, this.stream);
    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;
    dc.onmessage = (e) => this.onDc(e.data);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await new Promise<void>((res) => {
      if (pc.iceGatheringState === "complete") return res();
      const t = setTimeout(res, 1500);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(t);
          res();
        }
      };
    });
    const r = await invoke<{
      session: { id: string };
      transport: { sdp: string };
    }>("live_session_create", {
      sdp: pc.localDescription!.sdp,
      instructions,
    });
    this.id = r.session.id;
    await pc.setRemoteDescription({ type: "answer", sdp: r.transport.sdp });
    this.unlisten = await listen<any>("live-event", (e) =>
      this.onSideband(e.payload),
    );
    await invoke("live_attach", { sessionId: this.id });
    this.h.onState("live");
    this.h.onLine({ role: "status", text: "listening" });
  }

  private onDc(raw: string) {
    let x: any;
    try {
      x = JSON.parse(raw);
    } catch {
      return;
    }
    // transcripts arrive on the sideband too; take them from one place only
    if (x.type === "error")
      this.h.onLine({ role: "error", text: x.error?.message ?? "voice error" });
    else if (x.type === "session.closed") this.stop();
  }

  private onSideband(e: any) {
    if (!e || this.closed) return;
    if (e.type === "session.input_transcript.delta") this.pushYou(e.delta);
    else if (e.type === "session.output_transcript.delta")
      this.pushZa3tar(e.delta);
    else if (
      e.type === "session.delegation.created" &&
      e.delegation?.target === "client"
    ) {
      const id: string = e.delegation.id;
      if (this.seen.has(id)) return;
      this.seen.add(id);
      const settle = () => {
        if (this.closed) return;
        if (Date.now() - this.lastInputAt < 900)
          return void setTimeout(settle, 250);
        if (this.busy) {
          this.send(id, "one thing at a time — still on the last one.");
          return;
        }
        this.run(id);
      };
      setTimeout(settle, 900);
    } else if (e.type === "error")
      this.h.onLine({ role: "error", text: e.error?.message ?? "voice error" });
  }

  private pushYou(delta: string) {
    this.lastInputAt = Date.now();
    this.you += delta;
    this.za3tar = "";
    this.h.onLine({ role: "you", text: this.you });
    const last = this.history[this.history.length - 1];
    if (last?.role === "you") last.text += delta;
    else this.history.push({ role: "you", text: delta });
  }

  private pushZa3tar(delta: string) {
    this.za3tar += delta;
    this.you = "";
    this.h.onLine({ role: "za3tar", text: this.za3tar });
    const last = this.history[this.history.length - 1];
    if (last?.role === "za3tar") last.text += delta;
    else this.history.push({ role: "za3tar", text: delta });
  }

  private async run(delegationId: string) {
    const transcript = this.history
      .slice(-12)
      .map((h) => `${h.role === "you" ? "User" : "Za3tar"}: ${h.text.trim()}`)
      .join("\n");
    if (!transcript.trim()) return;
    this.busy = true;
    this.h.onState("thinking");
    try {
      const turn = await invoke<LiveTurn>("live_turn", {
        snapshot: this.h.snapshot(),
        transcript,
      });
      let say = turn.say?.trim() || "";
      const ops = Array.isArray(turn.ops) ? turn.ops : [];
      const runtimeOps = ops.filter((o) => o.op === "route") as Extract<
        LiveOp,
        { op: "route" }
      >[];
      const local = ops.filter((o) => o.op !== "route");
      if (local.length) {
        const lines = await this.h.applyOps(local);
        for (const l of lines) this.h.onLine({ role: "activity", text: l });
      }
      for (const r of runtimeOps) {
        this.h.onLine({ role: "activity", text: `handing to ${r.route}: ${r.message}` });
        const reply = await this.h.runtime(r.route, r.message);
        if (reply) say = `${say} ${reply}`.trim();
      }
      if (!say) say = "done.";
      await this.send(delegationId, say);
    } catch (e) {
      this.h.onLine({ role: "error", text: String(e) });
      await this.send(
        delegationId,
        "something went wrong on my side; try that again.",
      );
    } finally {
      this.busy = false;
      if (!this.closed) this.h.onState("live");
    }
  }

  private async send(delegationId: string, content: string) {
    try {
      await invoke("live_send", {
        sessionId: this.id,
        eventType: "session.commentary.append",
        delegationId,
        content: content.slice(0, 1600),
      });
    } catch (e) {
      this.h.onLine({ role: "error", text: String(e) });
    }
  }

  /** nudge the voice with something to say, outside a delegation */
  async prompt(content: string) {
    try {
      this.dc?.send(
        JSON.stringify({
          type: "session.instructions.append",
          event_id: crypto.randomUUID(),
          delegation_id: null,
          content,
        }),
      );
    } catch {
      /* best-effort */
    }
  }

  async stop() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.dc?.send(JSON.stringify({ type: "session.close" }));
    } catch {
      /* fine */
    }
    this.unlisten?.();
    this.pc?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.audio) this.audio.srcObject = null;
    try {
      await invoke("live_detach", { sessionId: this.id });
    } catch {
      /* fine */
    }
    this.h.onState("idle");
    this.h.onLine({ role: "status", text: "ended" });
  }
}
