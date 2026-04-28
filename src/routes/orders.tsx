import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "../components/PlaceholderPage";

export const Route = createFileRoute("/orders")({
  component: () => (
    <PlaceholderPage title="Orders" subtitle="Track every order in one place." />
  ),
});