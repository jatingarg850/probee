import type { Metadata } from 'next'

import { PricingPage } from '@/components/PricingPage'

export const metadata: Metadata = {
  title: 'Pricing — PROBE',
  description:
    'Interview practice is free for candidates. Hiring plans are priced per organisation per year, with every plan including the full scoring product.',
}

export default function Page() {
  return <PricingPage />
}
