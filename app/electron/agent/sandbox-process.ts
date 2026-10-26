import { spawn } from 'node:child_process'
import os from 'node:os'
import { StringDecoder } from 'node:string_decoder'
import { commandShell } from './cli-path'
import { terminateChildProcess } from './child-process-lifecycle'
import type { SandboxProfileId, SandboxedCommandResult } from './sandbox-types'

export function runSandboxProcess(argv: string[], opts: { cwd: string; timeoutMs?: number; maxBuffer?: number; sandboxed: boolean; profile: SandboxedCommandResult['profile']; implementation: SandboxedCommandResult['implementation']; signal?: AbortSignal; privateTemp?: string }): Promise<SandboxedCommandResult> {
  return new Promise((resolve) => {
    const [cmd, ...args] = argv
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...sandboxCommandEnv(opts.cwd), ...(opts.privateTemp ? { TMPDIR: opts.privateTemp } : {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    })
    const started = Date.now()
    const maxBuffer = opts.maxBuffer ?? 8 * 1024 * 1024
    let stdout = ''
    let stderr = ''
    let killed = false
    let aborted = false
    let overflowed = false
    const terminate = () => terminateChildProcess(child, {
      processGroup: process.platform !== 'win32', graceMs: 1_000,
    })
    const timer = setTimeout(() => {
      killed = true
      terminate()
    }, opts.timeoutMs ?? 120_000)
    const onAbort = () => {
      if (aborted) return
      aborted = true
      clearTimeout(timer)
      terminate()
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    if (opts.signal?.aborted) onAbort()
    // Per-stream decoders buffer partial multi-byte sequences across chunk boundaries, so emoji/CJK
    // split across two 'data' events don't decode to U+FFFD replacement chars.
    const outDecoder = new StringDecoder('utf8')
    const errDecoder = new StringDecoder('utf8')
    const append = (kind: 'stdout' | 'stderr', chunk: Buffer) => {
      const text = (kind === 'stdout' ? outDecoder : errDecoder).write(chunk)
      if (kind === 'stdout') stdout = (stdout + text).slice(0, maxBuffer)
      else stderr = (stderr + text).slice(0, maxBuffer)
      if (stdout.length + stderr.length >= maxBuffer && !overflowed) {
        overflowed = true
        // Cancel the unrelated timeout timer so it doesn't double-fire later, then run the same
        // SIGTERM-now/SIGKILL-after-grace-period escalation the timeout path uses, so a child that
        // traps/ignores SIGTERM doesn't linger until the original (possibly much longer) timeout.
        // Note: `child.killed` reflects whether a signal was *sent*, not whether the process has
        // actually exited yet — checking `exitCode`/`signalCode` (only set once 'exit' fires) is
        // what correctly detects a child that is still alive after ignoring SIGTERM.
        clearTimeout(timer)
        terminate()
      }
    }
    child.stdout.on('data', (chunk) => append('stdout', chunk))
    child.stderr.on('data', (chunk) => append('stderr', chunk))
    child.on('error', (error) => {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      resolve({ code: 127, stdout, stderr: error.message, sandboxed: opts.sandboxed, profile: opts.profile, implementation: opts.implementation })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      const timed = killed && !aborted ? `Timed out after ${Math.round((Date.now() - started) / 1000)}s.` : ''
      const cancelled = aborted ? 'Cancelled by the user.' : ''
      const sig = signal ? `Terminated by ${signal}.` : ''
      resolve({
        code: code ?? (aborted ? 130 : killed ? 124 : 1),
        stdout,
        stderr: [stderr.trim(), cancelled, timed, sig].filter(Boolean).join('\n'),
        sandboxed: opts.sandboxed,
        profile: opts.profile,
        implementation: opts.implementation,
      })
    })
  })
}

export function sandboxCommandEnv(cwd: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin',
    SHELL: commandShell(),
    HOME: cwd,
    TMPDIR: process.env.TMPDIR || os.tmpdir(),
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || process.env.LANG || 'C.UTF-8',
  }
  return env
}
