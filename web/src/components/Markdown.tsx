import { Fragment, type ReactNode } from "react";
import { Flag } from "lucide-react";

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\[[A-Z]+-\d+\/[A-Z]\d+\]|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\^[^\]]+\])/g;
  let last = 0, i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0], k = `${keyBase}-${i++}`;
    if (/^\[[A-Z]+-\d+\/[A-Z]\d+\]$/.test(t)) out.push(<sup key={k} className="ml-0.5 px-1 py-px rounded bg-[#FFF6CC] border border-[#F5DC6E] text-[10px] font-medium text-gold whitespace-nowrap align-super">{t.slice(1, -1)}</sup>);
    else if (t.startsWith("**")) out.push(<b key={k}>{inline(t.slice(2, -2), k)}</b>);
    else if (t.startsWith("[^")) { const n = t.slice(2, -1); out.push(<a key={k} href={`#fn${n}`} className="fnref">{n}</a>); }
    else if (t.startsWith("`")) out.push(<code key={k} className="px-1 rounded bg-[#F4F1EC] text-[13px]">{t.slice(1, -1)}</code>);
    else out.push(<i key={k}>{t.slice(1, -1)}</i>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Tiny markdown: #/## headings, > callout, - and 1. lists, **bold**, *italic*, `code`, [^n] footnotes. */
export default function Markdown({ md }: { md: string }) {
  const lines = md.replace(/\r/g, "").split("\n");
  const foot: [string, string][] = [];
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushPara = () => { if (para.length) { blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(" "), `p${blocks.length}`)}</p>); para = []; } };
  const flushList = () => {
    if (!list) return;
    const k = `l${blocks.length}`;
    const items = list.items.map((t, i) => <li key={i}>{inline(t, `${k}-${i}`)}</li>);
    blocks.push(list.ordered
      ? <ol key={k} className="space-y-2 list-decimal pl-5 marker:text-sub">{items}</ol>
      : <ul key={k} className="space-y-2 list-disc pl-5 marker:text-[#B7AF9F]">{items}</ul>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/))) { flushPara(); flushList(); foot.push([m[1], m[2]]); continue; }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushPara(); flushList();
      blocks.push(m[1].length === 1
        ? <h2 key={`h${blocks.length}`} className="serif text-[28px] leading-8 text-ink">{inline(m[2], `h${blocks.length}`)}</h2>
        : <h2 key={`h${blocks.length}`} className="text-[17px] font-semibold text-ink">{inline(m[2], `h${blocks.length}`)}</h2>);
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara(); flushList();
      blocks.push(
        <div key={`q${blocks.length}`} className="rounded-xl bg-red-bg border border-red-bd px-4 py-3 text-[14px] leading-6 text-red-t flex gap-2">
          <Flag className="w-4 h-4 mt-[3px] shrink-0" aria-hidden="true" /><span>{inline(m[1], `q${blocks.length}`)}</span>
        </div>,
      );
      continue;
    }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { flushPara(); if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flushPara(); if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; } list.items.push(m[1]); continue; }
    flushList(); para.push(line.trim());
  }
  flushPara(); flushList();
  return (
    <>
      <div className="text-[15px] leading-[26px] text-[#3A3833] space-y-4 max-w-[640px]">
        {blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}
      </div>
      {foot.length > 0 && (
        <footer className="mt-8 pt-4 border-t border-line text-[12px] text-sub space-y-1" aria-label="Sources">
          {foot.map(([n, t]) => <p key={n} id={`fn${n}`}><b className="text-ink">{n}</b> {inline(t, `f${n}`)}</p>)}
        </footer>
      )}
    </>
  );
}
