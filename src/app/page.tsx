import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Wallet, Users, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative h-[90vh] min-h-[600px] bg-gradient-to-br from-primary-50 via-gold-100 to-primary-100">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-r from-gold-500/10 to-transparent" />
          <Image
            src="/hero-bg.jpg"
            alt="Marketing campaign illustration"
            fill
            className="object-cover"
            priority
          />
        </div>
        
        <div className="relative container mx-auto px-4 h-full flex items-center">
          <div className="max-w-2xl">
            <h1 className="text-5xl sm:text-6xl font-bold text-primary-900 mb-6">
              Earn Money Through Social Impact
            </h1>
            <p className="text-xl text-primary-700 mb-8">
              Join our platform to earn by participating in marketing campaigns or reach your target audience effectively through our network of engaged users.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild className="h-12 px-8 text-lg bg-gold-500 hover:bg-gold-600 text-primary-900">
                <Link href="/auth/sign-up">Start Earning</Link>
              </Button>
              <Button asChild variant="outline" className="h-12 px-8 text-lg">
                <Link href="/auth/sign-up">Create Campaigns</Link>
              </Button>
            </div>
            
            <div className="mt-12 flex gap-8">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-gold-600" />
                <span className="text-primary-700">10k+ Active Users</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-gold-600" />
                <span className="text-primary-700">₦50M+ Paid Out</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-gold-600" />
                <span className="text-primary-700">500+ Campaigns</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-primary-900 mb-12">
            Why Choose Our Platform?
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <Wallet className="w-12 h-12 text-gold-500 mb-4" />
              <h3 className="text-xl font-semibold mb-3">Earn Money</h3>
              <p className="text-primary-600">
                Participate in various marketing campaigns and get paid for your engagement. Complete tasks like surveys, social media interactions, and more.
              </p>
            </Card>
            
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <Users className="w-12 h-12 text-gold-500 mb-4" />
              <h3 className="text-xl font-semibold mb-3">Build Community</h3>
              <p className="text-primary-600">
                Connect with like-minded individuals, refer friends, and grow your network while earning through our referral program.
              </p>
            </Card>
            
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <TrendingUp className="w-12 h-12 text-gold-500 mb-4" />
              <h3 className="text-xl font-semibold mb-3">Market Growth</h3>
              <p className="text-primary-600">
                Advertisers can reach their target audience effectively and track campaign performance in real-time.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-primary-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-primary-900 mb-12">
            How It Works
          </h2>

          <div className="grid md:grid-cols-3 gap-12 items-center">
            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-gold-500 text-white flex items-center justify-center flex-shrink-0">
                  1
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Sign Up & Activate</h3>
                  <p className="text-primary-600">
                    Create your account and activate it with a one-time fee of ₦2,000 to start participating in campaigns.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-gold-500 text-white flex items-center justify-center flex-shrink-0">
                  2
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Choose Campaigns</h3>
                  <p className="text-primary-600">
                    Browse available campaigns and select those that match your interests and skills.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-gold-500 text-white flex items-center justify-center flex-shrink-0">
                  3
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Complete Tasks</h3>
                  <p className="text-primary-600">
                    Follow campaign instructions and submit your work for review.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-gold-500 text-white flex items-center justify-center flex-shrink-0">
                  4
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Get Paid</h3>
                  <p className="text-primary-600">
                    Receive payment directly to your wallet once your submission is approved.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative h-[500px] rounded-lg overflow-hidden">
              <Image
                src="/how-it-works.jpg"
                alt="Platform demonstration"
                fill
                className="object-cover"
              />
            </div>

            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-gold-500 text-white flex items-center justify-center flex-shrink-0">
                  A1
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Advertiser — Sign Up & Fund</h3>
                  <p className="text-primary-600">
                    Create an account, verify your details, and fund your wallet to begin creating campaigns.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-gold-500 text-white flex items-center justify-center flex-shrink-0">
                  A2
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Create Campaign</h3>
                  <p className="text-primary-600">
                    Define your objective, target demographics, creatives and set the budget and cost-per-lead.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-gold-500 text-white flex items-center justify-center flex-shrink-0">
                  A3
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Target & Optimize</h3>
                  <p className="text-primary-600">
                    Choose who sees your campaign, set pacing and monitor performance to optimize for quality leads.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-gold-500 text-white flex items-center justify-center flex-shrink-0">
                  A4
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Launch & Track</h3>
                  <p className="text-primary-600">
                    Launch your campaign, review submissions, approve quality leads, and pay only for validated results.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-gold-500 to-gold-600">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-primary-900 mb-6">
            Ready to Start Your Journey?
          </h2>
          <p className="text-xl text-primary-900/90 mb-8 max-w-2xl mx-auto">
            Join thousands of users who are already earning through our platform. Start participating in campaigns or create your own today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild className="h-12 px-8 text-lg bg-white hover:bg-white/90 text-gold-600">
              <Link href="/auth/sign-up">
                Start Earning Now <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12 px-8 text-lg border-white text-white hover:bg-white/10">
              <Link href="/auth/sign-up">Create Your Campaign</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
            <footer className="bg-primary-900 text-primary-400 py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="font-bold mb-4">Platform</h3>
              <ul className="space-y-2">
                <li><Link href="/auth/sign-up" className="hover:text-gold-500">Start Earning</Link></li>
                <li><Link href="/auth/sign-up" className="hover:text-gold-500">Create Campaign</Link></li>
                <li><Link href="/faq" className="hover:text-gold-500">FAQ</Link></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-bold mb-4">Legal</h3>
              <ul className="space-y-2">
                <li><Link href="/contact" className="hover:text-gold-500">Contact Us</Link></li>
                <li><Link href="/terms" className="hover:text-gold-500">Terms of Service</Link></li>
                <li><Link href="/privacy" className="hover:text-gold-500">Privacy Policy</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold mb-4">Follow Us</h3>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-gold-500">Twitter</a></li>
                <li><a href="#" className="hover:text-gold-500">Facebook</a></li>
                <li><a href="#" className="hover:text-gold-500">Instagram</a></li>
                <li><a href="#" className="hover:text-gold-500">LinkedIn</a></li>
              </ul>
            </div>

          </div>

          <div className="mt-12 pt-8 border-t border-primary-800 text-center text-sm">
            &copy; 2024 Blessing. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}