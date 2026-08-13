import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomState, RoomConfig, ClientMessage, ServerMessage } from 'shared/types';
import { PROTOCOL_VERSION } from 'shared/constants';

export type CreateRoomConfig = Partial<RoomConfig>;

function getWsUrl(): string {
  if (typeof window === 'undefined') return '';
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl?.trim()) {
    const u = envUrl.trim();
    if (u.startsWith('ws://') || u.startsWith('wss://')) return u;
    return (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + u.replace(/^https?:\/\//, '');
  }
  return (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.hostname + ':3001';
}
const WS_URL = getWsUrl();

export interface UseGameSocketResult {
  state: RoomState | null;
  playerId: string | null;
  roomCode: string | null;
  error: string | null;
  connected: boolean;
  /** True when the server is running a different build than this client. */
  staleServer: boolean;
  /** True while trying to take back a seat held after a dropped connection. */
  rejoining: boolean;
  createRoom: (playerName: string, config?: CreateRoomConfig) => void;
  joinRoom: (roomCode: string, playerName: string) => void;
  startGame: () => void;
  sendAction: (action: { type: 'fold' | 'check' | 'call' | 'raise' | 'all_in'; amount?: number }) => void;
  leaveRoom: () => void;
  clearError: () => void;
  sendFieldGoalAttempt: (success: boolean) => void;
  sendRebuyYes: () => void;
  sendRebuyNo: () => void;
  sendRequestRebuy: () => void;
  sendPloVoteStart: () => void;
  sendPloVoteYes: () => void;
  sendPloVoteNo: () => void;
  sendTestScenario: (scenarioId: string | null) => void;
  approveJoin: (targetPlayerId: string) => void;
  denyJoin: (targetPlayerId: string) => void;
  sendShowCards: () => void;
  startKickVote: (targetPlayerId: string) => void;
  sendKickVote: (agree: boolean) => void;
  requestPeek: (targetPlayerId: string) => void;
  answerPeek: (viewerId: string, allow: boolean) => void;
}

/** Enough to take a held seat back after a dropped connection. */
interface SavedSession {
  roomCode: string;
  playerId: string;
}

const SESSION_KEY = 'poker.session';

function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedSession) : null;
    return parsed?.roomCode && parsed?.playerId ? parsed : null;
  } catch {
    return null;
  }
}

function saveSession(session: SavedSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private browsing, or storage full: reconnecting just will not be offered */
  }
}

