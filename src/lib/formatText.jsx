import { useMemo, useState } from 'react'
import { copyToClipboard } from './messageUtils'

// WhatsApp-style formatting, done safely (no raw HTML is ever inserted):
//   *bold*  _italic_  ~strike~  `code`  ```code block```
//   - bullet   1. numbered   > quote   and links (https://...)
// **double-star bold** is also understood, because AI models often write it.

const INLINE_RE =
  /`([^`\n]+)`|\*\*([^\n]+?)\*\*|\*([^\s*](?:[^*\n]*?[^\s*])?)\*|_([^\s_](?:[^_\n]*?[^\s_])?)_|~([^\s~](?:[^~\n]*?[^\s~])?)~|(https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]])/g

const WORD_CHAR = /[\p{L}\p{N}]/u

function renderInline(text, onPrimary, keyPrefix) {
  const re = new RegExp(INLINE_RE.source, 'g')
  const out = []
  let last = 0
  let n = 0
  let m

  while ((m = re.exec(text)) !== null) {
    const start = m.index
    const end = start + m[0].length
    const isCodeOrLink = m[1] !== undefined || m[6] !== undefined

    // Marks only count at a word edge, so snake_case_names and 5*3*2 stay as typed.
    if (!isCodeOrLink) {
      const before = start > 0 ? text[start - 1] : ''
      const after = end < text.length ? text[end] : ''
      if ((before && WORD_CHAR.test(before)) || (after && WORD_CHAR.test(after))) {
        re.lastIndex = start + 1
        continue
      }
    }

    if (start > last) out.push(text.slice(last, start))
    const key = `${keyPrefix}-${n++}`

    if (m[1] !== undefined) {
      out.push(
        <code
          key={key}
          className={`rounded px-1 py-0.5 font-mono text-[0.88em] ${
            onPrimary ? 'bg-white/20' : 'bg-slate-200/80 text-slate-800'
          }`}
        >
          {m[1]}
        </code>
      )
    } else if (m[2] !== undefined || m[3] !== undefined) {
      out.push(<strong key={key}>{renderInline(m[2] ?? m[3], onPrimary, key)}</strong>)
    } else if (m[4] !== undefined) {
      out.push(<em key={key}>{renderInline(m[4], onPrimary, key)}</em>)
    } else if (m[5] !== undefined) {
      out.push(<s key={key}>{renderInline(m[5], onPrimary, key)}</s>)
    } else if (m[6] !== undefined) {
      out.push(
        <a
          key={key}
          href={m[6]}
          target="_blank"
          rel="noreferrer noopener"
          className={`break-all underline underline-offset-2 ${onPrimary ? 'text-white' : 'text-primary'}`}
        >
          {m[6]}
        </a>
      )
    }

    last = end
  }

  if (last < text.length) out.push(text.slice(last))
  return out
}

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (await copyToClipboard(code)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div className="my-1 overflow-hidden rounded-xl bg-slate-900 text-slate-100">
      <div className="flex items-center justify-between px-3 py-1 text-[11px] text-slate-400">
        <span>code</span>
        <button type="button" onClick={handleCopy} className="rounded px-1.5 py-0.5 hover:bg-white/10">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 pb-3 pt-1 text-[13px] leading-snug">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  )
}

const BULLET_RE = /^\s*(?:[-•]|\*)\s+(.*)$/
const NUMBER_RE = /^\s*(\d{1,3})[.)]\s+(.*)$/
const QUOTE_RE = /^\s*>\s?(.*)$/

function renderTextBlock(value, onPrimary, keyPrefix) {
  const lines = value.split('\n')
  const out = []
  let i = 0
  let n = 0

  while (i < lines.length) {
    const line = lines[i]
    const key = `${keyPrefix}-${n++}`

    if (BULLET_RE.test(line)) {
      const items = []
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(lines[i].match(BULLET_RE)[1])
        i++
      }
      out.push(
        <ul key={key} className="list-disc space-y-0.5 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, onPrimary, `${key}-${idx}`)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (NUMBER_RE.test(line)) {
      const start = Number(line.match(NUMBER_RE)[1])
      const items = []
      while (i < lines.length && NUMBER_RE.test(lines[i])) {
        items.push(lines[i].match(NUMBER_RE)[2])
        i++
      }
      out.push(
        <ol key={key} start={start} className="list-decimal space-y-0.5 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, onPrimary, `${key}-${idx}`)}</li>
          ))}
        </ol>
      )
      continue
    }

    if (QUOTE_RE.test(line)) {
      const quoted = []
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoted.push(lines[i].match(QUOTE_RE)[1])
        i++
      }
      out.push(
        <blockquote
          key={key}
          className={`border-l-4 pl-2.5 ${onPrimary ? 'border-white/60 text-white/90' : 'border-slate-300 text-slate-600'}`}
        >
          {quoted.map((q, idx) => (
            <p key={idx}>{renderInline(q, onPrimary, `${key}-${idx}`)}</p>
          ))}
        </blockquote>
      )
      continue
    }

    if (line.trim() === '') {
      out.push(<div key={key} className="h-1.5" />)
    } else {
      out.push(<p key={key}>{renderInline(line, onPrimary, key)}</p>)
    }
    i++
  }

  return out
}

function renderBlocks(text, onPrimary) {
  const source = text.trim()
  const out = []
  const fence = /```([\s\S]*?)```/g
  let last = 0
  let n = 0
  let m

  while ((m = fence.exec(source)) !== null) {
    if (m.index > last) {
      out.push(...renderTextBlock(source.slice(last, m.index).trim(), onPrimary, `t${n++}`))
    }
    let code = m[1].replace(/^\n/, '').replace(/\n$/, '')
    // Drop a language label such as "js" on the first line of a code block.
    if (/^[a-zA-Z0-9+#-]{1,12}\n/.test(code)) code = code.replace(/^[^\n]*\n/, '')
    out.push(<CodeBlock key={`c${n++}`} code={code} />)
    last = m.index + m[0].length
  }

  if (last < source.length) {
    out.push(...renderTextBlock(source.slice(last).trim(), onPrimary, `t${n}`))
  }

  return out
}

export default function FormattedText({ text, onPrimary = false }) {
  const content = useMemo(() => renderBlocks(text || '', onPrimary), [text, onPrimary])
  return <div className="space-y-1 break-words">{content}</div>
}