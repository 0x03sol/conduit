"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { IconKey } from "../icons";

export interface AppConfig {
    id: string;
    title: string;
    /** Optional override for the desktop icon label. Falls back to `title`.
     *  The label is also `.exe`-stripped at render time. */
    iconLabel?: string;
    icon: IconKey;
    component: ComponentType;
    defaultSize: { width: number; height: number };
    hidden?: boolean;
}

const SenderApp     = dynamic(() => import("./SenderApp").then((m) => m.SenderApp),         { ssr: false });
const OperatorApp   = dynamic(() => import("./OperatorApp").then((m) => m.OperatorApp),     { ssr: false });
const RecipientApp  = dynamic(() => import("./RecipientApp").then((m) => m.RecipientApp),   { ssr: false });
const MyComputerApp = dynamic(() => import("./MyComputerApp").then((m) => m.MyComputerApp), { ssr: false });
const CommandPromptApp = dynamic(() => import("./CommandPromptApp").then((m) => m.CommandPromptApp), { ssr: false });
const NotepadApp    = dynamic(() => import("./NotepadApp").then((m) => m.NotepadApp),       { ssr: false });
const RecycleBinApp = dynamic(() => import("./RecycleBinApp").then((m) => m.RecycleBinApp), { ssr: false });
const ArcscanApp    = dynamic(() => import("./ArcscanApp").then((m) => m.ArcscanApp),       { ssr: false });
const ArcTvApp      = dynamic(() => import("./ArcTvApp").then((m) => m.ArcTvApp),           { ssr: false });

export const APPS: Record<string, AppConfig> = {
    sender:     { id: "sender",     title: "Batch Builder",       icon: "sender",     component: SenderApp,     defaultSize: { width: 760, height: 560 } },
    operator:   { id: "operator",   title: "Settlement Monitor",  icon: "operator",   component: OperatorApp,   defaultSize: { width: 820, height: 460 } },
    recipient:  { id: "recipient",  title: "Inbox",               icon: "recipient",  component: RecipientApp,  defaultSize: { width: 720, height: 480 } },
    myComputer: { id: "myComputer", title: "My Computer",         icon: "myComputer", component: MyComputerApp, defaultSize: { width: 520, height: 400 } },
    cmd:        { id: "cmd",        title: "Command Prompt",      iconLabel: "cmd.exe", icon: "cmd", component: CommandPromptApp, defaultSize: { width: 560, height: 440 } },
    notepad:    { id: "notepad",    title: "How It Works — Notepad", iconLabel: "How It Works", icon: "notepad", component: NotepadApp, defaultSize: { width: 640, height: 540 } },
    recycleBin: { id: "recycleBin", title: "Recycle Bin",         icon: "recycleBin", component: RecycleBinApp, defaultSize: { width: 480, height: 320 } },
    arcscan:    { id: "arcscan",    title: "Arcscan — Internet Explorer", icon: "arcscan", component: ArcscanApp, defaultSize: { width: 600, height: 400 } },
    arcTv:      { id: "arcTv",      title: "Arc TV — Media Player", iconLabel: "Arc TV.exe", icon: "arcTv", component: ArcTvApp, defaultSize: { width: 720, height: 480 } },
};

export const DESKTOP_ICON_ORDER: string[] = [
    "myComputer",
    "sender",
    "operator",
    "recipient",
    "arcscan",
    "arcTv",
    "cmd",
    "notepad",
    "recycleBin",
];
