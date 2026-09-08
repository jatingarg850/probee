'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { AlertCircle, Buildings, Check, ChevronRight, GripHorizontal } from '@/components/ui/icons'
import { LoadingDots } from '@/components/ui/loading-dots'
import { useAuth } from '@/contexts/AuthContext'
import { useOrgs } from '@/contexts/OrgContext'
import { authHeaders, readApiError } from '@/lib/clientAuth'
import { DEFAULT_PLAN_ID, type Plan, type PlanId, formatPrice, isPlanId } from '@/lib/plans'

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3.5 py-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10'

/** The subset of Razorpay's checkout widget this page uses. Declared here
 * rather than pulled from a types package, so the integration stays a single
 * script tag with no extra dependency. */
interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  order_id: string
  name: string
  description: string
  prefill?: { name?: string; email?: string }
  theme?: { color?: string }
  handler: (response: {
    razorpay_payment_id: string
    razorpay_order_id: string
    razorpay_signature: string
  }) => void
  modal?: { ondismiss?: () => void }
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void }
  }
}

interface BillingInfo {
  configured: boolean
  testMode: boolean
  currency: string
  plans: Plan[]
}

export function CreateOrgPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { refresh } = useOrgs()

  const [name, setName] = useState('')
  const [planId, setPlanId] = useState<PlanId>(DEFAULT_PLAN_ID)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<'idle' | 'starting' | 'paying' | 'verifying'>('idle')
  const [billing, setBilling] = useState<BillingInfo | null>(null)
  const [scriptReady, setScriptReady] = useState(false)

  // Sliding guide panel state
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideDragPx, setGuideDragPx] = useState(0)
  const guideDragState = useRef<{ start: number; wasOpen: boolean } | null>(null)

  // The pricing page links here with the tier the visitor picked. Read from
  // `window` rather than `useSearchParams()`, which would pull this route out
  // of static prerendering for a value only ever needed after mount.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('plan')
    if (isPlanId(requested)) setPlanId(requested)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/billing/order', { headers: authHeaders() })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setBilling(data)
      })
      .catch(() => {
        if (!cancelled) setBilling({ configured: false, testMode: false, currency: 'INR', plans: [] })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const busy = stage !== 'idle'
  const notConfigured = billing !== null && !billing.configured
  const plans = billing?.plans ?? []
  const selected = plans.find((plan) => plan.id === planId) ?? null
  // `scale` is sales-led. Selecting it here is a dead end by design — the
  // server rejects a purchase of it, so the UI says so instead of opening a
  // checkout that will fail.
  const salesLed = selected !== null && selected.pricePaise === null

  // Drag handling for guide panel
  const beginPanelHandleDrag = (coord: number) => {
    guideDragState.current = { start: coord, wasOpen: guideOpen }
    setGuideDragPx(0)
  }

  const movePanelHandleDrag = (coord: number) => {
    if (!guideDragState.current) return
    const d = guideDragState.current.start - coord
    setGuideDragPx(Math.max(0, d))
  }

  const endPanelHandleDrag = () => {
    const drag = guideDragState.current
    guideDragState.current = null
    if (!drag) return
    const DRAG_THRESHOLD_PX = 48
    if (guideDragPx > DRAG_THRESHOLD_PX) {
      setGuideOpen(!drag.wasOpen)
    } else if (guideDragPx < 4) {
      setGuideOpen((prev) => !prev)
    }
    setGuideDragPx(0)
  }

  const handleDesktopHandlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    beginPanelHandleDrag(event.clientX)
  }

  const handleDesktopHandlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) =>
    movePanelHandleDrag(event.clientX)

  const handleMobileHandlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    beginPanelHandleDrag(event.clientY)
  }

  const handleMobileHandlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) =>
    movePanelHandleDrag(event.clientY)

  const handlePanelHandleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) return
    setGuideOpen((prev) => !prev)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || salesLed) return

    if (!name.trim()) {
      setError('Give your organisation a name.')
      return
    }
    if (!window.Razorpay) {
      setError('The payment window could not load. Check your connection and try again.')
      return
    }

    setError(null)
    setStage('starting')

    try {
      // 1. Open an order server-side. The request names a *plan*; the price
      //    attached to it is looked up there. A price the client sends is a
      //    price the client chose.
      const orderResponse = await fetch('/api/billing/order', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ planId }),
      })
      if (!orderResponse.ok) {
        throw new Error(await readApiError(orderResponse, 'Could not start the payment.'))
      }
      const { order } = await orderResponse.json()

      // 2. Hand off to Razorpay's widget. Card details go straight to them.
      setStage('paying')
      const Checkout = window.Razorpay
      if (!Checkout) throw new Error('The payment window could not load.')

      const checkout = new Checkout({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'PROBE',
        description: `${order.planName} plan — ${name.trim()}`,
        prefill: { name: user?.name, email: user?.email },
        theme: { color: '#d97757' },
        modal: {
          // Closing the widget is a change of mind, not an error.
          ondismiss: () => setStage('idle'),
        },
        handler: async (response) => {
          // 3. Verify server-side. The organisation is created there, on the
          //    plan recorded against the payment — the browser saying
          //    "payment succeeded" proves nothing, and the browser naming its
          //    own plan would let a Starter payment buy Growth.
          setStage('verifying')
          try {
            const verifyResponse = await fetch('/api/billing/verify', {
              method: 'POST',
              headers: authHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                name: name.trim(),
              }),
            })
            if (!verifyResponse.ok) {
              throw new Error(
                await readApiError(
                  verifyResponse,
                  'The payment went through but the organisation could not be created. Contact support with your payment id.',
                ),
              )
            }
            const { organization } = await verifyResponse.json()
            await refresh()
            router.push(`/orgs/${organization.id}/jobs`)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not complete the purchase.')
            setStage('idle')
          }
        },
      })
      checkout.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the payment.')
      setStage('idle')
    }
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" onLoad={() => setScriptReady(true)} />

      <div className="flex min-h-full w-full animate-fade-up flex-col text-left lg:h-full lg:min-h-0 lg:flex-row">
        {/* CENTER - Main Form Panel */}
        <div className="flex flex-1 flex-col items-center justify-center overflow-hidden bg-background px-6 py-8 pb-16 sm:px-10 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:py-10 lg:pb-10">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-[480px] space-y-6"
          >
            {/* Form Title */}
            <div>
              <h2 className="text-xl font-semibold text-foreground">Set up your organisation</h2>
              <p className="mt-1 text-sm text-muted-foreground">Fill in the details below to get started</p>
            </div>

            {/* Organisation Name Field */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Organisation name *
              </label>
              <input
                className={fieldClass}
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setError(null)
                }}
                placeholder="Acme Inc."
                maxLength={80}
                disabled={busy || notConfigured}
                aria-invalid={!!error}
              />
              <p className="text-xs text-muted-foreground">
                Usually your company name. Candidates will see this.
              </p>
            </div>

            {/* Plan Selection */}
            {plans.length > 0 ? (
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Select a plan *
                </label>
                <div className="space-y-2">
                  {plans.map((plan) => (
                    <PlanOption
                      key={plan.id}
                      plan={plan}
                      checked={plan.id === planId}
                      disabled={busy || notConfigured}
                      onSelect={() => {
                        setPlanId(plan.id)
                        setError(null)
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {/* Test Mode Alert */}
            {billing?.testMode ? (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
                <p className="text-xs leading-relaxed text-yellow-900">
                  <strong className="font-semibold">Test mode enabled.</strong> No real money moves. Use Razorpay's test card:
                  <code className="mx-1 rounded bg-yellow-100 px-1.5 py-0.5 font-mono text-[11px]">4111 1111 1111 1111</code>
                  with any future expiry and CVV.
                </p>
              </div>
            ) : null}

            {/* Not Configured Alert */}
            {notConfigured ? (
              <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <p className="text-xs leading-relaxed text-red-700">
                  Payments are not configured. Set environment variables <code className="font-mono bg-red-100 px-1 py-0.5 rounded">RAZORPAY_KEY_ID</code> and <code className="font-mono bg-red-100 px-1 py-0.5 rounded">RAZORPAY_KEY_SECRET</code> to continue.
                </p>
              </div>
            ) : null}

            {/* Error Alert */}
            {error ? (
              <div
                role="alert"
                className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <p className="text-xs leading-relaxed text-red-700">{error}</p>
              </div>
            ) : null}

            {/* Sales-Led / Submit */}
            {salesLed ? (
              <div className="rounded-lg border border-border bg-muted px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Scale is priced against your interview volume. Tell us how many candidates you expect to interview and we'll set it up.
                </p>
              </div>
            ) : (
              <Button
                type="submit"
                disabled={busy || notConfigured || !scriptReady}
                className="w-full h-11 font-semibold"
              >
                {stage === 'starting' ? (
                  <>
                    <LoadingDots />
                    <span className="ml-2">Opening checkout…</span>
                  </>
                ) : stage === 'paying' ? (
                  <>
                    <LoadingDots />
                    <span className="ml-2">Waiting for payment…</span>
                  </>
                ) : stage === 'verifying' ? (
                  <>
                    <LoadingDots />
                    <span className="ml-2">Confirming payment…</span>
                  </>
                ) : selected?.pricePaise ? (
                  `Pay ${formatPrice(selected.pricePaise, selected.currency)} and create`
                ) : (
                  'Create organisation'
                )}
              </Button>
            )}

            {/* Security Notice */}
            <p className="text-center text-xs text-muted-foreground">
              💳 Payment handled by Razorpay. Card details never reach PROBE's servers.
            </p>
          </form>
        </div>

        {/* GUIDE PANEL - Sliding sidebar */}
        <aside
          className={`flex shrink-0 flex-col justify-between overflow-hidden border-b border-border bg-card px-6 sm:px-10 transition-[max-height,padding] duration-300 ease-out lg:order-2 lg:max-h-none lg:border-b-0 lg:py-10 lg:transition-[width,padding] lg:duration-300 lg:ease-out ${
            guideOpen
              ? 'max-h-[42rem] py-8 lg:w-[25rem] lg:border-l lg:px-6 xl:w-[28rem] xl:px-10'
              : 'max-h-0 py-0 lg:w-0 lg:px-0'
          }`}
        >
          <div className="lg:w-[22rem] xl:w-[25rem]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Setup guide</span>
            <h2 className="mt-2 text-xl font-bold leading-tight tracking-tight text-foreground">
              Create an organisation
            </h2>
            <p className="mt-3 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
              An organisation is where you set up the roles you are hiring for and run candidates through them.
            </p>

            {/* What this specific plan includes */}
            {selected ? (
              <div className="mt-8 rounded-lg border border-border bg-muted p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {selected.name} plan includes
                </p>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {selected.features
                    .filter((feature) => !feature.endsWith(':'))
                    .map((feature) => (
                      <li key={feature} className="flex gap-2.5 text-xs text-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                        <span>{feature}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </div>

          <p className="mt-9 text-[12px] leading-5 text-muted-foreground">
            You will be the owner. Manage settings, invite team members, and change retention at any time.{' '}
            <Link href="/pricing" className="font-semibold text-primary hover:underline">
              Compare plans
            </Link>
          </p>
        </aside>
      </div>

      {/* Desktop right-edge handle */}
      <button
        type="button"
        aria-expanded={guideOpen}
        aria-label={guideOpen ? 'Hide setup guide' : 'Show setup guide'}
        onPointerDown={handleDesktopHandlePointerDown}
        onPointerMove={handleDesktopHandlePointerMove}
        onPointerUp={endPanelHandleDrag}
        onPointerCancel={endPanelHandleDrag}
        onClick={handlePanelHandleClick}
        className="fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 cursor-grab touch-none select-none flex-col items-center gap-2 rounded-l-xl border border-primary/30 bg-primary/12 px-2 py-4 text-primary shadow-lg transition-colors hover:bg-primary/20 active:cursor-grabbing lg:flex"
      >
        <GripHorizontal className="h-4 w-4 rotate-90" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] [writing-mode:vertical-rl]">Guide</span>
        <ChevronRight className={`h-4 w-4 transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Mobile bottom handle */}
      <button
        type="button"
        aria-expanded={guideOpen}
        aria-label={guideOpen ? 'Hide setup guide' : 'Show setup guide'}
        onPointerDown={handleMobileHandlePointerDown}
        onPointerMove={handleMobileHandlePointerMove}
        onPointerUp={endPanelHandleDrag}
        onPointerCancel={endPanelHandleDrag}
        onClick={handlePanelHandleClick}
        className="fixed bottom-0 left-1/2 z-40 flex -translate-x-1/2 cursor-grab touch-none select-none flex-row items-center gap-2 rounded-t-xl border border-b-0 border-primary/30 bg-primary/12 px-4 py-1.5 text-primary shadow-lg transition-colors hover:bg-primary/20 active:cursor-grabbing lg:hidden"
      >
        <ChevronRight className={`h-4 w-4 transition-transform ${guideOpen ? 'rotate-90' : '-rotate-90'}`} />
        <GripHorizontal className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Guide</span>
      </button>
    </>
  )
}

function PlanOption({
  plan,
  checked,
  disabled,
  onSelect,
}: {
  plan: Plan
  checked: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <label
      className={`group flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3.5 transition-all ${
        checked
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border bg-background hover:border-primary/30 hover:bg-muted/50'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <input
        type="radio"
        name="plan"
        value={plan.id}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="mt-1.5 h-4 w-4 shrink-0 accent-primary"
      />
      <span className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">{plan.name}</span>
          <span className="text-sm font-bold tabular-nums text-primary">
            {plan.pricePaise === null ? 'Custom' : `${formatPrice(plan.pricePaise, plan.currency)}`}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {plan.includedInterviews === null
            ? 'Interview volume priced to your intake.'
            : `${plan.includedInterviews} interviews • ${plan.seats ?? 'Unlimited'} seats`}
        </p>
      </span>
    </label>
  )
}
