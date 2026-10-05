import { useEffect, useReducer, useRef, useState } from "react";
import { Check, Copy, Menu, Plus, Send, Square, Trash2, X } from "lucide-react";
import { MessageBody } from "@/components/airi/message-body";
import {
  formatWhen,
  loadState,
  saveState,
  titleFrom,
  type AiriState,
  type ChatMessage,
  type Thread,
} from "@/lib/airi/storage";

const STARTERS = [
  { n: "01", text: "Kể một chuyện ngắn về Sài Gòn khi vừa tạnh mưa." },
  { n: "02", text: "Giải thích một ý khó theo cách mình nhớ được." },
  { n: "03", text: "Viết giúp mình một tin nhắn ấm, ngắn, không sến." },
];

type Action =
  | { type: "hydrate"; state: AiriState }
  | { type: "draft" }
  | { type: "select"; id: string }
  | { type: "remove"; id: string }
  | { type: "begin"; threadId: string; user: ChatMessage; assistant: ChatMessage }
  | { type: "delta"; threadId: string; messageId: string; text: string }
  | { type: "finish"; threadId: string; messageId: string; error?: string; stopped?: boolean };

type View = AiriState & { hydrated: boolean };

function sortThreads(threads: Thread[]) {
  return [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
}

function reducer(state: View, action: Action): View {
  switch (action.type) {
    case "hydrate":
      return { ...action.state, hydrated: true };
    case "draft":
      return { ...state, activeId: null };
    case "select":
      return { ...state, activeId: action.id };
    case "remove": {
      const threads = state.threads.filter((thread) => thread.id !== action.id);
      const activeId =
        state.activeId === action.id ? (threads[0]?.id ?? null) : state.activeId;
      return { ...state, threads, activeId };
    }
    case "begin": {
      const existing = state.threads.find((thread) => thread.id === action.threadId);
      if (!existing) {
        const thread: Thread = {
          id: action.threadId,
          title: titleFrom(action.user.content),
          updatedAt: Date.now(),
          messages: [action.user, action.assistant],
        };
        return {
          ...state,
          activeId: action.threadId,
          threads: [thread, ...state.threads].slice(0, 40),
        };
      }
      return {
        ...state,
        activeId: action.threadId,
        threads: sortThreads(
          state.threads.map((thread) =>
            thread.id === action.threadId
              ? {
                  ...thread,
                  title: thread.messages.some((message) => message.role === "user")
                    ? thread.title
                    : titleFrom(action.user.content),
                  updatedAt: Date.now(),
                  messages: [...thread.messages, action.user, action.assistant].slice(-200),
                }
              : thread,
          ),
        ),
      };
    }
    case "delta":
      return {
        ...state,
        threads: state.threads.map((thread) =>
          thread.id === action.threadId
            ? {
                ...thread,
                updatedAt: Date.now(),
                messages: thread.messages.map((message) =>
                  message.id === action.messageId
                    ? { ...message, content: message.content + action.text }
                    : message,
                ),
              }
            : thread,
        ),
      };
    case "finish":
      return {
        ...state,
        threads: state.threads.map((thread) =>
          thread.id === action.threadId
            ? {
                ...thread,
                updatedAt: Date.now(),
                messages: thread.messages.map((message) => {
                  if (message.id !== action.messageId) return message;
                  if (action.stopped) {
                    return {
                      ...message,
                      status: "done",
                      content: message.content.trim() ? message.content : "Đã dừng.",
                    };
                  }
                  if (action.error && !message.content.trim()) {
                    return { ...message, status: "error", content: action.error };
                  }
                  if (!message.content.trim()) {
                    return {
                      ...message,
                      status: "error",
                      content: "Airi không trả lời được lúc này.",
                    };
                  }
                  return { ...message, status: action.error ? "error" : "done" };
                }),
              }
            : thread,
        ),
      };
    default:
      return state;
  }
}

function Seal({ className = "" }: { className?: string }) {
  return (
    <span
      className={`grid size-10 shrink-0 place-items-center rounded-full border border-current font-display text-lg italic leading-none ${className}`}
      aria-hidden
    >
      Ai
    </span>
  );
}

export function ChatApp() {
  const [state, dispatch] = useReducer(reducer, {
    threads: [],
    activeId: null,
    hydrated: false,
  });
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    dispatch({ type: "hydrate", state: loadState() });
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    saveState({ threads: state.threads, activeId: state.activeId });
  }, [state.hydrated, state.threads, state.activeId]);

  const active = state.threads.find((thread) => thread.id === state.activeId) ?? null;
  const messages = active?.messages ?? [];

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  }

  function resizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    stickRef.current = true;
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    const threadId = active?.id ?? crypto.randomUUID();
    const user: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: Date.now(),
      status: "done",
    };
    const assistant: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      status: "streaming",
    };
    const history = [...messages, user]
      .filter((message) => message.role === "user" || message.content.trim())
      .slice(-12)
      .map((message) => ({ role: message.role, content: message.content.slice(0, 4000) }));

    dispatch({ type: "begin", threadId, user, assistant });
    setMenuOpen(false);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let failed = "";
    let stopped = false;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let message = "Airi không trả lời được lúc này.";
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // keep the fallback
        }
        failed = message;
      } else if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line) as { d?: string; e?: string };
              if (event.d) {
                dispatch({
                  type: "delta",
                  threadId,
                  messageId: assistant.id,
                  text: event.d,
                });
              }
              if (event.e) failed = event.e;
            } catch {
              // ignore a partial line
            }
          }
        }
      } else {
        failed = "Airi không trả lời được lúc này.";
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        stopped = true;
      } else {
        failed = "Mạng vừa đứt. Thử gửi lại.";
      }
    } finally {
      dispatch({
        type: "finish",
        threadId,
        messageId: assistant.id,
        error: stopped ? undefined : failed || undefined,
        stopped,
      });
      abortRef.current = null;
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === message.id ? null : current));
      }, 1400);
    } catch {
      setCopiedId(null);
    }
  }

  const rail = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-5">
        <Seal className="text-seal" />
        <div>
          <p className="font-display text-2xl leading-none text-paper">Airi</p>
          <p className="mt-1 text-sm text-paper/55">chatbot</p>
        </div>
      </div>
      <div className="px-3">
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "draft" });
            setMenuOpen(false);
            inputRef.current?.focus();
          }}
          className="flex min-h-11 w-full items-center gap-2 rounded-control border border-paper/15 px-3 text-sm text-paper transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          <Plus className="size-4" strokeWidth={1.75} />
          Cuộc mới
        </button>
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {state.threads.length === 0 ? (
          <p className="px-3 text-sm text-paper/45">Chưa có cuộc nào.</p>
        ) : (
          <ul className="space-y-1">
            {state.threads.map((thread) => {
              const selected = thread.id === state.activeId;
              return (
                <li key={thread.id}>
                  <div
                    className={`group flex items-center rounded-control ${
                      selected ? "bg-paper/10" : "hover:bg-paper/5"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: "select", id: thread.id });
                        setMenuOpen(false);
                      }}
                      className="min-h-11 min-w-0 flex-1 px-3 py-2 text-left"
                    >
                      <span className="block truncate text-sm text-paper">{thread.title}</span>
                      <span className="mt-0.5 block text-xs text-paper/45 tabular-nums">
                        {formatWhen(thread.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Xóa ${thread.title}`}
                      onClick={() => dispatch({ type: "remove", id: thread.id })}
                      className="mr-1 grid size-11 shrink-0 place-items-center rounded-control text-paper/55 transition-transform duration-150 ease-out hover:text-paper active:scale-[0.96]"
                    >
                      <Trash2 className="size-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="border-t border-paper/10 px-4 py-3 text-xs leading-relaxed text-paper/45">
        Cuộc trò chuyện nằm trên máy này.
      </p>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-ink text-paper">
      <aside className="hidden w-72 shrink-0 border-r border-paper/10 md:block">{rail}</aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            aria-label="Đóng danh sách"
            className="absolute inset-0 bg-ink/70"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative z-10 h-full w-72 max-w-[85%] bg-ink shadow-none">
            <button
              type="button"
              aria-label="Đóng"
              onClick={() => setMenuOpen(false)}
              className="absolute top-3 right-3 grid size-11 place-items-center rounded-control text-paper"
            >
              <X className="size-5" strokeWidth={1.75} />
            </button>
            {rail}
          </aside>
        </div>
      ) : null}

      <section className="flex min-w-0 flex-1 flex-col bg-paper text-fg">
        <header className="flex items-center gap-2 border-b border-line px-3 py-2 md:hidden">
          <button
            type="button"
            aria-label="Mở danh sách"
            onClick={() => setMenuOpen(true)}
            className="grid size-11 place-items-center rounded-control"
          >
            <Menu className="size-5" strokeWidth={1.75} />
          </button>
          <Seal className="text-seal" />
          <p className="font-display text-xl">Airi</p>
        </header>

        <div ref={scrollerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-end px-5 pt-16 pb-8 md:justify-center md:px-8">
              <p className="rise font-display text-sm tracking-widest text-seal uppercase">
                Airi
              </p>
              <h1 className="rise mt-3 font-display text-5xl leading-none text-balance text-fg">
                Nói chuyện với mình.
              </h1>
              <p className="rise mt-4 max-w-md text-pretty text-muted" style={{ animationDelay: "80ms" }}>
                Mình trả lời bằng tiếng bạn đang dùng. Ngắn khi cần, dài khi bạn muốn.
              </p>
              <div className="mt-8 space-y-2">
                {STARTERS.map((starter, index) => (
                  <button
                    key={starter.n}
                    type="button"
                    onClick={() => void send(starter.text)}
                    disabled={busy}
                    style={{ animationDelay: `${140 + index * 70}ms` }}
                    className="rise flex min-h-11 w-full items-start gap-4 rounded-card border border-line bg-paper px-4 py-3 text-left transition-transform duration-150 ease-out hover:border-seal/40 active:scale-[0.96] disabled:opacity-60"
                  >
                    <span className="font-display text-lg text-seal italic">{starter.n}</span>
                    <span className="pt-0.5 text-pretty">{starter.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-8 md:px-8">
              {messages.map((message) => (
                <li key={message.id} className={message.role === "user" ? "flex justify-end" : ""}>
                  {message.role === "user" ? (
                    <p className="max-w-lg rounded-card bg-line px-4 py-3 text-pretty leading-relaxed">
                      {message.content}
                    </p>
                  ) : (
                    <div className="group min-w-0">
                      <div className="mb-2 flex items-center gap-2 text-seal">
                        <span className="font-display text-sm italic">Airi</span>
                      </div>
                      {message.status === "streaming" && !message.content ? (
                        <p className="text-muted">Airi đang nghĩ…</p>
                      ) : message.status === "error" && !message.content.includes("\n") ? (
                        <p className="text-pretty text-seal">{message.content}</p>
                      ) : (
                        <MessageBody text={message.content} />
                      )}
                      {message.status === "streaming" && message.content ? (
                        <span className="caret" aria-hidden />
                      ) : null}
                      {message.content && message.status !== "streaming" ? (
                        <button
                          type="button"
                          onClick={() => void copyMessage(message)}
                          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm text-muted opacity-100 transition-transform duration-150 ease-out active:scale-[0.96] md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                        >
                          {copiedId === message.id ? (
                            <Check className="size-4" strokeWidth={1.75} />
                          ) : (
                            <Copy className="size-4" strokeWidth={1.75} />
                          )}
                          {copiedId === message.id ? "Đã chép" : "Chép"}
                        </button>
                      ) : null}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        <form
          className="border-t border-line px-4 pt-3 pb-14"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-card border border-line px-2 py-2">
            <label className="sr-only" htmlFor="airi-draft">
              Nhắn cho Airi
            </label>
            <textarea
              id="airi-draft"
              ref={inputRef}
              rows={1}
              value={draft}
              enterKeyHint="send"
              placeholder="Nhắn cho Airi"
              onChange={(event) => {
                setDraft(event.target.value);
                resizeInput();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-relaxed outline-none placeholder:text-muted"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Dừng"
                className="grid size-11 shrink-0 place-items-center rounded-control bg-seal text-paper transition-transform duration-150 ease-out active:scale-[0.96]"
              >
                <Square className="size-4" strokeWidth={1.75} />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="Gửi"
                disabled={!draft.trim()}
                className="grid size-11 shrink-0 place-items-center rounded-control bg-seal text-paper transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40"
              >
                <Send className="size-4" strokeWidth={1.75} />
              </button>
            )}
          </div>
          <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-muted">
            Enter để gửi · Shift+Enter xuống dòng
          </p>
        </form>
      </section>
    </div>
  );
}
