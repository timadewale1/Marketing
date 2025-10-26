import { use } from "react";
import ClientUserDetail from "./ClientUserDetail";

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ClientUserDetail id={id} />;
}

