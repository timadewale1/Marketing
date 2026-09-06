'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getReferralDistributionSummary } from '@/lib/activation-fees'

export default function PambaBusinessNetworkPage() {
  const distribution = getReferralDistributionSummary()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            PAMBA BUSINESS NETWORK
          </h1>
          <p className="text-xl text-gray-600">
            Connecting People • Empowering Businesses • Creating Opportunities
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="vision" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="vision">Our Vision</TabsTrigger>
            <TabsTrigger value="membership">Membership</TabsTrigger>
            <TabsTrigger value="referrals">Referrals</TabsTrigger>
            <TabsTrigger value="structure">Structure</TabsTrigger>
          </TabsList>

          {/* Vision Tab */}
          <TabsContent value="vision" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Our Vision</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 text-gray-700">
                <p className="leading-relaxed">
                  PAMBA Business Network is designed to create a digital ecosystem where individuals, entrepreneurs, 
                  advertisers and businesses can connect, promote products and services, access opportunities and create 
                  additional income opportunities.
                </p>

                <p className="leading-relaxed">
                  Our vision goes beyond providing tasks. We want to build a platform where members can participate in 
                  multiple legitimate business and earning opportunities, even during periods when the number of available 
                  tasks is limited.
                </p>

                <p className="leading-relaxed font-semibold text-indigo-900">
                  Our long-term objective is to use digital technology, advertising, entrepreneurship and business networking 
                  to help people create additional sources of income and contribute to economic empowerment and poverty reduction.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-blue-900">Our True Intention</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-gray-700">
                <p>
                  PAMBA understands that there may be periods when advertisers have fewer tasks available.
                </p>
                <p>
                  Our intention is therefore to develop multiple legitimate opportunities through the PAMBA Business Network 
                  so that members are not entirely dependent on the availability of individual tasks.
                </p>
                <p className="font-semibold">
                  We want our members to be able to:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Participate in different areas of the platform</li>
                  <li>Develop business connections</li>
                  <li>Promote businesses</li>
                  <li>Introduce advertisers</li>
                  <li>Access other opportunities as they become available</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50">
              <CardHeader>
                <CardTitle className="text-amber-900">PAMBA Promise</CardTitle>
              </CardHeader>
              <CardContent className="text-gray-700">
                <p>
                  Our bigger vision is to build a sustainable digital ecosystem that can contribute to poverty reduction, 
                  entrepreneurship and financial empowerment.
                </p>
                <p className="mt-4 font-semibold text-amber-900">
                  PAMBA does not guarantee a fixed income to members. Earnings depend on available opportunities, qualifying 
                  activities performed and the applicable terms of each programme.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Membership Tab */}
          <TabsContent value="membership" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>₦{distribution.totalFee.toLocaleString()} Membership Fee</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Referral Distribution */}
                  <Card className="border-green-200 bg-green-50">
                    <CardHeader>
                      <CardTitle className="text-green-900 text-lg">Referral Distribution</CardTitle>
                      <p className="text-sm text-green-700 font-semibold">₦{distribution.referralPool.toLocaleString()}</p>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 mb-4">
                        Distributed across four generations of referrals:
                      </p>
                      <div className="space-y-3">
                        {distribution.levels.map((level) => (
                          <div key={level.level} className="flex justify-between items-center p-2 bg-white rounded border border-green-100">
                            <span className="text-sm font-semibold text-gray-700">
                              {level.label}
                            </span>
                            <span className="text-lg font-bold text-green-600">
                              {level.amountLabel}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Platform Charge */}
                  <Card className="border-purple-200 bg-purple-50">
                    <CardHeader>
                      <CardTitle className="text-purple-900 text-lg">Platform & Administration</CardTitle>
                      <p className="text-sm text-purple-700 font-semibold">₦{distribution.platformCharge.toLocaleString()}</p>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 mb-4">
                        Used for platform operations and maintenance:
                      </p>
                      <ul className="text-sm text-gray-700 space-y-2">
                        <li>✓ Technology and platform maintenance</li>
                        <li>✓ Hosting and server expenses</li>
                        <li>✓ Payment processing and transactions</li>
                        <li>✓ Customer support and services</li>
                        <li>✓ Administration and compliance</li>
                        <li>✓ Marketing and business development</li>
                        <li>✓ Security and fraud prevention</li>
                        <li>✓ Development of new features</li>
                      </ul>
                    </CardContent>
                  </Card>
                </div>

                <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Note:</span> The ₦{distribution.platformCharge.toLocaleString()} is a platform and 
                    administrative charge to support the operation, maintenance and development of the platform—not an investment contribution.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Referrals Tab */}
          <TabsContent value="referrals" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>How Referrals Work</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 text-gray-700">
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6">
                  <h3 className="font-bold text-indigo-900 mb-4 text-lg">Four-Level Referral System</h3>
                  <p className="mb-6">
                    When you refer someone to PAMBA and they complete their ₦{distribution.totalFee.toLocaleString()} membership payment:
                  </p>

                  <div className="space-y-4">
                    {distribution.levels.map((level, idx) => (
                      <div key={level.level} className="border-l-4 border-indigo-500 pl-4 py-2">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-bold text-gray-900">{level.label}</h4>
                          <span className="text-lg font-bold text-indigo-600">{level.amountLabel}</span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {idx === 0 && "You receive this amount when someone you directly refer completes their membership."}
                          {idx === 1 && "The person who referred you receives this amount when their other referrals complete membership."}
                          {idx === 2 && "Distributed to your referrer's referrer."}
                          {idx === 3 && "Distributed to your referrer's referrer's referrer."}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <Card className="border-amber-200 bg-amber-50">
                  <CardHeader>
                    <CardTitle className="text-amber-900">Example</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-gray-700">
                    <p className="mb-3">If you refer 10 people who each complete their ₦{distribution.totalFee.toLocaleString()} membership:</p>
                    <p className="font-semibold mb-2">You earn: 10 × {distribution.levels[0].amountLabel} = ₦{(distribution.levels[0].amount * 10).toLocaleString()}</p>
                    <p className="text-xs text-amber-900">Plus additional income as those 10 people refer others and earn commission across all levels.</p>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Structure Tab */}
          <TabsContent value="structure" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Earning Multiple Ways</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-gray-700">
                    PAMBA is designed so members can participate in more than one way:
                  </p>

                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6">
                    <div className="space-y-4">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">1</div>
                        <div>
                          <h4 className="font-bold text-gray-900">Perform Tasks</h4>
                          <p className="text-sm text-gray-600">Earn from completing tasks on the platform</p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">2</div>
                        <div>
                          <h4 className="font-bold text-gray-900">Refer New Members</h4>
                          <p className="text-sm text-gray-600">Earn ₦{distribution.levels[0].amountLabel} for each person you refer who completes membership</p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-sm">3</div>
                        <div>
                          <h4 className="font-bold text-gray-900">Build Your Network</h4>
                          <p className="text-sm text-gray-600">Earn from 4 levels of referrals as your network grows</p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-sm">4</div>
                        <div>
                          <h4 className="font-bold text-gray-900">Access New Opportunities</h4>
                          <p className="text-sm text-gray-600">Participate in marketplace, skills opportunities and more as they become available</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Our Bigger Dream</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-gray-700">
                <p className="font-semibold text-lg">
                  PAMBA is built on a simple belief:
                </p>
                <p className="text-lg font-bold text-indigo-700">
                  There should be more than one way for people to create legitimate economic opportunities.
                </p>

                <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
                  <p>✓ <span className="font-semibold">When there are tasks:</span> Members can perform tasks</p>
                  <p>✓ <span className="font-semibold">When businesses need promotion:</span> Members can help connect businesses to PAMBA</p>
                  <p>✓ <span className="font-semibold">When advertisers create campaigns:</span> Eligible members can benefit from network activity</p>
                  <p>✓ <span className="font-semibold">When new opportunities launch:</span> Members can participate according to requirements</p>
                </div>

                <p className="mt-6 font-semibold text-indigo-900">
                  Our goal is to continuously expand the ecosystem so that members have access to more opportunities, 
                  not just more tasks.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
              <CardContent className="pt-6 text-center">
                <p className="text-lg font-bold text-gray-900 mb-2">
                  PAMBA BUSINESS NETWORK
                </p>
                <p className="text-gray-700 mb-4">
                  Not just a task platform.
                </p>
                <p className="text-indigo-900 font-semibold">
                  A growing ecosystem of people, businesses, opportunities and digital commerce.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
