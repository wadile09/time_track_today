"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";

// ─── Utility: generate unique player ID ───
function getPlayerId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("ttt-player-id");
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    localStorage.setItem("ttt-player-id", id);
  }
  return id;
}

// ─── Types ───
interface GameState {
  board: (string | null)[];
  currentTurn: "X" | "O";
  winner: string | null;
  winningLine: number[] | null;
  isDraw: boolean;
  players: { X: boolean; O: boolean };
  scores: { X: number; O: number; draws: number };
}

// ─── API helpers ───
async function apiCall(body: Record<string, unknown>) {
  const res = await fetch("/api/tictactoe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── Animated X Component ───
function AnimatedX({ size = 60 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" className="ttt-symbol ttt-x">
      <line x1="12" y1="12" x2="48" y2="48" stroke="url(#xGrad)" strokeWidth="5" strokeLinecap="round" className="ttt-x-line" />
      <line x1="48" y1="12" x2="12" y2="48" stroke="url(#xGrad)" strokeWidth="5" strokeLinecap="round" className="ttt-x-line" />
      <defs>
        <linearGradient id="xGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Animated O Component ───
function AnimatedO({ size = 60 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" className="ttt-symbol ttt-o">
      <circle cx="30" cy="30" r="20" fill="none" stroke="url(#oGrad)" strokeWidth="5" strokeLinecap="round" className="ttt-o-circle" />
      <defs>
        <linearGradient id="oGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Cell Component ───
function Cell({
  value,
  index,
  onClick,
  isWinning,
  disabled,
}: {
  value: string | null;
  index: number;
  onClick: (i: number) => void;
  isWinning: boolean;
  disabled: boolean;
}) {
  return (
    <button
      id={`ttt-cell-${index}`}
      className={`ttt-cell ${isWinning ? "ttt-cell-winning" : ""} ${disabled ? "ttt-cell-disabled" : ""}`}
      onClick={() => onClick(index)}
      disabled={disabled || !!value}
      aria-label={`Cell ${index + 1}, ${value || "empty"}`}
    >
      {value === "X" && <AnimatedX />}
      {value === "O" && <AnimatedO />}
      {!value && !disabled && <span className="ttt-cell-hover-hint" />}
    </button>
  );
}

// ─── Scoreboard ───
function Scoreboard({
  scores,
  mySymbol,
}: {
  scores: { X: number; O: number; draws: number };
  mySymbol: string;
}) {
  return (
    <div className="ttt-scoreboard">
      <div className={`ttt-score-item ${mySymbol === "X" ? "ttt-score-you" : ""}`}>
        <span className="ttt-score-label">
          <span className="ttt-score-dot ttt-dot-x" />
          X {mySymbol === "X" ? "(You)" : "(Rival)"}
        </span>
        <span className="ttt-score-value">{scores.X}</span>
      </div>
      <div className="ttt-score-item ttt-score-draw">
        <span className="ttt-score-label">Draws</span>
        <span className="ttt-score-value">{scores.draws}</span>
      </div>
      <div className={`ttt-score-item ${mySymbol === "O" ? "ttt-score-you" : ""}`}>
        <span className="ttt-score-label">
          <span className="ttt-score-dot ttt-dot-o" />
          O {mySymbol === "O" ? "(You)" : "(Rival)"}
        </span>
        <span className="ttt-score-value">{scores.O}</span>
      </div>
    </div>
  );
}

// ─── Floating particles background ───
function GameParticles() {
  return (
    <div className="ttt-particles" aria-hidden>
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="ttt-particle"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 8}s`,
            animationDuration: `${6 + Math.random() * 10}s`,
            width: `${2 + Math.random() * 4}px`,
            height: `${2 + Math.random() * 4}px`,
          }}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════
export default function TicTacToePage() {
  const [phase, setPhase] = useState<"lobby" | "waiting" | "playing">("lobby");
  const [roomId, setRoomId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [mySymbol, setMySymbol] = useState<"X" | "O">("X");
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [playerId] = useState(getPlayerId);
  const [copyTooltip, setCopyTooltip] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Restore from session storage ───
  useEffect(() => {
    const savedRoomId = sessionStorage.getItem("ttt-room-id");
    const savedSymbol = sessionStorage.getItem("ttt-my-symbol") as "X" | "O" | null;
    const savedPhase = sessionStorage.getItem("ttt-phase") as "waiting" | "playing" | null;
    
    if (savedRoomId && savedSymbol && savedPhase) {
      setRoomId(savedRoomId);
      setMySymbol(savedSymbol);
      setPhase(savedPhase);
    }
  }, []);

  // ─── Persist to session storage ───
  useEffect(() => {
    if (roomId && phase !== "lobby") {
      sessionStorage.setItem("ttt-room-id", roomId);
      sessionStorage.setItem("ttt-my-symbol", mySymbol);
      sessionStorage.setItem("ttt-phase", phase);
    }
  }, [roomId, mySymbol, phase]);

  // ─── Polling for game state ───
  const pollState = useCallback(
    async (rid: string) => {
      try {
        const data = await apiCall({ action: "state", roomId: rid, playerId });
        if (data.success) {
          setGame(data);
          // If second player joined, move to playing
          if (data.players.X && data.players.O) {
            setPhase("playing");
          }
        } else if (data.error === "Room not found") {
          // If room was cleared from memory (e.g., serverless function cold start), end game
          setPhase("lobby");
          setRoomId("");
          setJoinCode("");
          setGame(null);
          setError("Room session expired. Please create a new room.");
          sessionStorage.removeItem("ttt-room-id");
          sessionStorage.removeItem("ttt-my-symbol");
          sessionStorage.removeItem("ttt-phase");
        }
      } catch {
        // Silent poll failure
      }
    },
    [playerId]
  );

  useEffect(() => {
    if ((phase === "waiting" || phase === "playing") && roomId) {
      pollingRef.current = setInterval(() => pollState(roomId), 800);
      return () => {
        if (pollingRef.current) clearInterval(pollingRef.current);
      };
    }
  }, [phase, roomId, pollState]);

  // ─── Create room ───
  const handleCreate = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiCall({ action: "create", playerId });
      if (data.success) {
        setRoomId(data.roomId);
        setMySymbol(data.symbol);
        setPhase("waiting");
        pollState(data.roomId);
      }
    } catch {
      setError("Failed to create room. Please try again.");
    }
    setLoading(false);
  };

  // ─── Join room ───
  const handleJoin = async () => {
    if (!joinCode.trim()) {
      setError("Enter a room code");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiCall({ action: "join", roomId: joinCode.trim(), playerId });
      if (data.success) {
        setRoomId(data.roomId);
        setMySymbol(data.symbol);
        setPhase("playing");
        pollState(data.roomId);
      } else {
        setError(data.error || "Failed to join room");
      }
    } catch {
      setError("Failed to join room. Please try again.");
    }
    setLoading(false);
  };

  // ─── Make move ───
  const handleMove = async (position: number) => {
    if (!game || game.winner || game.isDraw) return;
    if (game.currentTurn !== mySymbol) return;
    if (game.board[position]) return;
    // Optimistic update
    const newBoard = [...game.board];
    newBoard[position] = mySymbol;
    setGame((prev) => (prev ? { ...prev, board: newBoard } : prev));
    try {
      const data = await apiCall({ action: "move", roomId, playerId, position });
      if (!data.success) {
        // Revert optimistic update
        pollState(roomId);
      }
    } catch {
      pollState(roomId);
    }
  };

  // ─── Restart ───
  const handleRestart = async () => {
    try {
      await apiCall({ action: "restart", roomId, playerId });
      pollState(roomId);
    } catch {
      // ignore
    }
  };

  // ─── Copy room code ───
  const handleCopy = () => {
    navigator.clipboard.writeText(roomId);
    setCopyTooltip(true);
    setTimeout(() => setCopyTooltip(false), 1500);
  };

  // ─── Leave room ───
  const handleLeave = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setPhase("lobby");
    setRoomId("");
    setJoinCode("");
    setGame(null);
    setError("");
    sessionStorage.removeItem("ttt-room-id");
    sessionStorage.removeItem("ttt-my-symbol");
    sessionStorage.removeItem("ttt-phase");
  };

  // ─── Derived state ───
  const isMyTurn = game?.currentTurn === mySymbol;
  const gameOver = !!(game?.winner || game?.isDraw);
  const iWon = game?.winner === mySymbol;
  const iLost = game?.winner && game.winner !== mySymbol;
  const waitingForOpponent = phase === "waiting" || (phase === "playing" && game && (!game.players.X || !game.players.O));

  // Status message
  let statusMessage = "";
  if (game) {
    if (game.winner) {
      statusMessage = iWon ? "🎉 You Won!" : "😔 You Lost!";
    } else if (game.isDraw) {
      statusMessage = "🤝 It's a Draw!";
    } else if (waitingForOpponent) {
      statusMessage = "Waiting for opponent...";
    } else if (isMyTurn) {
      statusMessage = "Your turn";
    } else {
      statusMessage = "Opponent's turn...";
    }
  }

  return (
    <main className="ttt-main">
      <GameParticles />

      {/* Header */}
      <div className="ttt-header">
        <h1 className="ttt-title">
          <span className="ttt-title-tic">Tic</span>
          <span className="ttt-title-tac">Tac</span>
          <span className="ttt-title-toe">Toe</span>
        </h1>
        <p className="ttt-subtitle">Multiplayer Battle Arena</p>
      </div>

      {/* ─── LOBBY ─── */}
      {phase === "lobby" && (
        <div className="ttt-lobby animate-fade-in">
          <div className="ttt-lobby-card ttt-card-create">
            <div className="ttt-card-icon">🎮</div>
            <h2 className="ttt-card-title">Create Room</h2>
            <p className="ttt-card-desc">Start a new game and invite a friend</p>
            <button
              id="ttt-create-btn"
              className="ttt-btn ttt-btn-primary"
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? (
                <span className="ttt-spinner" />
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Create Room
                </>
              )}
            </button>
          </div>

          <div className="ttt-lobby-divider">
            <span>OR</span>
          </div>

          <div className="ttt-lobby-card ttt-card-join">
            <div className="ttt-card-icon">🚪</div>
            <h2 className="ttt-card-title">Join Room</h2>
            <p className="ttt-card-desc">Enter a room code to join a game</p>
            <div className="ttt-join-input-group">
              <input
                id="ttt-join-input"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                maxLength={6}
                className="ttt-input"
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              />
              <button
                id="ttt-join-btn"
                className="ttt-btn ttt-btn-secondary"
                onClick={handleJoin}
                disabled={loading}
              >
                {loading ? <span className="ttt-spinner" /> : "Join"}
              </button>
            </div>
          </div>

          {error && (
            <div className="ttt-error animate-shake">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {error}
            </div>
          )}
        </div>
      )}

      {/* ─── WAITING ROOM ─── */}
      {phase === "waiting" && (
        <div className="ttt-waiting animate-fade-in">
          <div className="ttt-waiting-card">
            <div className="ttt-waiting-pulse">
              <div className="ttt-pulse-ring" />
              <div className="ttt-pulse-ring ttt-pulse-ring-2" />
              <div className="ttt-pulse-core">⏳</div>
            </div>
            <h2 className="ttt-waiting-title">Waiting for Opponent</h2>
            <p className="ttt-waiting-desc">Share this room code with a friend:</p>
            <div className="ttt-room-code-container">
              <button className="ttt-room-code" onClick={handleCopy} title="Click to copy">
                {roomId.split("").map((char, i) => (
                  <span key={i} className="ttt-code-char" style={{ animationDelay: `${i * 0.08}s` }}>
                    {char}
                  </span>
                ))}
              </button>
              {copyTooltip && <span className="ttt-copy-tooltip">Copied!</span>}
            </div>
            <p className="ttt-waiting-hint">Click the code to copy it</p>
            <div className="ttt-you-play-as">
              You play as <span className="ttt-symbol-badge ttt-badge-x">X</span>
            </div>
            <button className="ttt-btn ttt-btn-ghost" onClick={handleLeave}>
              ← Back to Lobby
            </button>
          </div>
        </div>
      )}

      {/* ─── GAME BOARD ─── */}
      {phase === "playing" && game && (
        <div className="ttt-game animate-fade-in">
          {/* Room info bar */}
          <div className="ttt-game-bar">
            <div className="ttt-game-room-info">
              Room: <span className="ttt-room-badge">{roomId}</span>
            </div>
            <div className="ttt-game-symbol-info">
              You: <span className={`ttt-symbol-badge ${mySymbol === "X" ? "ttt-badge-x" : "ttt-badge-o"}`}>{mySymbol}</span>
            </div>
          </div>

          {/* Scoreboard */}
          <Scoreboard scores={game.scores} mySymbol={mySymbol} />

          {/* Status */}
          <div className={`ttt-status ${iWon ? "ttt-status-win" : ""} ${iLost ? "ttt-status-lose" : ""} ${game.isDraw ? "ttt-status-draw" : ""} ${isMyTurn && !gameOver ? "ttt-status-myturn" : ""}`}>
            {statusMessage}
          </div>

          {/* Turn indicators */}
          <div className="ttt-turn-indicators">
            <div className={`ttt-turn-indicator ${game.currentTurn === "X" && !gameOver ? "ttt-turn-active" : ""}`}>
              <AnimatedX size={28} />
            </div>
            <div className={`ttt-turn-indicator ${game.currentTurn === "O" && !gameOver ? "ttt-turn-active" : ""}`}>
              <AnimatedO size={28} />
            </div>
          </div>

          {/* Board */}
          <div className={`ttt-board ${gameOver ? "ttt-board-ended" : ""}`}>
            {game.board.map((cell, i) => (
              <Cell
                key={i}
                value={cell}
                index={i}
                onClick={handleMove}
                isWinning={game.winningLine?.includes(i) ?? false}
                disabled={!isMyTurn || gameOver || !!waitingForOpponent}
              />
            ))}
          </div>

          {/* Game over overlay */}
          {gameOver && (
            <div className="ttt-game-over animate-fade-in">
              <button id="ttt-restart-btn" className="ttt-btn ttt-btn-primary ttt-btn-restart" onClick={handleRestart}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Play Again
              </button>
              <button className="ttt-btn ttt-btn-ghost" onClick={handleLeave}>
                Leave Room
              </button>
            </div>
          )}

          {/* Leave button (during game) */}
          {!gameOver && (
            <button className="ttt-btn ttt-btn-ghost ttt-leave-btn" onClick={handleLeave}>
              ← Leave Room
            </button>
          )}
        </div>
      )}
    </main>
  );
}
