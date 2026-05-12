/**
 * BillingSettings is the shared settings/billing UI: trial banner,
 * current-plan card, monthly/yearly toggle, and a 3-card plan grid that
 * drives Stripe Checkout + Customer Portal.
 *
 * The component is intentionally composable — branding (icons, gradients,
 * pricing copy) is fed in via the `plans` prop so ops, link, and any
 * future host can render the same logic with their own product copy.
 *
 * Hosts wire the component by:
 *   1. Constructing a BillingClient (see ../client).
 *   2. Passing `client`, a `plans` array, and optionally `authUser` for
 *      fallback display when the subscription endpoint is unreachable.
 *   3. Wiring i18n labels (or letting the English defaults render).
 *
 * Heavy lifting (checkout redirect, portal redirect, refetch after
 * success) lives on the BillingClient — the component is just the UI.
 */
import { useEffect, useState } from 'react'
import { Check, Sparkles, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Switch,
  Label,
  Badge,
  cn,
} from '@asteby/metacore-ui'

import type { BillingClient } from '../client'
import type { BillingAuthUser, PlanDisplay, SubscriptionState } from '../types'

/**
 * Tier order — kept in sync with the server-side billing/middleware Guard.
 * Hosts that introduce a new tier slug (e.g. "scale") should override via
 * the `tierRank` prop.
 */
const DEFAULT_TIER_RANK: Record<string, number> = {
  starter: 1,
  pro: 2,
  enterprise: 3,
}

/** Labels surfaced in the UI. Hosts pass the i18n strings they prefer; the
 * defaults are English placeholders that document each slot. */
export interface BillingSettingsLabels {
  currentPlan: string
  trialRemaining: (days: number) => string
  trialFreeBadge: string
  freeTrialUntil: string
  nextBilling: string
  noPlan: string
  monthly: string
  yearly: string
  saveTwoMonths: string
  mostPopular: string
  perMonth: string
  perYear: string
  free: string
  freePlan: string
  redirecting: string
  currentPlanBadge: string
  upgradeTo: (name: string) => string
  downgradeTo: (name: string) => string
  selectPlan: string
  managePayment: string
  manageBilling: string
  updatePayment: string
  pastDueTitle: string
  pastDueDesc: string
  couldNotStartCheckout: string
  couldNotOpenPortal: string
}

const DEFAULT_LABELS: BillingSettingsLabels = {
  currentPlan: 'Current plan',
  trialRemaining: (days) => `Your free trial ends in ${days} days.`,
  trialFreeBadge: 'Free trial',
  freeTrialUntil: 'Free trial until',
  nextBilling: 'Next billing',
  noPlan: 'No plan',
  monthly: 'Monthly',
  yearly: 'Yearly',
  saveTwoMonths: 'Save 2 months',
  mostPopular: 'Most popular',
  perMonth: 'month',
  perYear: 'year',
  free: 'Free',
  freePlan: 'Free plan',
  redirecting: 'Redirecting…',
  currentPlanBadge: 'Current plan',
  upgradeTo: (name) => `Upgrade to ${name}`,
  downgradeTo: (name) => `Switch to ${name}`,
  selectPlan: 'Select plan',
  managePayment: 'Manage payment',
  manageBilling: 'Manage',
  updatePayment: 'Update payment',
  pastDueTitle: 'Your subscription is suspended',
  pastDueDesc:
    "We couldn't process the last payment. Update your payment method to reactivate.",
  couldNotStartCheckout: 'Could not start checkout.',
  couldNotOpenPortal: 'Could not open the billing portal.',
}

