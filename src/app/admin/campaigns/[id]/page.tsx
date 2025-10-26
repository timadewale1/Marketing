import { use } from "react";
import ClientCampaignDetail from "./ClientCampaignDetail";

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ClientCampaignDetail id={id} />;
}
