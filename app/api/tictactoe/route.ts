import { NextRequest, NextResponse } from "next/server";

// In-memory game state store
interface GameRoom {
  id: string;
  board: (string | null)[];
  players: { X: string | null; O: string | null };
  currentTurn: "X" | "O";
  winner: string | null;
  isDraw: boolean;
  createdAt: number;
  lastActivity: number;
  scores: { X: number; O: number; draws: number };
}

const rooms = new Map<string, GameRoom>();

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

function checkWinner(board: (string | null)[]): string | null {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6],             // diagonals
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function getWinningLine(board: (string | null)[]): number[] | null {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return line;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  cleanupRooms();
  
  const body = await request.json();
  const { action, roomId, playerId, position } = body;

  switch (action) {
    case "create": {
      const id = generateRoomId();
      const room: GameRoom = {
        id,
        board: Array(9).fill(null),
        players: { X: playerId, O: null },
        currentTurn: "X",
        winner: null,
        isDraw: false,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        scores: { X: 0, O: 0, draws: 0 },
      };
      rooms.set(id, room);
      return NextResponse.json({ success: true, roomId: id, symbol: "X" });
    }

    case "join": {
      const room = rooms.get(roomId?.toUpperCase());
      if (!room) {
        return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
      }
      if (room.players.X === playerId || room.players.O === playerId) {
        const symbol = room.players.X === playerId ? "X" : "O";
        return NextResponse.json({ success: true, roomId: room.id, symbol });
      }
      if (room.players.O !== null) {
        return NextResponse.json({ success: false, error: "Room is full" }, { status: 400 });
      }
      room.players.O = playerId;
      room.lastActivity = Date.now();
      return NextResponse.json({ success: true, roomId: room.id, symbol: "O" });
    }

    case "move": {
      const room = rooms.get(roomId);
      if (!room) {
        return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
      }
      if (room.winner || room.isDraw) {
        return NextResponse.json({ success: false, error: "Game is over" }, { status: 400 });
      }
      const playerSymbol = room.players.X === playerId ? "X" : room.players.O === playerId ? "O" : null;
      if (!playerSymbol) {
        return NextResponse.json({ success: false, error: "Not a player in this room" }, { status: 403 });
      }
      if (room.currentTurn !== playerSymbol) {
        return NextResponse.json({ success: false, error: "Not your turn" }, { status: 400 });
      }
      if (position < 0 || position > 8 || room.board[position] !== null) {
        return NextResponse.json({ success: false, error: "Invalid move" }, { status: 400 });
      }
      room.board[position] = playerSymbol;
      const winner = checkWinner(room.board);
      if (winner) {
        room.winner = winner;
        room.scores[winner as "X" | "O"]++;
      } else if (room.board.every((cell) => cell !== null)) {
        room.isDraw = true;
        room.scores.draws++;
      } else {
        room.currentTurn = room.currentTurn === "X" ? "O" : "X";
      }
      room.lastActivity = Date.now();
      return NextResponse.json({ success: true });
    }

    case "state": {
      const room = rooms.get(roomId);
      if (!room) {
        return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
      }
      room.lastActivity = Date.now();
      return NextResponse.json({
        success: true,
        board: room.board,
        currentTurn: room.currentTurn,
        winner: room.winner,
        winningLine: getWinningLine(room.board),
        isDraw: room.isDraw,
        players: {
          X: !!room.players.X,
          O: !!room.players.O,
        },
        scores: room.scores,
      });
    }

    case "restart": {
      const room = rooms.get(roomId);
      if (!room) {
        return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
      }
      room.board = Array(9).fill(null);
      room.winner = null;
      room.isDraw = false;
      room.currentTurn = "X";
      room.lastActivity = Date.now();
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  }
}
