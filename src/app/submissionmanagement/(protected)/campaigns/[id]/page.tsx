import SubmissionManagementCampaignDetailClient from "./SubmissionManagementCampaignDetailClient"

export default async function SubmissionManagementCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <SubmissionManagementCampaignDetailClient id={id} />
}
