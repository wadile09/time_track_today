"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import "./bollywood.css";
import {
  BOLLYWOOD_SUGGESTIONS,
  BollywoodSuggestion,
  ClueItem,
  sanitizeClueText,
} from "./characters";

// ─── Utility: Per-tab Persistent Player ID ───────────────────
function getPlayerId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem("bw-player-id");
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    sessionStorage.setItem("bw-player-id", id);
  }
  return id;
}

// ─── API Helper ─────────────────────────────────────────────
async function apiCall(body: Record<string, unknown>) {
  const res = await fetch("/api/bollywood-guess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── Floating Particles (deterministic for SSR hydration) ───
const PARTICLE_EMOJIS = ["🎬", "⭐", "🎭", "💃", "🕺", "🎵", "🎤", "🌟", "🏆", "🎪"];
const PARTICLE_ITEMS = Array.from({ length: 18 }, (_, i) => ({
  emoji: PARTICLE_EMOJIS[i % PARTICLE_EMOJIS.length],
  left: `${((i * 37 + 13) % 94) + 2}%`,
  top: `${((i * 53 + 19) % 88) + 4}%`,
  animationDelay: `${((i * 1.7) % 10).toFixed(2)}s`,
  animationDuration: `${(8 + ((i * 2.3) % 12)).toFixed(2)}s`,
  fontSize: `${15 + ((i * 3) % 13)}px`,
}));

function Particles() {
  return (
    <div className="bw-particles" aria-hidden>
      {PARTICLE_ITEMS.map((p, i) => (
        <div
          key={i}
          className="bw-particle"
          style={{
            left: p.left,
            top: p.top,
            animationDelay: p.animationDelay,
            animationDuration: p.animationDuration,
            fontSize: p.fontSize,
          }}
        >
          {p.emoji}
        </div>
      ))}
    </div>
  );
}

// ─── Guess Attempt Dots (3 chances) ─────────────────────────
function GuessDots({ guessesLeft, total = 3 }: { guessesLeft: number; total?: number }) {
  return (
    <div className="bw-guess-dots">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`bw-guess-dot ${i < guessesLeft ? "bw-dot-active" : "bw-dot-used"}`}
          title={`Chance ${i + 1}`}
        />
      ))}
    </div>
  );
}