export function useGameSocket(): UseGameSocketResult {
  const [state, setState] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [staleServer, setStaleServer] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const createRoom = useCallback(
    (playerName: string, config?: CreateRoomConfig) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'create_room', playerName, config });
      }
    },
    [send]
  );

  const joinRoom = useCallback(
    (code: string, playerName: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'join_room', roomCode: code.trim().toUpperCase(), playerName });
      }
    },
    [send]
  );

  const startGame = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      send({ type: 'start_game' });
    }
  }, [send]);

  const sendAction = useCallback(
    (action: { type: 'fold' | 'check' | 'call' | 'raise' | 'all_in'; amount?: number }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'action', action });
      }
    },
    [send]
  );

  const leaveRoom = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      send({ type: 'leave_room' });
    }
    // Leaving on purpose gives the seat up, so there is nothing to come back to.
    saveSession(null);
    setState(null);
    setPlayerId(null);
    setRoomCode(null);
    setError(null);
  }, [send]);

  const sendFieldGoalAttempt = useCallback(
    (success: boolean) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'field_goal_attempt', fieldGoalSuccess: success });
      }
    },
    [send]
  );

  const sendRebuyYes = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) send({ type: 'rebuy_yes' });
  }, [send]);

  const sendRebuyNo = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) send({ type: 'rebuy_no' });
  }, [send]);

  const sendRequestRebuy = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) send({ type: 'request_rebuy' });
  }, [send]);

  const sendPloVoteStart = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) send({ type: 'plo_vote_start' });
  }, [send]);

  const sendPloVoteYes = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) send({ type: 'plo_vote_yes' });
  }, [send]);

  const sendPloVoteNo = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) send({ type: 'plo_vote_no' });
  }, [send]);

  const sendTestScenario = useCallback(
    (scenarioId: string | null) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'set_test_scenario', testScenario: scenarioId });
      }
    },
    [send]
  );

  const approveJoin = useCallback(
    (targetPlayerId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) send({ type: 'approve_join', targetPlayerId });
    },
    [send]
  );

  const denyJoin = useCallback(
    (targetPlayerId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) send({ type: 'deny_join', targetPlayerId });
    },
    [send]
  );

  const sendShowCards = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) send({ type: 'show_cards' });
  }, [send]);

  const startKickVote = useCallback(
    (targetPlayerId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) send({ type: 'kick_vote_start', targetPlayerId });
    },
    [send]
  );

  const sendKickVote = useCallback(
    (agree: boolean) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send({ type: agree ? 'kick_vote_yes' : 'kick_vote_no' });
      }
    },
    [send]
  );

  const requestPeek = useCallback(
    (targetPlayerId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) send({ type: 'peek_request', targetPlayerId });
    },
    [send]
  );

  const answerPeek = useCallback(
    (viewerId: string, allow: boolean) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send({ type: allow ? 'peek_allow' : 'peek_decline', targetPlayerId: viewerId });
      }
    },
    [send]
  );

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    /**
     * Connect, and keep trying if the socket drops. Phones close sockets all
     * the time — backgrounding the browser is enough — so a drop reconnects and
     * takes the seat back rather than dumping the player into the lobby.
     */
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        // If a seat is being held for us, take it back.
        const saved = loadSession();
        if (saved) {
          setRejoining(true);
          ws.send(
            JSON.stringify({ type: 'rejoin_room', roomCode: saved.roomCode, playerId: saved.playerId })
          );
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        // The table stays on screen while reconnecting, so a blip does not look
        // like being thrown out of the game.
        const delay = Math.min(5000, 400 * 2 ** attempt);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
      ws.onerror = () => {
        /* the close handler drives the retry */
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as ServerMessage & { state?: RoomState; playerId?: string; roomCode?: string };
          // A server built before this client will not stamp a matching version.
          // Flag it rather than letting the mismatch show up as missing buttons
          // and NaN amounts.
          if (data.type !== 'error') {
            setStaleServer(data.protocolVersion !== PROTOCOL_VERSION);
          }
          if (
            (data.type === 'room_created' || data.type === 'room_joined') &&
            data.state != null
          ) {
            setState(data.state);
            setPlayerId(data.playerId ?? null);
            setRoomCode(data.roomCode ?? null);
            setError(null);
            setRejoining(false);
            // Remember the seat so a dropped connection can pick it back up.
            if (data.roomCode && data.playerId) {
              saveSession({ roomCode: data.roomCode, playerId: data.playerId });
            }
          } else if (data.type === 'room_state' && data.state != null) {
            setState(data.state);
          } else if (data.type === 'game_started' && data.state != null) {
            setState(data.state);
            setError(null);
          } else if (data.type === 'error' && data.error) {
            // A seat that could not be reclaimed is not worth reporting: it just
            // means the hold lapsed, so fall back to the normal lobby.
            if (data.error.includes('no longer being held')) {
              saveSession(null);
              setRejoining(false);
            } else {
              setError(data.error);
            }
          }
        } catch {
          setError('Invalid message');
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return {
    state,
    playerId,
    roomCode,
    error,
    connected,
    staleServer,
    rejoining,
    createRoom,
    joinRoom,
    startGame,
    sendAction,
    leaveRoom,
    clearError,
    sendFieldGoalAttempt,
    sendRebuyYes,
    sendRebuyNo,
    sendRequestRebuy,
    sendPloVoteStart,
    sendPloVoteYes,
    sendPloVoteNo,
    sendTestScenario,
    approveJoin,
    denyJoin,
    sendShowCards,
    startKickVote,
    sendKickVote,
    requestPeek,
    answerPeek,
  };
}
