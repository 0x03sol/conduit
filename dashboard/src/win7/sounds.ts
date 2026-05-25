"use client";

let _ctx: AudioContext | null = null;
let _muted = false;

function ctx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!_ctx) {
        const Ctor = window.AudioContext ??
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        _ctx = new Ctor();
    }
    return _ctx;
}

export function setMuted(v: boolean): void { _muted = v; }
export function isMuted(): boolean { return _muted; }

interface ToneOpts {
    freq: number;
    duration: number;
    type?: OscillatorType;
    attack?: number;
    release?: number;
    gain?: number;
    delay?: number;
}

function tone(o: ToneOpts): void {
    if (_muted) return;
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.freq, t0);
    const peak = (o.gain ?? 0.10);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + (o.attack ?? 0.005));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration + (o.release ?? 0.05));
    osc.connect(env).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + o.duration + (o.release ?? 0.05) + 0.05);
}

/** Soft 2-note "open" — when a window opens. */
export function ding(): void {
    tone({ freq: 988, duration: 0.06, type: "sine", gain: 0.08 });
    tone({ freq: 1318, duration: 0.10, type: "sine", gain: 0.06, delay: 0.04 });
}

/** Win7-flavoured ascending chord — boot / login. */
export function chime(): void {
    tone({ freq: 440, duration: 0.20, type: "sine", gain: 0.07 });
    tone({ freq: 554, duration: 0.20, type: "sine", gain: 0.07, delay: 0.10 });
    tone({ freq: 659, duration: 0.20, type: "sine", gain: 0.07, delay: 0.20 });
    tone({ freq: 880, duration: 0.30, type: "sine", gain: 0.10, delay: 0.30 });
}

/** Three-note descending — error chord. */
export function chord(): void {
    tone({ freq: 392, duration: 0.18, type: "triangle", gain: 0.10 });
    tone({ freq: 311, duration: 0.18, type: "triangle", gain: 0.08, delay: 0.06 });
    tone({ freq: 233, duration: 0.22, type: "triangle", gain: 0.08, delay: 0.12 });
}

/** Cascade — used on tx settled / win. */
export function tada(): void {
    tone({ freq: 587, duration: 0.10, type: "triangle", gain: 0.10 });
    tone({ freq: 698, duration: 0.10, type: "triangle", gain: 0.10, delay: 0.10 });
    tone({ freq: 880, duration: 0.10, type: "triangle", gain: 0.10, delay: 0.20 });
    tone({ freq: 1175, duration: 0.30, type: "sine", gain: 0.14, delay: 0.30 });
    tone({ freq: 1567, duration: 0.30, type: "sine", gain: 0.10, delay: 0.30 });
}
