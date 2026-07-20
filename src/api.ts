import type { Edition, Role } from "./types";

export async function fetchRoles(): Promise<Role[]> {
  const res = await fetch("/api/roles");
  if (!res.ok) throw new Error("Failed to load character data");
  return res.json();
}

export async function createRoom(
  edition: Edition,
): Promise<{ roomId: string; code: string; hostToken: string }> {
  const res = await fetch("/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ edition }),
  });
  if (!res.ok) throw new Error("Failed to create room");
  return res.json();
}

export async function resolveCode(
  code: string,
): Promise<{ roomId: string; code: string; edition: Edition }> {
  const res = await fetch(`/api/room/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error("Room not found — check the code");
  return res.json();
}

export async function fetchQr(text: string): Promise<string> {
  const res = await fetch(`/api/qr?text=${encodeURIComponent(text)}`);
  if (!res.ok) throw new Error("QR failed");
  return (await res.json()).dataUrl;
}

export async function fetchNet(): Promise<{ ips: string[]; port: number }> {
  const res = await fetch("/api/net");
  if (!res.ok) return { ips: [], port: 3000 };
  return res.json();
}

// --- Local credential storage --------------------------------------------
const HOST_KEY = "botc.host";

export interface HostCreds {
  roomId: string;
  code: string;
  hostToken: string;
}

export function saveHostCreds(c: HostCreds) {
  localStorage.setItem(HOST_KEY, JSON.stringify(c));
}
export function loadHostCreds(): HostCreds | null {
  const raw = localStorage.getItem(HOST_KEY);
  return raw ? JSON.parse(raw) : null;
}
export function clearHostCreds() {
  localStorage.removeItem(HOST_KEY);
}

const playerKey = (roomId: string) => `botc.player.${roomId}`;
export function savePlayerToken(roomId: string, tokenValue: string) {
  localStorage.setItem(playerKey(roomId), tokenValue);
}
export function loadPlayerToken(roomId: string): string | null {
  return localStorage.getItem(playerKey(roomId));
}