/** Props for BillingSettings. */
export interface BillingSettingsProps {
  client: BillingClient
  /** Plan cards to render. Order is preserved. */
  plans: readonly PlanDisplay[]
  /**
   * Optional fallback auth user — fields are consulted only when the
   * subscription endpoint hasn't returned yet, so admins still see their
   * current plan during first paint.
   */
  authUser?: BillingAuthUser
  /** Path to redirect to after Stripe finishes. Defaults to "/settings/billing". */
  returnPath?: string
  /** Override tier ordering for plan upgrade/downgrade buttons. */
  tierRank?: Record<string, number>
  /** Override i18n labels. Partial — defaults fill any gaps. */
  labels?: Partial<BillingSettingsLabels>
  /**
   * Locale string passed to Date.toLocaleDateString. Defaults to the
   * runtime locale.
   */
  locale?: string
  /** Optional className applied to the root container. */
  className?: string
}

export function BillingSettings({
  client,
  plans,
  authUser,
  returnPath = '/settings/billing',
  tierRank = DEFAULT_TIER_RANK,
  labels: labelOverrides,
  locale,
  className,
}: BillingSettingsProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const [isYearly, setIsYearly] = useState(false)
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null)
  const [busyPlan, setBusyPlan] = useState<string | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initial fetch + refetch after returning from a successful checkout.
  useEffect(() => {
    let cancelled = false
    client
      .getSubscription()
      .then((s) => {
        if (!cancelled) setSubscription(s)
      })
      .catch(() => {
        /* unauthenticated / no-subscription: keep null and let the UI fall
         * back to the authUser hints. */
      })
    return () => {
      cancelled = true
    }
  }, [client])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('checkout') === 'success') {
      const t = setTimeout(
        () =>
          client
            .getSubscription()
            .then((s) => setSubscription(s))
            .catch(() => null),
        1500,
      )
      return () => clearTimeout(t)
    }
    return undefined
  }, [client])

  const currentPlan = subscription?.plan_slug || authUser?.plan_slug
  const status = subscription?.status || authUser?.subscription_status
  const periodEnd = subscription?.current_period_end || authUser?.current_period_end
  const daysRemaining = subscription?.days_remaining

  const isTrialing = status === 'trialing'
  const isPastDue =
    status === 'past_due' || status === 'unpaid' || status === 'incomplete_expired'

  const handleSelect = async (slug: string) => {
    setBusyPlan(slug)
    setError(null)
    try {
      await client.startCheckout(slug, isYearly ? 'yearly' : 'monthly', returnPath)
    } catch (err: unknown) {
      const message = (err as Error)?.message || labels.couldNotStartCheckout
      setError(message)
      setBusyPlan(null)
    }
  }

  const handlePortal = async () => {
    setPortalBusy(true)
    try {
      await client.openCustomerPortal(returnPath)
    } catch (err: unknown) {
      const message = (err as Error)?.message || labels.couldNotOpenPortal
      setError(message)
      setPortalBusy(false)
    }
  }

  const formatDate = (iso?: string | null) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleDateString(locale)
    } catch {
      return ''
    }
  }

  return (
    <div className={cn('space-y-6', className)}>
      {isPastDue && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950/40">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="size-5 text-red-600" />
            <div className="flex-1">
              <p className="font-semibold text-red-900 dark:text-red-200">{labels.pastDueTitle}</p>
              <p className="text-sm text-red-700 dark:text-red-300">{labels.pastDueDesc}</p>
            </div>
            <Button size="sm" onClick={handlePortal} disabled={portalBusy}>
              {portalBusy ? <Loader2 className="size-4 animate-spin" /> : labels.updatePayment}
            </Button>
          </CardContent>
        </Card>
      )}

      {isTrialing && daysRemaining !== undefined && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="flex items-center gap-3 py-3">
            <Sparkles className="size-5 text-amber-600" />
            <p className="flex-1 text-sm text-amber-900 dark:text-amber-200">
              {labels.trialRemaining(daysRemaining)}
            </p>
            <Button size="sm" variant="outline" onClick={handlePortal} disabled={portalBusy}>
              {labels.manageBilling}
            </Button>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-300 bg-red-50 dark:bg-red-950/30">
          <CardContent className="py-3 text-sm text-red-800 dark:text-red-300">{error}</CardContent>
        </Card>
      )}

      {(currentPlan || authUser) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{labels.currentPlan}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex size-10 items-center justify-center rounded-lg text-white',
                  currentPlan ? plans.find((p) => p.slug === currentPlan)?.bgGradient : 'bg-gray-500',
                )}
              >
                {currentPlan &&
                  (() => {
                    const plan = plans.find((p) => p.slug === currentPlan)
                    if (plan?.icon) {
                      const Icon = plan.icon
                      return <Icon className="size-5" />
                    }
                    return null
                  })()}
              </div>
              <div>
                <p className="font-medium">
                  {subscription?.plan_name || authUser?.plan_name || labels.noPlan}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isTrialing && periodEnd && (
                    <>
                      {labels.freeTrialUntil} {formatDate(periodEnd)}
                    </>
                  )}
                  {status === 'active' && periodEnd && (
                    <>
                      {labels.nextBilling}: {formatDate(periodEnd)}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isTrialing && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                  <Sparkles className="mr-1 size-3" />
                  {labels.trialFreeBadge}
                </Badge>
              )}
              {subscription?.gateway_subscription_id && (
                <Button size="sm" variant="outline" onClick={handlePortal} disabled={portalBusy}>
                  {portalBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ExternalLink className="size-3" />
                  )}
                  {labels.manageBilling}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-center gap-3">
        <Label htmlFor="billing-toggle" className={cn(!isYearly && 'font-semibold')}>
          {labels.monthly}
        </Label>
        <Switch id="billing-toggle" checked={isYearly} onCheckedChange={setIsYearly} />
        <Label htmlFor="billing-toggle" className={cn(isYearly && 'font-semibold')}>
          {labels.yearly}
          <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700">
            {labels.saveTwoMonths}
          </Badge>
        </Label>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const Icon = plan.icon
          const isCurrentPlan = currentPlan === plan.slug
          const price = isYearly ? plan.price.yearly : plan.price.monthly
          const isFree = price === 0
          const currentRank = tierRank[currentPlan || ''] || 0
          const planRank = tierRank[plan.slug] || 0
          const isUpgrade = planRank > currentRank
          const isDowngrade = planRank < currentRank && !!currentPlan
          const isBusy = busyPlan === plan.slug

          return (
            <Card
              key={plan.slug}
              className={cn(
                'relative flex flex-col',
                plan.popular && 'border-2 border-violet-500 shadow-lg',
                isCurrentPlan && 'ring-2 ring-primary',
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-violet-500 hover:bg-violet-500">{labels.mostPopular}</Badge>
                </div>
              )}

              <CardHeader className="pb-4">
                <div
                  className={cn(
                    'mb-3 flex size-12 items-center justify-center rounded-xl text-white',
                    plan.bgGradient,
                  )}
                >
                  {Icon ? <Icon className="size-6" /> : null}
                </div>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                <div className="mb-6">
                  {isFree ? (
                    <span className="text-4xl font-bold">{labels.free}</span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold">${price}</span>
                      <span className="text-muted-foreground">
                        /{isYearly ? labels.perYear : labels.perMonth}
                      </span>
                    </>
                  )}
                </div>

                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-500" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  className={cn(
                    'w-full',
                    plan.popular && 'bg-violet-500 hover:bg-violet-600',
                  )}
                  variant={isCurrentPlan ? 'outline' : 'default'}
                  disabled={isCurrentPlan || isBusy || isFree}
                  onClick={() => !isCurrentPlan && !isFree && handleSelect(plan.slug)}
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      {labels.redirecting}
                    </>
                  ) : isCurrentPlan ? (
                    labels.currentPlanBadge
                  ) : isFree ? (
                    labels.freePlan
                  ) : isUpgrade ? (
                    labels.upgradeTo(plan.name)
                  ) : isDowngrade ? (
                    labels.downgradeTo(plan.name)
                  ) : (
                    labels.selectPlan
                  )}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
