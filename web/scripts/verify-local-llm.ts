import { existsSync } from 'node:fs'
import path from 'node:path'

type BunRuntime = typeof globalThis & {
  Bun: {
    sleep: (ms: number) => Promise<void>
    spawn: (options: {
      cmd: string[]
      cwd: string
      env: Record<string, string | undefined>
      stdout: 'ignore'
      stderr: 'pipe'
    }) => {
      kill: () => void
      exited: Promise<number>
      exitCode: number | null
      stderr: ReadableStream<Uint8Array> | null
    }
    spawnSync: (options: {
      cmd: string[]
      cwd: string
      stderr: 'pipe'
      stdout: 'ignore'
    }) => {
      exitCode: number
      stderr: { toString: () => string }
    }
  }
}

const bunRuntime = globalThis as BunRuntime

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function waitForHealthy(baseUrl: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let lastError = 'custom LLM server did not start'

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) {
        return
      }
      lastError = `health returned ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }

    await bunRuntime.Bun.sleep(250)
  }

  throw new Error(`Timed out waiting for custom LLM server: ${lastError}`)
}

async function main() {
  const projectRoot = process.cwd() // web/
  const serverRoot = path.resolve(projectRoot, '..', 'server')
  const venvPython = path.join(serverRoot, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')

  if (!existsSync(venvPython)) {
    throw new Error('Missing server virtualenv. Run bun run setup:server before verify:local:llm.')
  }

  const dependencyCheck = bunRuntime.Bun.spawnSync({
    cmd: [venvPython, '-c', 'import dotenv, fastapi, uvicorn'],
    cwd: serverRoot,
    stderr: 'pipe',
    stdout: 'ignore',
  })
  if (dependencyCheck.exitCode !== 0) {
    const stderr = dependencyCheck.stderr.toString().trim()
    throw new Error(
      `The server virtualenv is missing required packages. Run bun run setup:server before verify:local:llm.${stderr ? ` Python said: ${stderr}` : ''}`,
    )
  }

  const port = 43160 + Math.floor(Math.random() * 20)
  const baseUrl = `http://127.0.0.1:${port}`

  const llmProcess = bunRuntime.Bun.spawn({
    cmd: [venvPython, 'src/llm.py'],
    cwd: serverRoot,
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdout: 'ignore',
    stderr: 'pipe',
  })

  try {
    await waitForHealthy(baseUrl, 10_000)

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer any-key-here',
      },
      body: JSON.stringify({
        model: 'mock-model',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      }),
    })

    assert(response.status === 200, 'POST /chat/completions should return 200 for a streaming request')
    assert(
      (response.headers.get('content-type') ?? '').includes('text/event-stream'),
      'POST /chat/completions should return a text/event-stream response',
    )

    const body = await response.text()
    assert(
      body.includes('"role": "assistant"') || body.includes('"role":"assistant"'),
      'SSE stream should open with an assistant role delta',
    )
    assert(
      body.includes('"finish_reason": "stop"') || body.includes('"finish_reason":"stop"'),
      'SSE stream should close the choice with finish_reason "stop"',
    )
    assert(body.trimEnd().endsWith('data: [DONE]'), 'SSE stream should terminate with data: [DONE]')

    const nonStream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mock-model',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
      }),
    })
    assert(nonStream.status === 400, 'Non-streaming requests should be rejected with 400')

    console.log('Custom LLM endpoint contract check passed')
  } finally {
    llmProcess.kill()
    await llmProcess.exited

    if (llmProcess.exitCode && llmProcess.exitCode !== 0) {
      const stderr = await new Response(llmProcess.stderr).text()
      if (stderr.trim()) {
        console.error(stderr.trim())
      }
    }
  }
}

await main()
