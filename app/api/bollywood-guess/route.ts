import { NextRequest, NextResponse } from "next/server";

// ─── Types ───────────────────────────────────────────────
export interface GuessRecord {
  guess: string;
  isCorrect: boolean;
  timestamp: number;
}

interface GameRoom {
  id: string;
  players: { host: string | null; guesser: string | null };
  hostName: string;
  guesserName: string;
  character: string;
  aliases: string[];
  questions: string[];
  currentQuestionIndex: number;
  guessesLeft: number;
  status: "waiting" | "setting" | "playing" | "won" | "lost";
  lastGuess: string;
  pendingJudge: boolean;
  guessHistory: GuessRecord[];
  scores: { host: number; guesser: number };
  createdAt: number;
  lastActivity: number;
}

// Persist rooms across Next.js dev HMR reloads
const globalForRooms = globalThis as unknown as {
  __bollywoodRooms?: Map<string, GameRoom>;
};
const rooms = (globalForRooms.__bollywoodRooms ??= new Map<string, GameRoom>());

// Cleanup stale rooms (older than 1 hour)
function cleanupRooms() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.lastActivity > 3600000) {
      rooms.delete(id);
    }
  }
}

function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function normalize(str: string): string {
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function checkGuessMatch(guess: string, character: string, aliases: string[] = []): boolean {
  const cleanGuess = normalize(guess);
  if (!cleanGuess) return false;
  if (normalize(character) === cleanGuess) return true;
  return aliases.some((alias) => normalize(alias) === cleanGuess);
}

function getRoom(roomId: unknown): GameRoom | undefined {
  if (typeof roomId !== "string") return undefined;
  return rooms.get(roomId.trim().toUpperCase());
}

export async function POST(request: NextRequest) {
  cleanupRooms();

  const body = await request.json();
  const {
    action,
    roomId,
    playerId,
    playerName,
    character,
    aliases,
    questions,
    guess,
    isRight,
  } = body;

  switch (action) {
    // ─── Create Room (Host) ───
    case "create": {
      if (!playerId) {
        return NextResponse.json({ success: false, error: "Missing player ID" }, { status: 400 });
      }
      const id = generateRoomId();
      const room: GameRoom = {
        id,
        players: { host: playerId, guesser: null },
        hostName: playerName || "Player 1",
        guesserName: "",
        character: "",
        aliases: [],
        questions: [],
        currentQuestionIndex: 0,
        guessesLeft: 3,
        status: "waiting",
        lastGuess: "",
        pendingJudge: false,
        guessHistory: [],
        scores: { host: 0, guesser: 0 },
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };
      rooms.set(id, room);
      return NextResponse.json({ success: true, roomId: id, role: "host" });
    }

    // ─── Join Room (Guesser) ───
    case "join": {
      if (!playerId) {
        return NextResponse.json({ success: false, error: "Missing player ID" }, { status: 400 });
      }
      const room = getRoom(roomId);
      if (!room) {
        return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
      }
      // Rejoin check
      if (room.players.host === playerId) {
        return NextResponse.json({ success: true, roomId: room.id, role: "host" });
      }
      if (room.players.guesser === playerId) {
        return NextResponse.json({ success: true, roomId: room.id, role: "guesser" });
      }
      if (room.players.guesser !== null) {
        return NextResponse.json({ success: false, error: "Room is full" }, { status: 400 });
      }
      room.players.guesser = playerId;
      room.guesserName = playerName || "Player 2";
      room.status = "setting";
      room.lastActivity = Date.now();
      return NextResponse.json({ success: true, roomId: room.id, role: "guesser" });
    }

    // ─── Host picks character (built-in or generated clues) ───
    case "set_character": {
      const room = getRoom(roomId);
      if (!room) return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
      if (room.players.host !== playerId) return NextResponse.json({ success: false, error: "Not host" }, { status: 403 });

      room.character = character;
      room.aliases = Array.isArray(aliases) ? aliases : [];
      room.questions = Array.isArray(questions) ? questions : [];
      room.currentQuestionIndex = 0;
      room.guessesLeft = 3;
      room.status = "playing";
      room.lastGuess = "";
      room.pendingJudge = false;
      room.guessHistory = [];
      room.lastActivity = Date.now();
      return NextResponse.json({ success: true });
    }

    // ─── Reveal next clue (Guesser or Host can unlock) ───
    case "next_question": {
      const room = getRoom(roomId);
      if (!room) return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
      if (room.players.guesser !== playerId && room.players.host !== playerId) {
        return NextResponse.json({ success: false, error: "Not a player in this room" }, { status: 403 });
      }
      if (room.status !== "playing") return NextResponse.json({ success: false, error: "Game not active" }, { status: 400 });

      if (room.currentQuestionIndex < room.questions.length - 1) {
        room.currentQuestionIndex++;
      }
      room.lastActivity = Date.now();
      return NextResponse.json({ success: true, currentQuestionIndex: room.currentQuestionIndex });
    }

    // ─── Guesser submits a guess ───
    case "guess": {
      const room = getRoom(roomId);
      if (!room) return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
      if (room.players.guesser !== playerId) return NextResponse.json({ success: false, error: "Not guesser" }, { status: 403 });
      if (room.status !== "playing") return NextResponse.json({ success: false, error: "Game not active" }, { status: 400 });
      if (room.guessesLeft <= 0) return NextResponse.json({ success: false, error: "No guesses left" }, { status: 400 });

      const cleanGuess = guess?.trim();
      if (!cleanGuess) return NextResponse.json({ success: false, error: "Empty guess" }, { status: 400 });

      const isMatch = checkGuessMatch(cleanGuess, room.character, room.aliases);
      room.lastGuess = cleanGuess;
      room.lastActivity = Date.now();

      if (isMatch) {
        room.status = "won";
        room.pendingJudge = false;
        room.scores.guesser++;
        room.guessHistory.push({ guess: cleanGuess, isCorrect: true, timestamp: Date.now() });
        return NextResponse.json({ success: true, correct: true });
      }

      // Wrong guess
      room.guessesLeft--;
      room.guessHistory.push({ guess: cleanGuess, isCorrect: false, timestamp: Date.now() });

      if (room.guessesLeft <= 0) {
        room.status = "lost";
        room.pendingJudge = false;
        room.scores.host++;
        return NextResponse.json({ success: true, correct: false, outOfGuesses: true });
      }

      room.pendingJudge = true;
      return NextResponse.json({ success: true, correct: false, guessesLeft: room.guessesLeft });
    }

    // ─── Host validates/judges a guess ("Host says it's right/wrong") ───
    case "judge_guess": {
      const room = getRoom(roomId);
      if (!room) return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
      if (room.players.host !== playerId) return NextResponse.json({ success: false, error: "Not host" }, { status: 403 });
      if (room.status !== "playing") return NextResponse.json({ success: false, error: "Game not active" }, { status: 400 });

      room.lastActivity = Date.now();
      room.pendingJudge = false;

      if (isRight) {
        room.status = "won";
        room.scores.guesser++;
        if (room.guessHistory.length > 0) {
          room.guessHistory[room.guessHistory.length - 1].isCorrect = true;
        }
        return NextResponse.json({ success: true, status: "won" });
      } else {
        return NextResponse.json({ success: true, status: room.status });
      }
    }

    // ─── Poll state ───
    case "state": {
      const room = getRoom(roomId);
      if (!room) return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });

      room.lastActivity = Date.now();
      const role =
        room.players.host === playerId
          ? "host"
          : room.players.guesser === playerId
            ? "guesser"
            : null;
      if (!role) {
        return NextResponse.json({ success: false, error: "Not a player in this room" }, { status: 403 });
      }

      const bothJoined = !!room.players.host && !!room.players.guesser;
      const isOver = room.status === "won" || room.status === "lost";

      return NextResponse.json({
        success: true,
        role,
        status: room.status,
        bothJoined,
        hostName: room.hostName,
        guesserName: room.guesserName,
        // Host always sees the character; guesser only sees it once game is over!
        character: role === "host" || isOver ? room.character : undefined,
        questions: room.questions,
        currentQuestionIndex: room.currentQuestionIndex,
        guessesLeft: room.guessesLeft,
        lastGuess: room.lastGuess,
        pendingJudge: room.pendingJudge,
        guessHistory: room.guessHistory,
        scores: room.scores,
        totalQuestions: room.questions.length,
      });
    }

    // ─── Restart game (Roles swap) ───
    case "restart": {
      const room = getRoom(roomId);
      if (!room) return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
      if (room.players.host !== playerId && room.players.guesser !== playerId) {
        return NextResponse.json({ success: false, error: "Not a player in this room" }, { status: 403 });
      }

      // Guard against double restart when both players click Play Again
      if (room.status === "setting") {
        return NextResponse.json({ success: true, alreadyRestarted: true });
      }

      // Swap roles AND keep each player's score with them
      const prevHost = room.players.host;
      const prevHostName = room.hostName;
      room.players.host = room.players.guesser;
      room.hostName = room.guesserName;
      room.players.guesser = prevHost;
      room.guesserName = prevHostName;

      const prevHostScore = room.scores.host;
      room.scores.host = room.scores.guesser;
      room.scores.guesser = prevHostScore;

      room.character = "";
      room.aliases = [];
      room.questions = [];
      room.currentQuestionIndex = 0;
      room.guessesLeft = 3;
      room.status = "setting";
      room.lastGuess = "";
      room.pendingJudge = false;
      room.guessHistory = [];
      room.lastActivity = Date.now();
      return NextResponse.json({ success: true });
    }

    // ─── Leave ───
    case "leave": {
      const room = getRoom(roomId);
      if (room) rooms.delete(room.id);
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  }
}
