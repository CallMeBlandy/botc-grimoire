import { useEffect, useRef, useState, useCallback } from "react";
import type { GameState, HostAction } from "./types";

type AttachMsg =
  | { type: "host:attach"; roomId: string; hostToken: string }
  | { type: "player:attach"; roomId: string; name?: string; playerToken?: string | null };

interface Options {
  attach: AttachMsg;
  onIdentity?: (msg: { playerToken: string; seatId: string }) => void;
}

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

export function useGame({ attach, onIdentity }: Options) {
  const [state, setState] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const attachRef = useRef(attach);
  attachRef.current = attach;
  const identityRef = useRef(onIdentity);
  identityRef.current = onIdentity;
  const closedByUs = useRef(false);
  const retry = useRef(0);

  const connect = useCallback(() => {
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      retry.current = 0;
      setConnected(true);
      setError(null);
      ws.send(JSON.stringify(attachRef.current));
    };

    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "state") setState(msg.state);
      else if (msg.type === "identity") identityRef.current?.(msg);
      else if (msg.type === "error") setError(msg.message);
    };

    ws.onclose = () => {
      setConnected(false);
      if (closedByUs.current) return;
      // Exponential-ish backoff, capped.
      retry.current = Math.min(retry.current + 1, 6);
      const delay = Math.min(500 * 2 ** retry.current, 8000);
      setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    closedByUs.current = false;
    connect();
    return () => {
      closedByUs.current = true;
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendHostAction = useCallback((action: HostAction) => {
    wsRef.current?.send(JSON.stringify({ type: "host:action", action }));
  }, []);

  const sendVote = useCallback((vote: boolean) => {
    wsRef.current?.send(JSON.stringify({ type: "player:vote", vote }));
  }, []);

  const sendPromptResponse = useCallback(
    (response: { seatIds?: string[]; value?: boolean | null }) => {
      wsRef.current?.send(JSON.stringify({ type: "player:promptResponse", response }));
    },
    [],
  );

  return { state, connected, error, sendHostAction, sendVote, sendPromptResponse };
}
