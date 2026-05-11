import { use } from "react";
import ClientEarnerDetail from "@/app/admin/earners/[id]/ClientEarnerDetail";

export default function SubmissionManagementEarnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ClientEarnerDetail id={id} mode="submissionmanagement" />;
}
