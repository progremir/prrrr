import crypto from "node:crypto"
import { createFileRoute } from "@tanstack/react-router"
import { ingestGitHubEvent } from "@/lib/github-webhook"

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET

function timingSafeEqual(a: string, b: string) {
  const bufferA = Buffer.from(a, `utf8`)
  const bufferB = Buffer.from(b, `utf8`)

  if (bufferA.length !== bufferB.length) {
    return false
  }

  return crypto.timingSafeEqual(bufferA, bufferB)
}

function verifySignature(secret: string, body: string, signatureHeader: string) {
  const expected = `sha256=${crypto.createHmac(`sha256`, secret).update(body).digest(`hex`)}`
  return timingSafeEqual(signatureHeader, expected)
}

async function handlePost({ request }: { request: Request }) {
  if (!WEBHOOK_SECRET) {
    console.error(`GITHUB_WEBHOOK_SECRET is not configured`)
    return new Response(JSON.stringify({ error: `Webhook secret not configured` }), {
      status: 500,
      headers: { "content-type": `application/json` },
    })
  }

  const eventName = request.headers.get(`x-github-event`)
  const deliveryId = request.headers.get(`x-github-delivery`)
  const signatureHeader = request.headers.get(`x-hub-signature-256`)

  if (!eventName || !deliveryId || !signatureHeader) {
    return new Response(JSON.stringify({ error: `Missing GitHub webhook headers` }), {
      status: 400,
      headers: { "content-type": `application/json` },
    })
  }

  const rawBody = await request.text()

  if (!verifySignature(WEBHOOK_SECRET, rawBody, signatureHeader)) {
    return new Response(JSON.stringify({ error: `Invalid signature` }), {
      status: 401,
      headers: { "content-type": `application/json` },
    })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch (error) {
    console.error(`Failed to parse GitHub webhook payload`, error)
    return new Response(JSON.stringify({ error: `Invalid JSON payload` }), {
      status: 400,
      headers: { "content-type": `application/json` },
    })
  }

  if (eventName === `ping`) {
    return new Response(JSON.stringify({ status: `ok` }), {
      status: 200,
      headers: { "content-type": `application/json` },
    })
  }

  const action = typeof payload.action === `string` ? payload.action : null

  try {
    const result = await ingestGitHubEvent({
      deliveryId,
      eventName,
      action,
      payload,
    })

    return new Response(
      JSON.stringify({ status: `ok`, processed: !result.alreadyProcessed, eventStatus: result.status }),
      {
        status: 200,
        headers: { "content-type": `application/json` },
      }
    )
  } catch (error) {
    console.error(`Failed to process GitHub webhook ${deliveryId} (${eventName})`, error)
    return new Response(
      JSON.stringify({ error: `Failed to process webhook`, details: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { "content-type": `application/json` },
      }
    )
  }
}

export const Route = createFileRoute(`/api/github-webhook`)({
  server: {
    handlers: {
      POST: handlePost,
    },
  },
})
