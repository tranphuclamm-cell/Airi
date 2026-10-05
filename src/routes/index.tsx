import { createFileRoute } from "@tanstack/react-router";
import { ChatApp } from "@/components/airi/chat-app";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <ChatApp />;
}
