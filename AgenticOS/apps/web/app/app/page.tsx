import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { isClerkAuthMode } from "@/lib/auth-mode";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { redirect } from "next/navigation";

export default async function AppPage() {
  const identity = await getRuntimeIdentity();

  if (!identity && isClerkAuthMode()) {
    redirect("/sign-in");
  }

  return <WorkspaceShell email={identity?.email ?? "workspace@one.local"} />;
}
