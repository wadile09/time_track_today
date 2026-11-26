import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Just Guess! 🎬",
  description: "2-player Bollywood character guessing game",
};

export default function BollywoodGuessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
