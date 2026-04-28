import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "../components/PlaceholderPage";

export const Route = createFileRoute("/new-order")({
  component: () => (
    <PlaceholderPage title="New Order" subtitle="Create a fresh order in seconds." />
  ),
});