import { createFileRoute } from "@tanstack/react-router";

declare global {
  interface Window {
    skeletonAttaches?: number;
  }
}

const countAttach = (element: HTMLDivElement | null) => {
  if (element) window.skeletonAttaches = (window.skeletonAttaches ?? 0) + 1;
};

export const Route = createFileRoute("/dashboard")({
  ssr: "data-only",
  loader: () => ({ greeting: "Welcome back" }),
  pendingComponent: Skeleton,
  component: Dashboard,
});

function Skeleton() {
  return (
    <div
      data-skeleton
      ref={countAttach}
    >
      Loading dashboard…
    </div>
  );
}

function Dashboard() {
  const { greeting } = Route.useLoaderData();
  return <h1 data-content>{greeting}</h1>;
}
