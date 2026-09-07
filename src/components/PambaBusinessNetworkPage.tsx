'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Landmark,
  Megaphone,
  Network,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  Wallet,
} from 'lucide-react'
import { getReferralDistributionSummary } from '@/lib/activation-fees'

type NetworkRole = 'earner' | 'advertiser'

type PambaBusinessNetworkPageProps = {
  role: NetworkRole
}

type SectionKey = 'overview' | 'membership' | 'referrals' | 'ecosystem'

const networkSections: { key: SectionKey; label: string }[] = [
  { key: 'overview', label: 'The network' },
  { key: 'membership', label: 'Membership' },
  { key: 'referrals', label: 'Referrals' },
  { key: 'ecosystem', label: 'PAMBA ecosystem' },
]

export default function PambaBusinessNetworkPage({ role }: PambaBusinessNetworkPageProps) {
  const distribution = getReferralDistributionSummary()
  const [section, setSection] = useState<SectionKey>('overview')
  const isAdvertiser = role === 'advertiser'

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.2),_transparent_28%),linear-gradient(180deg,#fffaf0_0%,#f8fafc_52%,#f0fdfa_100%)] px-4 py-6 text-stone-900 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <section className="relative overflow-hidden rounded-[32px] bg-stone-950 px-6 py-8 text-white shadow-[0_28px_90px_-45px_rgba(28,25,23,0.8)] sm:px-10 sm:py-12">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative grid gap-10 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.24em] text-amber-300">
                <Network size={14} /> PAMBA Business Network
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">
                More ways to connect, grow, and create value.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-stone-300 sm:text-lg">
                {isAdvertiser
                  ? 'Build campaigns, reach real audiences, grow your business, and participate in a network that connects advertisers with customers, providers, and promoters.'
                  : 'PAMBA brings tasks, referrals, marketplace commerce, professional services, and everyday payments together in one growing digital ecosystem.'}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/skills-services" className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-5 py-3 text-sm font-bold text-stone-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300">
                  Explore Skills & Services <ArrowRight size={16} />
                </Link>
                <Link href="/marketplace" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15">
                  Visit Marketplace <ShoppingBag size={16} />
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Users, value: '4 levels', label: 'referral network' },
                { icon: Store, value: 'Live shops', label: 'marketplace discovery' },
                { icon: BriefcaseBusiness, value: 'Real skills', label: 'provider directory' },
                { icon: Wallet, value: 'One wallet', label: 'earn, spend, withdraw' },
              ].map(({ icon: Icon, value, label }) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
                  <Icon className="text-amber-300" size={19} />
                  <p className="mt-4 text-sm font-black text-white">{value}</p>
                  <p className="mt-1 text-xs leading-5 text-stone-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <nav className="mt-5 overflow-x-auto rounded-2xl border border-stone-200 bg-white/85 p-2 shadow-sm backdrop-blur">
          <div className="flex min-w-max gap-2">
            {networkSections.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSection(item.key)}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${section === item.key ? 'bg-stone-950 text-amber-300 shadow-md' : 'text-stone-600 hover:bg-amber-50 hover:text-stone-950'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="mt-6">
          {section === 'overview' ? <Overview isAdvertiser={isAdvertiser} /> : null}
          {section === 'membership' ? <Membership distribution={distribution} /> : null}
          {section === 'referrals' ? <Referrals distribution={distribution} isAdvertiser={isAdvertiser} /> : null}
          {section === 'ecosystem' ? <Ecosystem /> : null}
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <Link href="/skills-services" className="group rounded-3xl border border-emerald-200 bg-emerald-50 p-6 transition hover:-translate-y-1 hover:shadow-xl">
            <BriefcaseBusiness className="text-emerald-700" size={24} />
            <h2 className="mt-5 text-xl font-black text-emerald-950">Skills & Services</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900/70">Search real providers by skill, category, and location, then connect directly when you find the right fit.</p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-emerald-800">Open directory <ChevronRight size={16} /></span>
          </Link>
          <Link href="/marketplace" className="group rounded-3xl border border-cyan-200 bg-cyan-50 p-6 transition hover:-translate-y-1 hover:shadow-xl">
            <ShoppingBag className="text-cyan-700" size={24} />
            <h2 className="mt-5 text-xl font-black text-cyan-950">Pamba Marketplace</h2>
            <p className="mt-2 text-sm leading-6 text-cyan-950/70">Browse vendor shops and products, search by category, and open storefronts as products go live.</p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-cyan-800">Browse marketplace <ChevronRight size={16} /></span>
          </Link>
          <Link href="/bills" className="group rounded-3xl border border-amber-200 bg-amber-50 p-6 transition hover:-translate-y-1 hover:shadow-xl">
            <CircleDollarSign className="text-amber-700" size={24} />
            <h2 className="mt-5 text-xl font-black text-amber-950">Bills & Utilities</h2>
            <p className="mt-2 text-sm leading-6 text-amber-950/70">Use your wallet for airtime, data, TV, electricity, and other everyday services.</p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-amber-800">Pay a bill <ChevronRight size={16} /></span>
          </Link>
        </section>

        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-5 text-stone-500">
          PAMBA does not guarantee a fixed income or specific business results. Earnings and outcomes depend on qualifying activities, available opportunities, campaign performance, and the terms of each programme.
        </p>
      </div>
    </main>
  )
}

