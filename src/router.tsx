import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

const clientMin = () => {
  if (typeof window === "undefined") return 400;
  const min = new URLSearchParams(window.location.search).get("min");
  return min === null ? 400 : Number(min);
};

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPendingMs: 500,
    defaultPendingMinMs: clientMin(),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
