import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "../components/PlaceholderPage";

export const Route = createFileRoute("/inventory")({
  component: () => (
    <PlaceholderPage title="Inventory" subtitle="Manage your products & stock." />
  ),
});