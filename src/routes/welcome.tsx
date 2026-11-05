import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/LandingPage";

export const Route = createFileRoute("/welcome")({ component: Welcome });

function Welcome() {
  return <LandingPage />;
}
