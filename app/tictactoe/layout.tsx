import React from "react";
import type { Metadata } from "next";
import "../tictactoe/tictactoe.css";

export const metadata: Metadata = {
  title: "Tic Tac Toe — Multiplayer Battle Arena",
  description:
    "Play Tic Tac Toe with a friend! Create or join a room for real-time multiplayer matches.",
};

export default function TicTacToeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
