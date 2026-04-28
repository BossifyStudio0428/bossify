import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "../components/PlaceholderPage";

export const Route = createFileRoute("/customers")({
  component: () => (
    <PlaceholderPage title="Customers" subtitle="Your loyal buyers, all in one list." />
  ),
});