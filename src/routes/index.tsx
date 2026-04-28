import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "../components/PlaceholderPage";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <PlaceholderPage
      title="Hi, Boss 👋"
      subtitle="Welcome to Bossify — your business, simplified."
    />
  );
}
