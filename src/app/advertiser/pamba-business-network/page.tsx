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
                  Our vision goes beyond providing a platform for tasks. We want to build a comprehensive network where businesses 
                  can access verified marketers and promoters, and members can participate in multiple legitimate business and 
                  earning opportunities.
                </p>

                <p className="leading-relaxed font-semibold text-indigo-900">
                  Our long-term objective is to use digital technology, advertising, entrepreneurship and business networking 
                  to help create sustainable business growth and connect opportunity seekers with opportunity creators.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-blue-900">For Advertisers & Businesses</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-gray-700">
                <p>
                  PAMBA Business Network provides advertisers and businesses with multiple benefits:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><span className="font-semibold">Verified Network:</span> Access to a verified network of promoters and marketers</li>
                  <li><span className="font-semibold">Flexible Campaign Options:</span> Create campaigns with customizable budgets and requirements</li>
                  <li><span className="font-semibold">Performance Tracking:</span> Detailed analytics and reporting on campaign performance</li>
                  <li><span className="font-semibold">Network Effects:</span> Benefit from multi-level referral incentives when you refer other businesses</li>
                  <li><span className="font-semibold">Sustainable Growth:</span> Build long-term relationships with reliable partners</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50">
              <CardHeader>
                <CardTitle className="text-amber-900">PAMBA Promise</CardTitle>
              </CardHeader>
              <CardContent className="text-gray-700">
                <p>
                  Our bigger vision is to build a sustainable digital ecosystem that connects businesses with verified talent 
                  and helps drive growth for all parties involved.
                </p>
                <p className="mt-4 font-semibold text-amber-900">
                  PAMBA does not guarantee specific results. Campaign performance depends on campaign requirements, budget allocation, 
                  market conditions, and the engagement of the network participants.
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
                      <CardTitle className="text-purple-900 text-lg">Platform & Operations</CardTitle>
                      <p className="text-sm text-purple-700 font-semibold">₦{distribution.platformCharge.toLocaleString()}</p>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 mb-4">
                        Invested in platform excellence:
                      </p>
                      <ul className="text-sm text-gray-700 space-y-2">
                        <li>✓ Technology infrastructure and platform maintenance</li>
                        <li>✓ Hosting, security, and data protection</li>
                        <li>✓ Payment processing and transaction systems</li>
                        <li>✓ 24/7 customer support and technical assistance</li>
                        <li>✓ Compliance and regulatory requirements</li>
                        <li>✓ Marketing and business development initiatives</li>
                        <li>✓ Advanced fraud prevention and security</li>
                        <li>✓ Continuous platform feature development</li>
                      </ul>
                    </CardContent>
                  </Card>
                </div>

                <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Membership Benefit:</span> Your membership fee gives you access to the complete 
                    PAMBA ecosystem—from campaign creation and management tools to the network of verified promoters and marketers.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Referrals Tab */}
          <TabsContent value="referrals" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>How Referrals Work for Advertisers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 text-gray-700">
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6">
                  <h3 className="font-bold text-indigo-900 mb-4 text-lg">Four-Level Referral System</h3>
                  <p className="mb-6">
                    When you refer another advertiser to PAMBA and they complete their ₦{distribution.totalFee.toLocaleString()} membership payment:
                  </p>

                  <div className="space-y-4">
                    {distribution.levels.map((level, idx) => (
                      <div key={level.level} className="border-l-4 border-indigo-500 pl-4 py-2">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-bold text-gray-900">{level.label}</h4>
                          <span className="text-lg font-bold text-indigo-600">{level.amountLabel}</span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {idx === 0 && "You receive this amount when an advertiser you refer completes their membership."}
                          {idx === 1 && "You receive this amount from advertisers referred by your referrals."}
                          {idx === 2 && "You receive this amount from advertisers in your 3rd generation referrals."}
                          {idx === 3 && "You receive this amount from advertisers in your 4th generation referrals."}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <Card className="border-amber-200 bg-amber-50">
                  <CardHeader>
                    <CardTitle className="text-amber-900">Network Effect Example</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-gray-700">
                    <p className="mb-3">If you refer 5 businesses who each complete their ₦{distribution.totalFee.toLocaleString()} membership:</p>
                    <p className="font-semibold mb-2">Direct Referral Income: 5 × {distribution.levels[0].amountLabel} = ₦{(distribution.levels[0].amount * 5).toLocaleString()}</p>
                    <p className="text-xs text-amber-900">
                      Plus additional income as those 5 businesses refer their own partners, and earn commissions across all levels.
                    </p>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Introducing Businesses & Campaigns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-gray-700">
                <p>
                  Beyond membership referrals, there are additional earning opportunities:
                </p>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-green-900 mb-3">Advertiser Task Commission</h4>
                  <p className="text-sm mb-3">
                    When you refer a business that creates qualifying campaigns on PAMBA, you can earn a percentage of the campaign budget:
                  </p>
                  <ul className="text-sm space-y-2">
                    <li>• <span className="font-semibold">1st Generation:</span> 5% of campaign budget</li>
                    <li>• <span className="font-semibold">2nd Generation:</span> 2% of campaign budget</li>
                    <li>• <span className="font-semibold">3rd Generation:</span> 2% of campaign budget</li>
                    <li>• <span className="font-semibold">4th Generation:</span> 1% of campaign budget</li>
                  </ul>
                  <p className="text-xs text-green-700 mt-3">
                    Example: If a business you referred creates a ₦100,000 campaign, you earn ₦5,000 as first-generation commission.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Structure Tab */}
          <TabsContent value="structure" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Multiple Ways to Grow Your Business</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-gray-700">
                    PAMBA is designed to provide multiple pathways to success for advertisers and businesses:
                  </p>

                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6">
                    <div className="space-y-4">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">1</div>
                        <div>
                          <h4 className="font-bold text-gray-900">Run Campaigns</h4>
                          <p className="text-sm text-gray-600">Create and manage marketing campaigns with verified performers</p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">2</div>
                        <div>
                          <h4 className="font-bold text-gray-900">Refer Other Advertisers</h4>
                          <p className="text-sm text-gray-600">Earn ₦{distribution.levels[0].amountLabel} for each advertiser you refer who joins</p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-sm">3</div>
                        <div>
                          <h4 className="font-bold text-gray-900">Build Your Network</h4>
                          <p className="text-sm text-gray-600">Earn referral commissions across 4 generations of referred businesses</p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-sm">4</div>
                        <div>
                          <h4 className="font-bold text-gray-900">Earn Campaign Commissions</h4>
                          <p className="text-sm text-gray-600">Get a percentage of campaign budgets from businesses you introduce</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Our Vision for Advertisers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-gray-700">
                <p className="font-semibold text-lg">
                  PAMBA Business Network is built to transform how businesses access marketing talent and promotional services.
                </p>
                <p className="text-lg font-bold text-indigo-700">
                  There should be more than one way for businesses to grow, and more than one way for advertisers to create value.
                </p>

                <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
                  <p>✓ <span className="font-semibold">When you need promotion:</span> Access a network of verified promoters</p>
                  <p>✓ <span className="font-semibold">When you refer businesses:</span> Earn referral commissions</p>
                  <p>✓ <span className="font-semibold">When businesses launch campaigns:</span> Earn percentage-based commissions</p>
                  <p>✓ <span className="font-semibold">When new opportunities appear:</span> Participate and grow your network effect</p>
                </div>

                <p className="mt-6 font-semibold text-indigo-900">
                  Our goal is to create a sustainable ecosystem where business growth is rewarded and network building 
                  creates measurable value for all participants.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
              <CardContent className="pt-6 text-center">
                <p className="text-lg font-bold text-gray-900 mb-2">
                  PAMBA BUSINESS NETWORK
                </p>
                <div className="space-y-2 text-gray-700 mb-4">
                  <p>Businesses get visibility.</p>
                  <p>Advertisers get promoters.</p>
                  <p>Members get opportunities.</p>
                  <p>Entrepreneurs get a platform.</p>
                  <p>Skills get connected to opportunities.</p>
                  <p>Communities get empowered.</p>
                </div>
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
