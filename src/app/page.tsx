import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Coins, Target, UserCheck, Wallet, Users, TrendingUp, CheckCircle, Megaphone, Clipboard, SlidersHorizontal } from 'lucide-react';
import Navbar from '@/components/navbar';
import BillsCard from '@/components/bills/BillsCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TypedText } from '@/components/ui/typed-text';

export default function HomePage() {
  return (
    <div className="min-h-screen pt-16">
      <Navbar />

      {/* Hero Section */}
      <section id="hero" className="relative h-[90vh] min-h-[600px] bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
        <div className="absolute inset-0">
          <Image
            src="/hero-bg.jpg"
            alt="Marketing task illustration"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-stone-900/95 to-stone-900/60 backdrop-blur-xl" />
        </div>

        {/* Logo (use image instead of short text) */}
        {/* <div className="relative">
          <div className="container mx-auto px-4 pt-6">
            <Link href="/" className="inline-flex items-center text-2xl font-bold text-white">
                <img src="/Pamba-phone.png" alt="PAMBA" className="w-9 h-9 rounded mr-2" />
              PAMBA
            </Link>
          </div>
        </div> */}
        
        <div className="relative container mx-auto px-4 h-full flex items-center">
          <div className="max-w-2xl">
            <h1 className="text-3xl sm:text-5xl font-bold text-white mb-6">
              <TypedText
                strings={[
                  'Earn Money Through Social Impact',
                  'Get Paid for Social Engagement',
                  'Monetize Your Social Reach',
                  'Earn While Making an Impact',
                  'YouTube Views, Likes & Subscriptions',
                  'Social Media Engagements',
                  'Product Advertisement & Promotions',
                  'Grow Your Audience & Earn'
                ]}
                className="text-white"
              />
            </h1>
            <p className="text-lg text-white mb-8">
              Grow Your Brand, Earn from Digital Advertising and Get Paid Instantly.
PAMBA is a trusted digital advertising platform where businesses gain real visibility and users earn by completing simple, verified marketing tasks.
Advertisers reach genuine audiences for their products, services, websites, YouTube channels, and business pages — while users earn by engaging with ads, watching short videos, and sharing approved promotional content.
Earnings are credited instantly to your wallet and can be withdrawn directly to your bank account or used to pay bills on the platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild className="h-12 px-8 text-lg bg-amber-500 hover:bg-amber-600 text-stone-900">
                <Link href="/auth/sign-up">Start Earning/Create Tasks</Link>
              </Button>
              <Button asChild variant="outline" className="h-12 px-8 text-lg border-white text-white hover:bg-white/10">
                <Link href="/advertise-directly">Advertise Directly</Link>
              </Button>
              <Button asChild className="h-12 px-8 text-lg bg-amber-500 hover:bg-amber-600 text-stone-900">
                <Link href="/auth/sign-in">Login</Link>
              </Button>
              
            </div>
            
            <div className="mt-12 flex flex-wrap gap-8 text-white">
              <div className="flex items-center gap-2">
                <Users className="w-6 h-6 text-amber-500" />
                <span>10k+ Active Users</span>
              </div>
                <div className="flex items-center gap-2">
                <Coins className="w-6 h-6 text-amber-500" />
                <span>₦10M+ Paid Out</span>
              </div>
                <div className="flex items-center gap-2">
                <Target className="w-6 h-6 text-amber-500" />
                <span>500+ Tasks</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bills & Utilities */}
      <section id="bills" className="py-12 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-semibold text-stone-900 mb-6">Bills & Utilities</h2>
          <div className="max-w-3xl">
            <BillsCard />
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-16 bg-gradient-to-br from-emerald-50/60 via-emerald-100/40 to-emerald-50/30 backdrop-blur-sm">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-stone-900">
            <h2 className="text-3xl font-bold text-center mb-4">About Us</h2>
            <p className="text-stone-700 text-center mb-6">
              PAMBA is a fully registered digital advertising and services platform, duly incorporated with the Corporate Affairs Commission (CAC) of Nigeria. PAMBA provides a structured marketplace that connects advertisers, businesses, content creators, and everyday users through compliant digital marketing and promotional services.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-6 rounded-xl shadow border border-stone-100 bg-white">
                <h4 className="text-sm font-semibold text-amber-600 mb-2">Mission Statement</h4>
                <h3 className="text-xl font-bold mb-3">Our Mission</h3>
                <p className="text-stone-700 text-sm">
                  To provide a secure, compliant, and technology-driven digital advertising ecosystem that connects advertisers with real audiences, enables individuals to earn through legitimate marketing activities, and supports seamless payments and bill services.
                </p>
              </div>

              <div className="p-6 rounded-xl shadow border border-stone-100 bg-white">
                <h4 className="text-sm font-semibold text-amber-600 mb-2">Vision Statement</h4>
                <h3 className="text-xl font-bold mb-3">Our Vision</h3>
                <p className="text-stone-700 text-sm">
                  To become Nigeria’s most trusted and people-focused digital advertising platform — empowering businesses to grow, promoting innovative products and services, and creating sustainable earning opportunities through transparent digital engagement.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-stone-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-stone-900 mb-8">
            Features of PAMBA
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-6 rounded-xl shadow-lg border border-stone-100 bg-white hover:scale-[1.01] transform transition">
              <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 grid place-items-center mb-4">
                <Wallet className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-stone-900">Instant Withdrawals</h3>
              <p className="text-stone-600">
                Withdraw your earnings quickly — we surface withdrawal requests for fast manual processing and plan to enable instant transfers.
              </p>
            </Card>

            <Card className="p-6 rounded-xl shadow-lg border border-stone-100 bg-white hover:scale-[1.01] transform transition">
              <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 grid place-items-center mb-4">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-stone-900">Referral Bonuses</h3>
              <p className="text-stone-600">
                Earn referral bonuses when people you invite activate or make their first advertiser payment — a clear way to scale your earnings.
              </p>
            </Card>

            <Card className="p-6 rounded-xl shadow-lg border border-stone-100 bg-white hover:scale-[1.01] transform transition">
              <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 grid place-items-center mb-4">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-stone-900">Pay Bills & Utilities</h3>
              <p className="text-stone-600">
                Use your wallet to pay utilities and bills directly. Earn, withdraw, or pay — all from one place.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="howitworks" className="py-20 bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-stone-900 mb-12">
            How It Works
          </h2>

          <div className="grid md:grid-cols-3 gap-12 items-center">
            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-stone-900">Sign Up & Activate</h3>
                  <p className="text-stone-600">
                    Create your account and activate it with a one-time fee of ₦2,000 to start participating in tasks.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <Target className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-stone-900">Choose Tasks</h3>
                  <p className="text-stone-600">
                    Browse available tasks and select those that match your interests and skills.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-stone-900">Complete Tasks</h3>
                  <p className="text-stone-600">
                    Follow task instructions and submit your work for review.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <Wallet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-stone-900">Get Paid</h3>
                  <p className="text-stone-600">
                    Receive payment directly to your wallet once your submission is approved.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative h-[500px] rounded-lg overflow-hidden">
              <Image
                src="/howitworks.jpg"
                alt="Platform demonstration"
                fill
                className="object-cover"
              />
            </div>

            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <Megaphone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Advertiser - Sign Up & Fund</h3>
                  <p className="text-stone-600">
                    Create an account, verify your details, and fund your wallet to begin creating tasks.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <Clipboard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Create Task</h3>
                  <p className="text-stone-600">
                    Define your objective, target demographics, creatives and set the budget and cost-per-lead.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <SlidersHorizontal className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Target & Optimize</h3>
                  <p className="text-stone-600">
                    Choose who sees your task, set pacing and monitor performance to optimize for quality leads.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Launch & Track</h3>
                  <p className="text-stone-600">
                    Launch your task, review submissions, approve quality leads, and pay only for validated results.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="cta" className="py-20 bg-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-stone-900 mb-6">
            Ready to Start Your Journey?
          </h2>
          <p className="text-xl text-stone-700 mb-8 max-w-2xl mx-auto">
            Join thousands of users who are already earning through our platform. Start participating in tasks or create your own today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild className="h-12 px-8 text-lg bg-amber-500 hover:bg-amber-600 text-stone-900">
                <Link href="/auth/sign-up">
                Start Earning Now/Create Tasks <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12 px-8 text-lg border-amber-500 text-amber-500 hover:bg-amber-50">
              <Link href="/auth/sign-in">Login to your account</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
            <footer className="bg-stone-900 text-stone-400 py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-6">
                <Image src="/Pamba.png" alt="PAMBA" width={70} height={30} className="rounded" />
                <span className="sr-only">PAMBA</span>
              </div>
              <ul className="space-y-2">
                <li><Link href="/auth/sign-up" className="hover:text-amber-500">Start Earning/Create Tasks</Link></li>
                <li><Link href="/auth/sign-in" className="hover:text-amber-500">Login to your account</Link></li>
                <li><Link href="/faq" className="hover:text-amber-500">FAQ</Link></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-bold text-white mb-4">Legal</h3>
              <ul className="space-y-2">
                <li><Link href="/contact" className="hover:text-amber-500">Contact Us</Link></li>
                <li><Link href="/terms" className="hover:text-amber-500">Terms of Service</Link></li>
                <li><Link href="/privacy" className="hover:text-amber-500">Privacy Policy</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-white mb-4">Follow Us</h3>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-amber-500">Twitter</a></li>
                <li><a href="#" className="hover:text-amber-500">Facebook</a></li>
                <li><a href="#" className="hover:text-amber-500">Instagram</a></li>
                <li><a href="#" className="hover:text-amber-500">LinkedIn</a></li>
              </ul>
            </div>

          </div>

          <div className="mt-12 pt-8 border-t border-stone-800 text-center text-sm">
            &copy; 2024 PAMBA. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}