import { existsSync } from 'node:fs'
import path from 'node:path'

import { getConfig, startAgent, stopAgent } from '../src/services/api'

/**
 * These paths used to be proxied straight to the Python backend via
 * `next.config.ts`'s `rewrites()`, unauthenticated — anyone who could reach
 * the deployment could start a billed Agora/Gemini session. Each now has its
 * own `app/api/.../route.ts` handler requiring a signed-in caller before
 * forwarding to the backend (see `next.config.ts`'s own comment on why the
 * rewrite was removed rather than left as dead weight next to it).
 *
 * This check asserts the route handler actually exists for each — the
 * regression this guards against is someone removing one of these files
 * while "cleaning up" and reintroducing an unauthenticated path to a
 * cost-bearing backend call with no compile error to catch it.
 */
const AUTHENTICATED_BACKEND_PROXY_PATHS = [
  'get_config',
  'startAgent',
  'stopAgent',
  'panelState',
  'getAssessment',
  'analyzeResume',
  'matchJobs',
]

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === 'string' || input instanceof URL) {
    return new URL(input, 'http://localhost:3000')
  }
  return new URL(input.url)
}

function getRequestBody(init: RequestInit | undefined) {
  assert(typeof init?.body === 'string', 'POST request should include a JSON string body')
  return JSON.parse(init.body) as Record<string, unknown>
}

function verifyAuthenticatedRouteHandlersExist() {
  for (const routeName of AUTHENTICATED_BACKEND_PROXY_PATHS) {
    const routeFile = path.join(process.cwd(), 'app', 'api', routeName, 'route.ts')
    assert(
      existsSync(routeFile),
      `${routeFile} should exist — this path forwards to a cost-bearing backend call and must stay behind an authenticated route handler, not a bare next.config.ts rewrite.`,
    )
  }
}

async function verifyApiClientRequests() {
  const originalFetch = globalThis.fetch
  const seenPaths: string[] = []

  globalThis.fetch = (async (input, init) => {
    const url = requestUrl(input)
    seenPaths.push(url.pathname)

    if (url.pathname === '/api/get_config') {
      assert(init?.method === 'GET', 'GET /api/get_config should use GET')
      assert(url.searchParams.get('uid') === '1234', 'GET /api/get_config should pass the requested uid')
      assert(
        url.searchParams.get('channel') === 'test-channel',
        'GET /api/get_config should pass the requested channel',
      )

      return Response.json({
        code: 0,
        data: {
          app_id: 'stub-app-id',
          token: 'stub-token',
          uid: '1234',
          channel_name: 'test-channel',
          agent_uid: '9999',
        },
        msg: 'success',
      })
    }

    if (url.pathname === '/api/startAgent') {
      assert(init?.method === 'POST', 'POST /api/startAgent should use POST')
      const body = getRequestBody(init)
      assert(body.channelName === 'test-channel', 'POST /api/startAgent should include channelName')
      assert(body.rtcUid === 9999, 'POST /api/startAgent should include rtcUid')
      assert(body.userUid === 1234, 'POST /api/startAgent should include userUid')

      return Response.json({
        code: 0,
        data: {
          agent_id: 'mock-agent-id',
          channel_name: 'test-channel',
          status: 'started',
        },
        msg: 'success',
      })
    }

    if (url.pathname === '/api/stopAgent') {
      assert(init?.method === 'POST', 'POST /api/stopAgent should use POST')
      const body = getRequestBody(init)
      assert(body.agentId === 'mock-agent-id', 'POST /api/stopAgent should include agentId')
      return Response.json({ code: 0, msg: 'success' })
    }

    return Response.json({ detail: `Unexpected request path: ${url.pathname}` }, { status: 404 })
  }) as typeof fetch

  try {
    const config = await getConfig({ uid: 1234, channel: 'test-channel' })
    assert(config.token === 'stub-token', 'GET /api/get_config should return response data')

    const agentId = await startAgent('test-channel', 9999, 1234)
    assert(agentId === 'mock-agent-id', 'POST /api/startAgent should return the agent id')

    await stopAgent(agentId)

    assert(
      JSON.stringify(seenPaths) === JSON.stringify(['/api/get_config', '/api/startAgent', '/api/stopAgent']),
      'API client should call the unversioned /api paths',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
}

async function main() {
  verifyAuthenticatedRouteHandlersExist()
  await verifyApiClientRequests()
  console.log('API contract checks passed')
}

await main()
