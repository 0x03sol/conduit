"use client";

import { create } from "zustand";

import { ding } from "./sounds";

export interface WindowBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface WindowState {
    id: string;
    appId: string;
    title: string;
    bounds: WindowBounds;
    zIndex: number;
    minimized: boolean;
    maximized: boolean;
    prevBounds?: WindowBounds;
}

interface DesktopStore {
    windows: WindowState[];
    activeId: string | null;
    topZ: number;
    startMenuOpen: boolean;
    /** Deep-link target consumed by ArcscanApp on next open / focus. */
    arcscanTargetUrl: string | null;

    openApp: (appId: string, opts?: { title?: string; bounds?: Partial<WindowBounds> }) => void;
    close: (id: string) => void;
    focus: (id: string) => void;
    minimize: (id: string) => void;
    minimizeAll: () => void;
    toggleMaximize: (id: string) => void;
    setBounds: (id: string, bounds: WindowBounds) => void;
    toggleStartMenu: () => void;
    closeStartMenu: () => void;
    setArcscanTarget: (url: string | null) => void;
}

const CASCADE = 28;
const DEFAULT_SIZE = { width: 720, height: 480 };

let _id = 0;
const nextId = () => `w${++_id}`;

export const useDesktop = create<DesktopStore>((set) => ({
    windows: [],
    activeId: null,
    topZ: 100,
    startMenuOpen: false,
    arcscanTargetUrl: null,

    openApp: (appId, opts) => {
        let opened = false;
        set((s) => {
            const existing = s.windows.find((w) => w.appId === appId);
            if (existing) {
                return {
                    windows: s.windows.map((w) =>
                        w.id === existing.id
                            ? { ...w, minimized: false, zIndex: s.topZ + 1 }
                            : w),
                    activeId: existing.id,
                    topZ: s.topZ + 1,
                    startMenuOpen: false,
                };
            }
            opened = true;
            const cascade = s.windows.length;
            const fallback: WindowBounds = {
                x: 60 + cascade * CASCADE,
                y: 50 + cascade * CASCADE,
                ...DEFAULT_SIZE,
            };
            const w: WindowState = {
                id: nextId(),
                appId,
                title: opts?.title ?? appId,
                bounds: { ...fallback, ...(opts?.bounds ?? {}) },
                zIndex: s.topZ + 1,
                minimized: false,
                maximized: false,
            };
            return {
                windows: [...s.windows, w],
                activeId: w.id,
                topZ: s.topZ + 1,
                startMenuOpen: false,
            };
        });
        if (opened) ding();
    },

    close: (id) =>
        set((s) => {
            const next = s.windows.filter((w) => w.id !== id);
            return {
                windows: next,
                activeId: s.activeId === id ? (next.at(-1)?.id ?? null) : s.activeId,
            };
        }),

    focus: (id) =>
        set((s) => ({
            windows: s.windows.map((w) =>
                w.id === id ? { ...w, zIndex: s.topZ + 1, minimized: false } : w),
            activeId: id,
            topZ: s.topZ + 1,
        })),

    minimize: (id) =>
        set((s) => ({
            windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
            activeId: s.activeId === id ? null : s.activeId,
        })),

    minimizeAll: () =>
        set((s) => ({
            windows: s.windows.map((w) => ({ ...w, minimized: true })),
            activeId: null,
        })),

    toggleMaximize: (id) =>
        set((s) => ({
            windows: s.windows.map((w) => {
                if (w.id !== id) return w;
                if (w.maximized) {
                    return { ...w, maximized: false, bounds: w.prevBounds ?? w.bounds };
                }
                if (typeof window === "undefined") return w;
                return {
                    ...w,
                    maximized: true,
                    prevBounds: w.bounds,
                    bounds: {
                        x: 0,
                        y: 0,
                        width: window.innerWidth,
                        height: window.innerHeight - 40,
                    },
                };
            }),
        })),

    setBounds: (id, bounds) =>
        set((s) => ({
            windows: s.windows.map((w) => (w.id === id ? { ...w, bounds } : w)),
        })),

    toggleStartMenu: () => set((s) => ({ startMenuOpen: !s.startMenuOpen })),
    closeStartMenu: () => set({ startMenuOpen: false }),
    setArcscanTarget: (url) => set({ arcscanTargetUrl: url }),
}));
