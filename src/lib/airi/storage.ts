export type Role = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  status?: "streaming" | "done" | "error";
};

export type Thread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

export type AiriState = {
  threads: Thread[];
  activeId: string | null;
};

const KEY = "airi.threads.v1";

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as ChatMessage;
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    typeof message.createdAt === "number"
  );
}

function isThread(value: unknown): value is Thread {
  if (!value || typeof value !== "object") return false;
  const thread = value as Thread;
  return (
    typeof thread.id === "string" &&
    typeof thread.title === "string" &&
    typeof thread.updatedAt === "number" &&
    Array.isArray(thread.messages) &&
    thread.messages.every(isMessage)
  );
}

function settle(message: ChatMessage): ChatMessage {
  if (message.status !== "streaming") return message;
  if (message.content.trim()) return { ...message, status: "done" };
  return {
    ...message,
    status: "error",
    content: "Câu trả lời bị gián đoạn.",
  };
}

export function loadState(): AiriState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { threads: [], activeId: null };
    const data = JSON.parse(raw) as { threads?: unknown; activeId?: unknown };
    const threads = Array.isArray(data.threads)
      ? data.threads.filter(isThread).map((thread) => ({
          ...thread,
          messages: thread.messages.map(settle),
        }))
      : [];
    const activeId = typeof data.activeId === "string" ? data.activeId : null;
    return {
      threads,
      activeId: threads.some((thread) => thread.id === activeId)
        ? activeId
        : (threads[0]?.id ?? null),
    };
  } catch {
    return { threads: [], activeId: null };
  }
}

export function saveState(state: AiriState) {
  const payload: AiriState = {
    activeId: state.activeId,
    threads: state.threads.slice(0, 40).map((thread) => ({
      ...thread,
      messages: thread.messages.slice(-200),
    })),
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function titleFrom(text: string) {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= 48) return line || "Cuộc trò chuyện";
  return `${line.slice(0, 47)}…`;
}

export function formatWhen(ts: number) {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "vừa xong";
  if (min < 60) return `${min} phút`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} giờ`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} ngày`;
  return new Intl.DateTimeFormat("vi", { day: "numeric", month: "short" }).format(ts);
}
