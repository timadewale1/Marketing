import { use } from "react";
import ClientEarnerDetail from "./ClientEarnerDetail";

export default function EarnerAdminDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ClientEarnerDetail id={id} />;
}