// ─── Question Card (Revealed 1 by 1) ────────────────────────
function QuestionCard({
  index,
  question,
  hint,
  revealed,
  isHost,
  isNextToUnlock,
  onUnlock,
  unlocking,
}: {
  index: number;
  question: string;
  hint: string;
  revealed: boolean;
  isHost: boolean;
  isNextToUnlock: boolean;
  onUnlock?: () => void;
  unlocking?: boolean;
}) {
  // Host can always inspect all clues, with a badge indicating whether guesser unlocked it
  if (isHost) {
    return (
      <div className={`bw-question-card ${revealed ? "bw-q-revealed" : "bw-q-host-hidden"}`}>
        <div className="bw-q-header">
          <span className="bw-q-number">CLUE {index + 1}</span>
          {revealed ? (
            <span className="bw-q-unlocked-badge">👁️ Visible to Guesser</span>
          ) : (
            <span className="bw-q-locked-badge">🔒 Hidden from Guesser</span>
          )}
        </div>
        <div className="bw-q-text">{question}</div>
        <div className="bw-q-hint-box">
          <span className="bw-hint-tag">💡 Funny Hint:</span>
          <span className="bw-hint-content">{hint}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bw-question-card ${revealed
        ? "bw-q-revealed"
        : isNextToUnlock
          ? "bw-q-next-unlock"
          : "bw-q-locked"
        }`}
      onClick={!revealed && isNextToUnlock && !unlocking && onUnlock ? onUnlock : undefined}
      role={!revealed && isNextToUnlock ? "button" : undefined}
      tabIndex={!revealed && isNextToUnlock ? 0 : undefined}
      onKeyDown={(e) => {
        if (!revealed && isNextToUnlock && !unlocking && onUnlock && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onUnlock();
        }
      }}
    >
      <div className="bw-q-header">
        <span className="bw-q-number">CLUE {index + 1}</span>
        {!revealed && (
          <span className="bw-q-locked-badge">
            {isNextToUnlock ? "🔓 Tap to Unlock" : "🔒 Locked"}
          </span>
        )}
      </div>
      <div className="bw-q-text">
        {revealed
          ? question
          : isNextToUnlock
            ? unlocking
              ? "Unlocking clue..."
              : `🔓 Click here to unlock Clue ${index + 1}!`
            : `Locked — unlock Clue ${index} first`}
      </div>
      {revealed && (
        <div className="bw-q-hint-box">
          <span className="bw-hint-tag">💡 Funny Hint:</span>
          <span className="bw-hint-content">{hint}</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════
type GamePhase = "lobby" | "waiting" | "setting" | "playing";
type GameStatus = "waiting" | "setting" | "playing" | "won" | "lost";
type Role = "host" | "guesser";

interface GuessRecord {
  guess: string;
  isCorrect: boolean;
  timestamp: number;
}

interface GameState {
  role: Role;
  status: GameStatus;
  bothJoined: boolean;
  hostName: string;
  guesserName: string;
  character?: string;
  questions: string[];
  currentQuestionIndex: number;
  guessesLeft: number;
  lastGuess: string;
  pendingJudge?: boolean;
  guessHistory: GuessRecord[];
  scores: { host: number; guesser: number };
  totalQuestions: number;
}

export default function BollywoodGuessPage() {
  const [phase, setPhase] = useState<GamePhase>("lobby");
  const [role, setRole] = useState<Role>("host");
  const [roomId, setRoomId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [playerId, setPlayerId] = useState("");
  const [copyTooltip, setCopyTooltip] = useState(false);

  // Host character selection (User only picks character; AI generates all clues!)
  const [selectedChar, setSelectedChar] = useState<BollywoodSuggestion>(BOLLYWOOD_SUGGESTIONS[0]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [customCharName, setCustomCharName] = useState("");
  const [previewClues, setPreviewClues] = useState<ClueItem[]>([]);
  const [previewCharFor, setPreviewCharFor] = useState<string>("");
  const [previewResolvedName, setPreviewResolvedName] = useState<string>("");
  const [previewAliases, setPreviewAliases] = useState<string[]>([]);
  const [clueSource, setClueSource] = useState<string>("");
  const [clueError, setClueError] = useState<string>("");
  const [needsApiKey, setNeedsApiKey] = useState<boolean>(false);
  const [generatingClues, setGeneratingClues] = useState(false);

  // Guesser input
  const [guessInput, setGuessInput] = useState("");
  const [guessFeedback, setGuessFeedback] = useState<null | "correct" | "wrong" | "out">(null);
  const [unlocking, setUnlocking] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<GameStatus | null>(null);
  const usedQuestionsRef = useRef<string[]>([]);

  // ─── Filter quick-pick character suggestions ───
  const filteredCharacters = useMemo(() => {
    return BOLLYWOOD_SUGGESTIONS.filter((c) => {
      const matchesCat = selectedCategory === "all" || c.category === selectedCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.tagline.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  // ─── Restore Session ───
  useEffect(() => {
    setPlayerId(getPlayerId());
    const savedRoom = sessionStorage.getItem("bw-room-id");
    const savedRole = sessionStorage.getItem("bw-role") as Role | null;
    const savedPhase = sessionStorage.getItem("bw-phase") as GamePhase | null;
    const savedName = sessionStorage.getItem("bw-name");
    if (savedRoom && savedRole && savedPhase) {
      setRoomId(savedRoom);
      setRole(savedRole);
      setPhase(savedPhase);
    }
    if (savedName) setPlayerName(savedName);
  }, []);

  // ─── Persist Session ───
  useEffect(() => {
    if (roomId && phase !== "lobby") {
      sessionStorage.setItem("bw-room-id", roomId);
      sessionStorage.setItem("bw-role", role);
      sessionStorage.setItem("bw-phase", phase);
    }
    if (playerName) sessionStorage.setItem("bw-name", playerName);
  }, [roomId, role, phase, playerName]);

  // ─── Poll State ───
  const pollState = useCallback(
    async (rid: string, pidOverride?: string) => {
      const activePid = pidOverride || playerId;
      if (!activePid) return;
      try {
        const data = await apiCall({ action: "state", roomId: rid, playerId: activePid });
        if (data.success) {
          setGame(data);
          // Always sync role with server (crucial when Play Again swaps roles!)
          if (data.role) {
            setRole(data.role);
          }

          // Clear previous round feedback when transitioning into a new round
          if (prevStatusRef.current !== data.status && data.status === "setting") {
            setGuessInput("");
            setGuessFeedback(null);
            setError("");
            setClueError("");
            setCustomCharName("");
            const defaultChar = BOLLYWOOD_SUGGESTIONS[0];
            setSelectedChar(defaultChar);
            setPreviewClues([]);
            setPreviewCharFor("");
            setPreviewResolvedName("");
            setPreviewAliases([]);
            setClueSource("");
          }
          prevStatusRef.current = data.status;

          // Advance phases automatically
          if (data.status === "waiting") {
            setPhase("waiting");
          } else if (data.status === "setting") {
            setPhase(data.role === "host" ? "setting" : "waiting");
          } else if (data.status === "playing" || data.status === "won" || data.status === "lost") {
            setPhase("playing");
          }
        } else if (data.error === "Room not found" || data.error === "Not a player in this room") {
          handleLeave();
        }
      } catch {
        // silent poll failure
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playerId]
  );

  useEffect(() => {
    if ((phase === "waiting" || phase === "playing" || phase === "setting") && roomId && playerId) {
      pollState(roomId);
      pollingRef.current = setInterval(() => pollState(roomId), 800);
      return () => {
        if (pollingRef.current) clearInterval(pollingRef.current);
      };
    }
  }, [phase, roomId, playerId, pollState]);

  // ─── Create Room ───
  const handleCreate = async () => {
    if (!playerName.trim()) {
      setError("Please enter your name first!");
      return;
    }
    setLoading(true);
    setError("");
    const activePid = playerId || getPlayerId();
    if (!playerId) setPlayerId(activePid);
    try {
      const data = await apiCall({ action: "create", playerId: activePid, playerName: playerName.trim() });
      if (data.success) {
        setRoomId(data.roomId);
        setRole("host");
        setPhase("waiting");
        pollState(data.roomId, activePid);
      }
    } catch {
      setError("Failed to create room.");
    }
    setLoading(false);
  };

  // ─── Join Room ───
  const handleJoin = async () => {
    if (!playerName.trim()) {
      setError("Please enter your name first!");
      return;
    }
    if (!joinCode.trim()) {
      setError("Please enter a room code!");
      return;
    }
    setLoading(true);
    setError("");
    const activePid = playerId || getPlayerId();
    if (!playerId) setPlayerId(activePid);
    try {
      const data = await apiCall({
        action: "join",
        roomId: joinCode.trim().toUpperCase(),
        playerId: activePid,
        playerName: playerName.trim(),
      });
      if (data.success) {
        setRoomId(data.roomId);
        setRole(data.role);
        setPhase("waiting");
        pollState(data.roomId, activePid);
      } else {
        setError(data.error || "Failed to join room.");
      }
    } catch {
      setError("Failed to join room.");
    }
    setLoading(false);
  };

  // ─── Fetch Unique Live Clues from AI Agent ───
  const fetchUniqueClues = useCallback(
    async (charName: string) => {
      const clean = charName.trim();
      if (!clean) return null;
      setGeneratingClues(true);
      setClueError("");
      setNeedsApiKey(false);
      try {
        const res = await fetch("/api/bollywood-guess/clues", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterName: clean,
            excludeQuestions: usedQuestionsRef.current,
          }),
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.clues)) {
          setPreviewClues(data.clues);
          setPreviewCharFor(clean);
          setPreviewResolvedName(data.character || clean);
          setPreviewAliases(Array.isArray(data.aliases) ? data.aliases : [clean.toLowerCase()]);
          setClueSource(data.source || "ai");
          return data as {
            character: string;
            aliases: string[];
            clues: ClueItem[];
            source: string;
          };
        } else {
          setPreviewClues([]);
          setClueError(data.error || "Failed to generate AI clues.");
          if (data.needsApiKey) {
            setNeedsApiKey(true);
          }
        }
      } catch {
        setPreviewClues([]);
        setClueError("Could not reach AI clue generator.");
      } finally {
        setGeneratingClues(false);
      }
      return null;
    },
    []
  );

  // ─── Host Confirms Character (Uses already-generated AI clues; never calls AI on its own) ───
  const handleConfirmCharacter = async (charToUse?: BollywoodSuggestion) => {
    const customTrimmed = customCharName.trim();
    const targetChar = charToUse || selectedChar;
    const targetName = customTrimmed || targetChar.name;

    if (
      previewCharFor.toLowerCase() !== targetName.toLowerCase() ||
      previewClues.length !== 5
    ) {
      setError(`Click "✨ Get Hint" first to generate clues for ${targetName}!`);
      return;
    }

    setLoading(true);
    setError("");

    const payloadCharacter = previewResolvedName || targetName;
    const payloadAliases = previewAliases.length > 0 ? previewAliases : [targetName.toLowerCase()];

    // Hard spoiler-guard sanitization — redact ONLY the target name!
    const sanitizedClues = previewClues.map((c) => ({
      question: sanitizeClueText(c.question, payloadCharacter),
      hint: sanitizeClueText(c.hint, payloadCharacter),
    }));

    // Track used questions in session so next round never repeats them
    for (const c of sanitizedClues) {
      usedQuestionsRef.current.push(c.question.trim().toLowerCase());
    }
    if (usedQuestionsRef.current.length > 200) {
      usedQuestionsRef.current = usedQuestionsRef.current.slice(-200);
    }

    const payloadQuestions = sanitizedClues.map((c) => `${c.question}|||${c.hint}`);

    try {
      const res = await apiCall({
        action: "set_character",
        roomId,
        playerId,
        character: payloadCharacter,
        aliases: payloadAliases,
        questions: payloadQuestions,
      });
      if (res.success) {
        await pollState(roomId);
        setPhase("playing");
      } else {
        setError(res.error || "Failed to start game.");
      }
    } catch {
      setError("Failed to set character.");
    }
    setLoading(false);
  };

  // ─── Guesser / Host: Reveal Next Clue ───
  const handleNextQuestion = async () => {
    if (unlocking) return;
    setUnlocking(true);
    setError("");
    try {
      const data = await apiCall({ action: "next_question", roomId, playerId });
      if (data.success) {
        setGame((prev) =>
          prev ? { ...prev, currentQuestionIndex: data.currentQuestionIndex } : prev
        );
        await pollState(roomId);
      } else {
        setError(data.error || "Could not unlock next clue.");
      }
    } catch {
      setError("Failed to unlock next clue.");
    }
    setUnlocking(false);
  };

  // ─── Guesser: Submit Guess ───
  const handleGuess = async () => {
    if (!guessInput.trim()) {
      setError("Type the character name before guessing!");
      return;
    }
    setLoading(true);
    setError("");
    setGuessFeedback(null);
    try {
      const data = await apiCall({ action: "guess", roomId, playerId, guess: guessInput.trim() });
      if (data.success) {
        if (data.correct) {
          setGuessFeedback("correct");
        } else if (data.outOfGuesses) {
          setGuessFeedback("out");
        } else {
          setGuessFeedback("wrong");
        }
        setGuessInput("");
        pollState(roomId);
      } else {
        setError(data.error || "Failed to submit guess.");
      }
    } catch {
      setError("Failed to submit guess.");
    }
    setLoading(false);
  };

  // ─── Host Judgement (Approve/Reject) ───
  const handleHostJudge = async (isRight: boolean) => {
    try {
      await apiCall({ action: "judge_guess", roomId, playerId, isRight });
      pollState(roomId);
    } catch {
      // silent
    }
  };

  // ─── Play Again / Restart (Roles Swap) ───
  const handleRestart = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiCall({ action: "restart", roomId, playerId });
      if (data.success) {
        setGuessInput("");
        setGuessFeedback(null);
        setCustomCharName("");
        await pollState(roomId);
      } else {
        setError(data.error || "Failed to restart game.");
      }
    } catch {
      setError("Failed to restart game.");
    }
    setLoading(false);
  };

  // ─── Leave Room ───
  const handleLeave = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setPhase("lobby");
    setRoomId("");
    setJoinCode("");
    setGame(null);
    setError("");
    setGuessInput("");
    setGuessFeedback(null);
    setCustomCharName("");
    sessionStorage.removeItem("bw-room-id");
    sessionStorage.removeItem("bw-role");
    sessionStorage.removeItem("bw-phase");
  };

  // ─── Copy Room Code ───
  const handleCopy = () => {
    navigator.clipboard.writeText(roomId);
    setCopyTooltip(true);
    setTimeout(() => setCopyTooltip(false), 1500);
  };

  // ─── Parse Questions ───
  const parsedQuestions = (game?.questions || []).map((q) => {
    const parts = q.split("|||");
    return { question: parts[0] || "", hint: parts[1] || "" };
  });

  const isGameOver = game?.status === "won" || game?.status === "lost";
  const activeRole: Role = game?.role || role;

  // ─── RENDER ─────────────────────────────────────────────
  return (
    <main className="bw-main">
      <Particles />

      {/* Main Brand Header */}
      <div className="bw-header">
        <h1 className="bw-title">
          <span className="bw-t1">🎬</span>
          <span className="bw-t2">Just</span>
          <span className="bw-t3">Guess!</span>
        </h1>
        <p className="bw-subtitle">Character Guessing Challenge 🌟</p>
      </div>

      {/* ═══════════════════════════════════════════
          PHASE 1: LOBBY
          ═══════════════════════════════════════════ */}
      {phase === "lobby" && (
        <div className="bw-lobby animate-bw-fade">
          <div className="bw-name-section">
            <label className="bw-label">👤 Your Player Name</label>
            <input
              type="text"
              className="bw-input"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="e.g. Rahul, Sima, Raju..."
              maxLength={20}
            />
          </div>

          <div className="bw-lobby-cards">
            {/* Create Room */}
            <div className="bw-lobby-card bw-card-create">
              <div className="bw-card-icon">👑</div>
              <h2 className="bw-card-title">Create Room</h2>
              <p className="bw-card-desc">
                Pick any character — the game creates 5 hilarious clues automatically!
              </p>
              <button
                className="bw-btn bw-btn-primary bw-btn-full"
                onClick={handleCreate}
                disabled={loading}
              >
                {loading ? <span className="bw-spinner" /> : "🚀 Create Game Room"}
              </button>
            </div>

            <div className="bw-lobby-divider">
              <span>OR</span>
            </div>

            {/* Join Room */}
            <div className="bw-lobby-card bw-card-join">
              <div className="bw-card-icon">🚪</div>
              <h2 className="bw-card-title">Join Room</h2>
              <p className="bw-card-desc">
                Enter your friend&apos;s code, read funny clues 1 by 1, and guess the star!
              </p>
              <div className="bw-join-group">
                <input
                  type="text"
                  className="bw-input"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ROOM CODE"
                  maxLength={6}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
                <button
                  className="bw-btn bw-btn-secondary"
                  onClick={handleJoin}
                  disabled={loading}
                >
                  {loading ? <span className="bw-spinner" /> : "Join"}
                </button>
              </div>
            </div>
          </div>

          {error && <div className="bw-error animate-bw-shake">{error}</div>}

          {/* Rules Card */}
          <div className="bw-rules">
            <h3>📜 Game Rules (Fast &amp; Simple!)</h3>
            <ol>
              <li>
                <b>Player 1 (Host):</b> Just clicks any Bollywood character. <b>5 funny clues are generated automatically!</b>
              </li>
              <li>
                <b>Player 2 (Guesser):</b> Reads clues 1 by 1 and tries to name the character.
              </li>
              <li>
                <b>Chances:</b> Player 2 gets only <b>3 chances</b> to submit the name.
              </li>
              <li>
                <b>Winner:</b> If Player 2 guesses right (or Player 1 confirms it&apos;s right) → <b>Player 2 wins!</b>
              </li>
              <li>
                If Player 2 fails all 3 chances → <b>Player 1 wins!</b> 🏆
              </li>
              <li>
                <b>Swap:</b> Roles switch automatically every round!
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          PHASE 2: WAITING FOR PLAYER 2
          ═══════════════════════════════════════════ */}
      {phase === "waiting" && !game?.bothJoined && (
        <div className="bw-waiting animate-bw-fade">
          <div className="bw-waiting-card">
            <div className="bw-waiting-pulse">
              <div className="bw-pulse-ring" />
              <div className="bw-pulse-ring bw-pulse-ring-2" />
              <div className="bw-pulse-core">⏳</div>
            </div>
            <h2 className="bw-waiting-title">Waiting for Opponent</h2>
            {role === "host" ? (
              <>
                <p className="bw-waiting-desc">Share this room code with your friend:</p>
                <div className="bw-room-code-wrap">
                  <button className="bw-room-code" onClick={handleCopy} title="Click to copy">
                    {roomId.split("").map((c, i) => (
                      <span
                        key={i}
                        className="bw-code-char"
                        style={{ animationDelay: `${i * 0.08}s` }}
                      >
                        {c}
                      </span>
                    ))}
                  </button>
                  {copyTooltip && <span className="bw-copy-tip">Copied!</span>}
                </div>
                <p className="bw-waiting-hint">Click code to copy 📋</p>
              </>
            ) : (
              <p className="bw-waiting-desc">
                Connected to Room <b>{roomId}</b>. Waiting for Host to select a character!
              </p>
            )}
            <button className="bw-btn bw-btn-ghost" onClick={handleLeave}>
              ← Leave Room
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          PHASE 3: HOST PICKS CHARACTER (CLUES AUTOMATED!)
          ═══════════════════════════════════════════ */}
      {phase !== "lobby" && (phase === "setting" || (game?.bothJoined && game?.status === "setting")) && activeRole === "host" && (
        <div className="bw-setting animate-bw-fade">
          <div className="bw-setting-card">
            <div className="bw-setting-header">
              <span className="bw-badge-ready">✨ Opponent Joined: {game?.guesserName}</span>
              <h2 className="bw-setting-title">🎭 Pick a Character</h2>
              <p className="bw-setting-desc">
                Select any character below. <b>5 funny clues are generated automatically</b> — no typing needed!
              </p>
            </div>

            {/* Category Filter Tabs */}
            <div className="bw-category-tabs">
              {[
                { id: "all", label: "🌟 All" },
                { id: "superstars", label: "👑 Superstars" },
                { id: "ladies", label: "💃 Leading Ladies" },
                { id: "comedy", label: "😂 Comedy Legends" },
                { id: "villains", label: "😈 Iconic Villains" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  className={`bw-cat-pill ${selectedCategory === tab.id ? "bw-cat-active" : ""}`}
                  onClick={() => setSelectedCategory(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="bw-search-row">
              <input
                type="text"
                className="bw-input bw-search-input"
                placeholder="🔍 Search star, character, dialogue..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Character Cards Grid */}
            <div className="bw-chars-grid">
              {filteredCharacters.map((char) => {
                const isSelected = selectedChar.id === char.id && !customCharName;
                return (
                  <div
                    key={char.id}
                    className={`bw-char-card ${isSelected ? "bw-char-card-selected" : ""}`}
                    onClick={() => {
                      setSelectedChar(char);
                      setCustomCharName("");
                      setClueError("");
                      setError("");
                    }}
                  >
                    <div className="bw-char-emoji">{char.emoji}</div>
                    <div className="bw-char-details">
                      <div className="bw-char-name">{char.name}</div>
                      <div className="bw-char-tagline">{char.tagline}</div>
                    </div>
                    {isSelected && <span className="bw-char-check">✓</span>}
                  </div>
                );
              })}
            </div>

            {/* Or type custom name */}
            <div className="bw-custom-char-box">
              <label className="bw-label">Or Type Any Other Star / Character Name</label>
              <div className="bw-guess-input-row">
                <input
                  type="text"
                  className="bw-input"
                  placeholder="e.g. Munna Bhai, Chatur, Kachra Seth, Singham, Manjulika..."
                  value={customCharName}
                  onChange={(e) => {
                    setCustomCharName(e.target.value);
                    setClueError("");
                    setError("");
                  }}
                />
                <button
                  type="button"
                  className="bw-btn bw-btn-secondary"
                  onClick={() => fetchUniqueClues(customCharName.trim() || selectedChar.name)}
                  disabled={generatingClues || !(customCharName.trim() || selectedChar.name)}
                >
                  {generatingClues ? <span className="bw-spinner" /> : "✨ Get Hint"}
                </button>
              </div>
              <p className="bw-custom-char-tip">
                👆 Pick a card above or type any character name, then click <b>✨ Get Hint</b> to generate 5 AI clues!
              </p>
            </div>

            {/* Clues Preview (Player 1 inspects live AI clues!) */}
            {(() => {
              const activeTarget = customCharName.trim() || selectedChar.name;
              const hasCluesForTarget =
                previewCharFor.toLowerCase() === activeTarget.toLowerCase() &&
                previewClues.length === 5;
              return (
                <>
                  <div className="bw-clues-preview-box">
                    <div className="bw-clues-preview-header">
                      <div className="bw-clues-preview-title">
                        🤖 5 Live AI Clues {game?.guesserName || "Player 2"} will see for{" "}
                        <span className="bw-highlight-char">{activeTarget}</span>
                      </div>
                      <div className="bw-preview-actions">
                        {hasCluesForTarget && clueSource && (
                          <span className="bw-source-badge">🤖 AI: {clueSource}</span>
                        )}
                        <button
                          type="button"
                          className="bw-btn bw-btn-shuffle"
                          onClick={() => fetchUniqueClues(activeTarget)}
                          disabled={generatingClues}
                        >
                          {generatingClues
                            ? "Asking AI..."
                            : hasCluesForTarget
                              ? "🔄 Regenerate AI Clues"
                              : "✨ Get Hint"}
                        </button>
                      </div>
                    </div>

                    {generatingClues ? (
                      <div className="bw-clues-loading">
                        <span className="bw-spinner" />
                        <span>Asking AI Agent for 5 fresh, spoiler-free clues...</span>
                      </div>
                    ) : clueError ? (
                      <div className="bw-error">
                        {needsApiKey ? (
                          <div>
                            <b>🔑 AI API Key Needed:</b> {clueError}
                          </div>
                        ) : (
                          clueError
                        )}
                      </div>
                    ) : hasCluesForTarget ? (
                      <div className="bw-clues-preview-list">
                        {previewClues.map((c, i) => (
                          <div key={i} className="bw-preview-clue-item">
                            <span className="bw-preview-num">Q{i + 1}</span>
                            <div className="bw-preview-texts">
                              <div className="bw-preview-q">{c.question}</div>
                              <div className="bw-preview-hint">💡 {c.hint}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bw-clues-loading">
                        <span>
                          No hints generated yet for <b>{activeTarget}</b>. Click{" "}
                          <b>✨ Get Hint</b> to generate 5 AI clues!
                        </span>
                      </div>
                    )}
                  </div>

                  {error && <div className="bw-error animate-bw-shake">{error}</div>}

                  {/* Single Action Button */}
                  <button
                    className="bw-btn bw-btn-primary bw-btn-start"
                    onClick={() => handleConfirmCharacter()}
                    disabled={loading || generatingClues || !hasCluesForTarget}
                  >
                    {loading ? (
                      <span className="bw-spinner" />
                    ) : hasCluesForTarget ? (
                      `🎯 Start Game with ${activeTarget}!`
                    ) : (
                      `✨ Click "Get Hint" First to Start!`
                    )}
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          PHASE 3B: GUESSER WAITS FOR HOST TO PICK
          ═══════════════════════════════════════════ */}
      {phase !== "lobby" && game?.bothJoined && game?.status === "setting" && activeRole === "guesser" && (
        <div className="bw-waiting animate-bw-fade">
          <div className="bw-waiting-card">
            <div className="bw-pulse-core" style={{ fontSize: 48 }}>
              🎭
            </div>
            <h2 className="bw-waiting-title">Opponent Picking!</h2>
            <p className="bw-waiting-desc">
              <b>{game.hostName}</b> is selecting a Bollywood character for you to guess...
            </p>
            <div className="bw-loading-dots">
              <span />
              <span />
              <span />
            </div>
            <button className="bw-btn bw-btn-ghost" onClick={handleLeave}>
              ← Leave Room
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          PHASE 4: PLAYING PHASE
          ═══════════════════════════════════════════ */}
      {phase === "playing" && game && game.status !== "setting" && (
        <div className="bw-playing animate-bw-fade">
          {/* Top Scoreboard */}
          <div className="bw-scores-bar">
            <div className={`bw-score-box ${activeRole === "host" ? "bw-score-you" : ""}`}>
              <span className="bw-player-badge">🎭 Host: {game.hostName}</span>
              <span className="bw-score-num">{game.scores.host}</span>
            </div>
            <div className="bw-score-vs">VS</div>
            <div className={`bw-score-box ${activeRole === "guesser" ? "bw-score-you" : ""}`}>
              <span className="bw-player-badge">🕵️ Guesser: {game.guesserName}</span>
              <span className="bw-score-num">{game.scores.guesser}</span>
            </div>
          </div>

          {/* Host Private Banner */}
          {activeRole === "host" && game.character && (
            <div className="bw-host-secret-banner">
              <div className="bw-secret-tag">🤫 YOUR SECRET CHARACTER</div>
              <div className="bw-secret-name">{game.character}</div>
              <div className="bw-secret-hint">
                Don&apos;t reveal this! Watch {game.guesserName} unlock clues and try to guess.
              </div>
            </div>
          )}

          {/* ─── GAME OVER BANNER ─── */}
          {isGameOver && (
            <div
              className={`bw-game-over-banner ${game.status === "won" ? "bw-banner-win" : "bw-banner-lose"
                }`}
            >
              {game.status === "won" ? (
                <>
                  <div className="bw-banner-emoji">🎉🏆</div>
                  <h2 className="bw-banner-title">
                    {activeRole === "guesser" ? "YOU GUESSED IT RIGHT!" : `${game.guesserName} WON!`}
                  </h2>
                  <p className="bw-banner-text">
                    The secret Bollywood character was:
                    <span className="bw-banner-char-name">
                      {game.character || game.lastGuess}
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <div className="bw-banner-emoji">😈👏</div>
                  <h2 className="bw-banner-title">
                    {activeRole === "host" ? "YOU WON! Character remained hidden!" : `${game.hostName} WON!`}
                  </h2>
                  <p className="bw-banner-text">
                    Guesser ran out of all 3 chances! The character was:
                    <span className="bw-banner-char-name">{game.character}</span>
                  </p>
                </>
              )}
              <div className="bw-game-over-actions">
                <button className="bw-btn bw-btn-primary" onClick={handleRestart} disabled={loading}>
                  {loading ? <span className="bw-spinner" /> : "🔄 Play Again (Roles Swap!)"}
                </button>
                <button className="bw-btn bw-btn-ghost" onClick={handleLeave}>
                  Leave Room
                </button>
              </div>
            </div>
          )}

          {/* ─── ACTIVE GAMEPLAY CONTROLS ─── */}
          {!isGameOver && (
            <>
              {/* Chances + Clue Unlock Header */}
              <div className="bw-guess-status-card">
                <div className="bw-chances-label">
                  <span>Guesser Chances:</span>
                  <GuessDots guessesLeft={game.guessesLeft} />
                </div>
                <div className="bw-chances-text">
                  <b>{game.guessesLeft}</b> of 3 chances remaining
                </div>
              </div>

              {/* Quick Unlock Clue Button right above clues */}
              {game.currentQuestionIndex < parsedQuestions.length - 1 && (
                <div className="bw-clue-unlock-bar">
                  <button
                    className="bw-btn bw-btn-secondary bw-btn-reveal"
                    onClick={handleNextQuestion}
                    disabled={unlocking}
                  >
                    {unlocking ? (
                      <span className="bw-spinner" />
                    ) : (
                      `🔓 Unlock Clue ${game.currentQuestionIndex + 2} of ${parsedQuestions.length}`
                    )}
                  </button>
                </div>
              )}

              {/* Clues List (Revealed 1 by 1) */}
              <div className="bw-questions-list">
                {parsedQuestions.map((pq, i) => (
                  <QuestionCard
                    key={i}
                    index={i}
                    question={pq.question}
                    hint={pq.hint}
                    revealed={i <= game.currentQuestionIndex}
                    isHost={activeRole === "host"}
                    isNextToUnlock={i === game.currentQuestionIndex + 1}
                    onUnlock={handleNextQuestion}
                    unlocking={unlocking}
                  />
                ))}
              </div>

              {/* GUESSER CONTROLS */}
              {activeRole === "guesser" && (
                <div className="bw-guesser-controls-card">
                  {/* Guess Feedback */}
                  {guessFeedback === "wrong" && (
                    <div className="bw-feedback bw-feedback-wrong animate-bw-shake">
                      ❌ Not quite right! Unlock another clue or try again ({game.guessesLeft} chances left)
                    </div>
                  )}

                  {/* Guess Input */}
                  <label className="bw-label bw-label-guess">
                    🎯 Guess the Bollywood Star / Character:
                  </label>
                  <div className="bw-guess-input-row">
                    <input
                      type="text"
                      className="bw-input bw-guess-input"
                      value={guessInput}
                      onChange={(e) => setGuessInput(e.target.value)}
                      placeholder="Type character or star name..."
                      onKeyDown={(e) => e.key === "Enter" && handleGuess()}
                      disabled={loading || game.guessesLeft <= 0}
                    />
                    <button
                      className="bw-btn bw-btn-primary bw-btn-submit-guess"
                      onClick={handleGuess}
                      disabled={loading || game.guessesLeft <= 0}
                    >
                      {loading ? <span className="bw-spinner" /> : "Send Guess 🚀"}
                    </button>
                  </div>

                  {game.guessHistory && game.guessHistory.length > 0 && (
                    <div className="bw-guess-history-list">
                      <div className="bw-history-title">Your Previous Guesses:</div>
                      {game.guessHistory.map((g, idx) => (
                        <div
                          key={idx}
                          className={`bw-history-item ${g.isCorrect ? "bw-history-correct" : "bw-history-wrong"
                            }`}
                        >
                          <span>
                            Attempt {idx + 1}: &quot;<b>{g.guess}</b>&quot;
                          </span>
                          <span>{g.isCorrect ? "✅ RIGHT" : "❌ WRONG"}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {error && <div className="bw-error animate-bw-shake">{error}</div>}
                </div>
              )}

              {/* HOST CONTROLS (Host reviews guesser attempts) */}
              {activeRole === "host" && (
                <div className="bw-host-watch-card">
                  <div className="bw-host-watch-header">
                    <span>👀 Live Guesser Monitor</span>
                    <span className="bw-pill-indicator">
                      Unlocked {game.currentQuestionIndex + 1} of {parsedQuestions.length} clues
                    </span>
                  </div>

                  {/* Latest Guess Judge Prompt */}
                  {game.pendingJudge && game.lastGuess ? (
                    <div className="bw-judge-box">
                      <div className="bw-judge-text">
                        Guesser&apos;s latest guess: <b>&quot;{game.lastGuess}&quot;</b>
                      </div>
                      <div className="bw-judge-actions">
                        <button
                          className="bw-btn bw-btn-judge-correct"
                          onClick={() => handleHostJudge(true)}
                        >
                          ✅ Confirm Right! (Guesser Wins)
                        </button>
                        <button
                          className="bw-btn bw-btn-judge-wrong"
                          onClick={() => handleHostJudge(false)}
                        >
                          ❌ It&apos;s Wrong
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bw-host-waiting-guess">
                      Waiting for {game.guesserName} to submit a guess...
                    </div>
                  )}

                  {/* Guess History */}
                  {game.guessHistory && game.guessHistory.length > 0 && (
                    <div className="bw-guess-history-list">
                      <div className="bw-history-title">Submitted Guesses:</div>
                      {game.guessHistory.map((g, idx) => (
                        <div
                          key={idx}
                          className={`bw-history-item ${g.isCorrect ? "bw-history-correct" : "bw-history-wrong"
                            }`}
                        >
                          <span>
                            Attempt {idx + 1}: &quot;<b>{g.guess}</b>&quot;
                          </span>
                          <span>{g.isCorrect ? "✅ RIGHT" : "❌ WRONG"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {!isGameOver && (
            <button className="bw-btn bw-btn-ghost bw-leave-btn" onClick={handleLeave}>
              ← Leave Game
            </button>
          )}
        </div>
      )}
    </main>
  );
}
