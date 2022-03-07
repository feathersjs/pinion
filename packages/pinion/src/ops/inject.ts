import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { PinionContext, Callable, getCallable } from '../core'
import { EOL } from 'os'

const EOLRegex = /\r?\n/

export type Location<C extends PinionContext> = (lines: string[], ctx: C) => Promise<{ index: number, pattern?: string | RegExp | undefined }>

export const inject = <C extends PinionContext> (template: Callable<string, C>, location: Location<C>, target: Callable<string, C>) =>
  async <T extends C> (ctx: T) => {
    const fileName = await getCallable(target, ctx)
    const content = await getCallable(template, ctx)

    // const { force, logger, prompt } = ctx.pinion

    if (!existsSync(fileName)) {
      throw new Error(`Cannot inect to '${fileName}'. The file doesn't exist.`)
    }

    const fileContent = (await readFile(fileName)).toString()

    const NL = newline(fileContent)
    const lines = fileContent.split(NL)

    const { index } = await location(lines, ctx)

    if (index >= 0) {
      lines.splice(index, 0, content)
    }

    const newContent = lines.join(NL)

    await writeFile(fileName, newContent)

    return ctx
  }

const getLineNumber = (
  pattern: string | RegExp,
  lines: string[],
  isBefore: boolean
) => {
  const oneLineMatchIndex = lines.findIndex((l) => l.match(pattern))

  if (oneLineMatchIndex < 0) {
    const fullText = lines.join('\n')
    const fullMatch = fullText.match(new RegExp(pattern, 'm'))

    if (fullMatch && fullMatch.length) {
      if (isBefore) {
        const fullTextUntilMatchStart = fullText.substring(0, fullMatch.index)
        return fullTextUntilMatchStart.split(EOLRegex).length - 1
      }
      const matchEndIndex = (fullMatch.index || 0) + fullMatch.toString().length
      const fullTextUntilMatchEnd = fullText.substring(0, matchEndIndex)
      return fullTextUntilMatchEnd.split(EOLRegex).length
    }
  }

  return oneLineMatchIndex + (isBefore ? 0 : 1)
}

export const before = <C extends PinionContext> (pattern: Callable<string | RegExp, C>) => async (lines: string[], ctx: any) => {
  const line = await getCallable(pattern, ctx)
  const index = getLineNumber(line, lines, true)
  return { index, pattern: line }
}

export const after = <C extends PinionContext> (pattern: Callable<string | RegExp, C>) => async (lines: string[], ctx: any) => {
  const line = await getCallable(pattern, ctx)
  const index = getLineNumber(line, lines, false)
  return { index, pattern: line }
}

export const prepend = () => async () => {
  return { index: 0 }
}

export const append = () => async (lines: string[]) => {
  return { index: lines.length }
}

const newline = (str: string) => {
  const newlines = str.match(/(?:\r?\n)/g) || []

  if (newlines.length === 0) {
    return EOL
  }

  const crlf = newlines.filter((newline) => newline === '\r\n').length
  const lf = newlines.length - crlf

  return crlf > lf ? '\r\n' : '\n'
}