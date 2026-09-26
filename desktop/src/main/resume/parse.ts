import { writeFileSync } from 'fs'
import { join } from 'path'
import { paths } from '../store/paths'

/**
 * Parse an uploaded resume to plain text.
 * Supports PDF (via pdf-parse) and plain text. The original file is saved
 * to the resumes dir so it can be uploaded to application forms later.
 */
export async function parseResume(bytes: Buffer, name: string): Promise<{ text: string; savedPath: string }> {
  const savedPath = join(paths.resumes(), sanitize(name))
  writeFileSync(savedPath, bytes)

  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) {
    // pdf-parse is CJS; import dynamically to keep it external at build time
    const pdfParse = (await import('pdf-parse')).default as (b: Buffer) => Promise<{ text: string }>
    const data = await pdfParse(bytes)
    return { text: cleanup(data.text), savedPath }
  }
  if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    return { text: cleanup(bytes.toString('utf-8')), savedPath }
  }
  // DOCX and others: not yet parsed (needs mammoth). Save file, return best-effort text.
  return {
    text: cleanup(bytes.toString('utf-8').replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ')),
    savedPath
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function cleanup(t: string): string {
  return t.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
}