function Overview({ isAdvertiser }: { isAdvertiser: boolean }) {
  return (
    <section className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-700">A connected ecosystem</p>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-stone-950">PAMBA is bigger than one activity.</h2>
        <div className="mt-5 space-y-4 text-sm leading-7 text-stone-600">
          <p>Members can move between legitimate platform opportunities instead of depending on one source of activity. The network brings people, businesses, services, commerce, and payments into the same ecosystem.</p>
          <p>{isAdvertiser ? 'Advertisers can promote campaigns, reach verified audiences, refer businesses, and connect with providers who support their growth.' : 'Earners can complete tasks, build a referral network, discover products, find providers, and use their wallet for useful services.'}</p>
        </div>
      </article>
      <article className="rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 p-6 text-stone-950 shadow-xl shadow-amber-500/20 sm:p-8">
        <Sparkles size={26} />
        <h2 className="mt-5 text-2xl font-black">The PAMBA promise</h2>
        <p className="mt-4 text-sm leading-7 text-stone-900/75">We are building practical digital pathways for earning, marketing, selling, hiring, and paying. Every opportunity has its own requirements and terms, so members can choose what fits them.</p>
        <div className="mt-6 space-y-3 text-sm font-bold">
          {['People connect to opportunities', 'Businesses reach real audiences', 'Skills meet customers', 'Wallets support everyday needs'].map((item) => <p key={item} className="flex items-center gap-2"><CheckCircle2 size={17} /> {item}</p>)}
        </div>
      </article>
    </section>
  )
}

function Membership({ distribution }: { distribution: ReturnType<typeof getReferralDistributionSummary> }) {
  return (
    <section className="space-y-5">
      <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-700">One-time activation</p>
            <h2 className="mt-2 text-3xl font-black text-stone-950">₦{distribution.totalFee.toLocaleString()} membership fee</h2>
          </div>
          <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-black text-amber-900">Referral pool: ₦{distribution.referralPool.toLocaleString()}</span>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {distribution.levels.map((level) => (
            <div key={level.level} className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-stone-500">{level.label}</p>
              <p className="mt-3 text-2xl font-black text-stone-950">{level.amountLabel}</p>
              <p className="mt-2 text-xs leading-5 text-stone-600">Distributed when an eligible member in this generation completes activation.</p>
            </div>
          ))}
        </div>
      </article>
      <article className="rounded-3xl border border-cyan-200 bg-cyan-50 p-6 sm:p-8">
        <h2 className="text-xl font-black text-cyan-950">What the platform charge supports</h2>
        <div className="mt-4 grid gap-3 text-sm text-cyan-950/75 sm:grid-cols-2">
          {['Technology and hosting', 'Payment processing', 'Security and fraud prevention', 'Support and administration', 'Compliance and operations', 'New platform features'].map((item) => <p key={item} className="flex items-center gap-2"><CheckCircle2 size={16} className="text-cyan-700" /> {item}</p>)}
        </div>
        <p className="mt-5 text-xs leading-5 text-cyan-950/65">The ₦{distribution.platformCharge.toLocaleString()} platform charge supports operations and development. It is not an investment contribution.</p>
      </article>
    </section>
  )
}

function Referrals({ distribution, isAdvertiser }: { distribution: ReturnType<typeof getReferralDistributionSummary>; isAdvertiser: boolean }) {
  return (
    <section className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
      <article className="rounded-3xl bg-stone-950 p-6 text-white shadow-xl sm:p-8">
        <Users className="text-amber-300" size={28} />
        <h2 className="mt-5 text-2xl font-black">Build a network with context.</h2>
        <p className="mt-4 text-sm leading-7 text-stone-300">Invite people or businesses who can genuinely benefit from PAMBA. Referral activity is recorded with levels and audit details so each qualifying reward has a clear origin.</p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm text-stone-300">{isAdvertiser ? 'Introduce businesses that need promotion and grow alongside the campaigns they launch.' : 'Introduce people who want to earn, discover services, shop, or use the broader PAMBA ecosystem.'}</div>
      </article>
      <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-700">Four-level structure</p>
        <h2 className="mt-2 text-2xl font-black text-stone-950">How qualifying referrals flow</h2>
        <div className="mt-6 space-y-3">
          {distribution.levels.map((level, index) => (
            <div key={level.level} className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-sm font-black text-stone-950">{index + 1}</span>
              <div className="min-w-0 flex-1"><p className="font-black text-stone-900">{level.label}</p><p className="text-xs text-stone-500">Qualifying activation in this generation</p></div>
              <p className="font-black text-amber-700">{level.amountLabel}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}

function Ecosystem() {
  const items = [
    { icon: Megaphone, title: 'Tasks & campaigns', text: 'Advertisers create campaigns and eligible members complete verified tasks.' },
    { icon: Store, title: 'Marketplace', text: 'Vendors list products and shoppers discover shops, products, and storefronts.' },
    { icon: Search, title: 'Skills & Services', text: 'Customers search provider profiles by skill, category, and location, then connect directly.' },
    { icon: Landmark, title: 'Bills & utilities', text: 'Wallet funds can support airtime, data, TV, electricity, and more.' },
  ]
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-700">Four connected lanes</p>
      <h2 className="mt-2 text-3xl font-black text-stone-950">Choose the opportunity that fits your next step.</h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {items.map(({ icon: Icon, title, text }) => <div key={title} className="rounded-2xl border border-stone-200 bg-stone-50 p-5"><Icon size={22} className="text-amber-600" /><h3 className="mt-4 font-black text-stone-950">{title}</h3><p className="mt-2 text-sm leading-6 text-stone-600">{text}</p></div>)}
      </div>
    </section>
  )
}
