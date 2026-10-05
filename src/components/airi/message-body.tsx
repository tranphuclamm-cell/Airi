import type { ReactNode } from "react";

type Block =
  | { type: "code"; lang: string; text: string }
  | { type: "prose"; text: string };

function splitFences(source: string): Block[] {
  const blocks: Block[] = [];
  const parts = source.split("```");
  parts.forEach((part, index) => {
    if (index % 2 === 0) {
      if (part) blocks.push({ type: "prose", text: part });
      return;
    }
    const breakAt = part.indexOf("\n");
    if (breakAt === -1) {
      blocks.push({ type: "code", lang: part.trim(), text: "" });
      return;
    }
    blocks.push({
      type: "code",
      lang: part.slice(0, breakAt).trim(),
      text: part.slice(breakAt + 1).replace(/\n$/, ""),
    });
  });
  return blocks;
}

function renderInline(text: string, key: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${key}-b${index}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={`${key}-c${index}`} className="rounded-md bg-line px-1 font-mono text-sm">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (link) {
        nodes.push(
          <a
            key={`${key}-a${index}`}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-seal/40 underline-offset-2"
          >
            {link[1]}
          </a>,
        );
      }
    }
    last = start + token.length;
    index += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Prose({ text }: { text: string }) {
  const lines = text.replace(/\n$/, "").split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const content = renderInline(heading[2] ?? "", `h${index}`);
      const className =
        level === 1
          ? "font-display text-2xl leading-tight text-balance"
          : "font-display text-xl leading-tight text-balance";
      nodes.push(
        level === 1 ? (
          <h2 key={index} className={className}>
            {content}
          </h2>
        ) : (
          <h3 key={index} className={className}>
            {content}
          </h3>
        ),
      );
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^[-*]\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ul key={`ul${index}`} className="list-disc space-y-1 pl-5">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, `ul${index}-${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ol key={`ol${index}`} className="list-decimal space-y-1 pl-5">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, `ol${index}-${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() &&
      !/^#{1,3}\s+/.test(lines[index] ?? "") &&
      !/^[-*]\s+/.test(lines[index] ?? "") &&
      !/^\d+\.\s+/.test(lines[index] ?? "") &&
      !(lines[index] ?? "").startsWith("```")
    ) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    nodes.push(
      <p key={`p${index}`}>{renderInline(paragraph.join(" "), `p${index}`)}</p>,
    );
  }

  return <>{nodes}</>;
}

export function MessageBody({ text }: { text: string }) {
  const blocks = splitFences(text);
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-3 text-pretty leading-relaxed">
      {blocks.map((block, index) =>
        block.type === "code" ? (
          <pre
            key={index}
            className="overflow-x-auto rounded-control bg-ink px-4 py-3 text-sm text-paper"
          >
            {block.lang ? (
              <div className="mb-2 font-sans text-xs tracking-wide text-paper/55">{block.lang}</div>
            ) : null}
            <code className="font-mono">{block.text}</code>
          </pre>
        ) : (
          <Prose key={index} text={block.text} />
        ),
      )}
    </div>
  );
}
