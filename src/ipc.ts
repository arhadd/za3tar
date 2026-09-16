// One door to the Rust side. Inside the Tauri window this is the real IPC;
// in a plain browser (vite dev, design review) it falls back to an in-memory
// mock with fictional data so every view can be looked at without a Mac
// capture session. The mock is loaded lazily and never ships in the app path.
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  listen as tauriListen,
  type EventCallback,
} from "@tauri-apps/api/event";

export const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (inTauri) return tauriInvoke<T>(cmd, args);
  const { mockInvoke } = await import("./devMock");
  return mockInvoke<T>(cmd, args);
}

export async function listen<T>(
  event: string,
  handler: EventCallback<T>,
): Promise<() => void> {
  if (inTauri) return tauriListen<T>(event, handler);
  const { mockListen } = await import("./devMock");
  return mockListen<T>(event, handler);
}
