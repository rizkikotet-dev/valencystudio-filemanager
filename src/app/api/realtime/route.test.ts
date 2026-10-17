import assert from 'node:assert/strict'
import { GET, POST } from '@/app/api/realtime/route'
import { NextRequest } from 'next/server'
import { realtimeHub } from '@/lib/realtime-hub'

async function run() {
  // Test 1: GET connects SSE stream
  const req = new NextRequest('http://localhost:3000/api/realtime?userId=test-user&privileged=1')
  const res = await GET(req)

  assert.equal(res.status, 200)
  assert.equal(res.headers.get('Content-Type'), 'text/event-stream; charset=utf-8')
  assert.equal(res.headers.get('Cache-Control'), 'no-cache, no-transform, no-store')
  assert.equal(realtimeHub.clientCount(), 1)

  // Test 2: POST /api/realtime without auth should be 403
  const badPostReq = new NextRequest('http://localhost:3000/api/realtime', {
    method: 'POST',
    body: JSON.stringify({ domains: ['files'] }),
  })
  const badPostRes = await POST(badPostReq)
  assert.equal(badPostRes.status, 403)

  // Test 3: POST /api/realtime with auth key should broadcast
  const goodPostReq = new NextRequest('http://localhost:3000/api/realtime', {
    method: 'POST',
    headers: {
      'x-internal-key': process.env.REALTIME_INTERNAL_KEY || 'vs-internal-key',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ domains: ['files'], rooms: ['user:test-user'] }),
  })
  const goodPostRes = await POST(goodPostReq)
  assert.equal(goodPostRes.status, 200)
  const json = await goodPostRes.json()
  assert.equal(json.ok, true)
  assert.equal(json.delivered, 1)

  // Cleanup: abort request to trigger SSE cleanup
  req.signal.dispatchEvent(new Event('abort'))
  assert.equal(realtimeHub.clientCount(), 0)

  console.log('route.test.ts: PASS')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
