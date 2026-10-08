# A data-only route mounts a second pending component after hydration when `pendingMinMs` is set

A minimal TanStack Start app. A route with `ssr: 'data-only'` and a `pendingComponent` server-renders that pending component, and the client hydrates it. With `defaultPendingMinMs` set, the router keeps the hydrated match pending for `pendingMinMs`. Meanwhile `ClientOnly` in `matchView` switches from its fallback to `<MatchInner>`, which throws `router._tx[5]` because the match is still pending. React then hides the hydrated pending component (`display: none`) and mounts a second copy from the Suspense fallback. The page holds two pending components, one of them hidden, and any animation in the pending UI restarts.

## Versions

| Package | Version |
| --- | --- |
| `@tanstack/react-router` | 1.170.41 (also `main` at 663282b0e) |
| `@tanstack/router-core` | 1.171.34 |
| `@tanstack/react-start` | 1.168.60 |
| `react`, `react-dom` | 19.2.8 |
| `vite` | 8.3.1 |

## The app

- `src/routes/dashboard.tsx`: `ssr: 'data-only'`, an instant `loader`, a `pendingComponent` that renders `<div data-skeleton>` and counts ref attaches, and a component that renders `<h1 data-content>`.
- `src/router.tsx`: `defaultPendingMs: 500`, and `defaultPendingMinMs` read from `?min=` on the client (400 when absent).

## Run it

```sh
pnpm i
pnpm test
```

`pnpm test` builds, starts `vite preview` on port 7302, and loads `/dashboard` in Chromium three times for each scenario. An init script records every distinct `[data-skeleton]` element, the most present at once, and when `[data-content]` appears. A load fails if more than one skeleton element ever exists. The scenarios are:

- `pendingMinMs` 400
- `pendingMinMs` 0, as a control
- `pendingMinMs` 0 with the route chunk held for 300 ms, a second control showing that a slow chunk alone does not cause it

## Expected

The server-rendered skeleton is the only skeleton. It stays mounted until the content replaces it.

## Actual

```
FAIL pendingMinMs=400, route chunk delay 0 ms, run 1: server skeleton true, skeleton elements 2, ref attaches 2, most in the DOM at once 2 (1 visible), content at 617 ms
FAIL pendingMinMs=400, route chunk delay 0 ms, run 2: server skeleton true, skeleton elements 2, ref attaches 2, most in the DOM at once 2 (1 visible), content at 474 ms
FAIL pendingMinMs=400, route chunk delay 0 ms, run 3: server skeleton true, skeleton elements 2, ref attaches 2, most in the DOM at once 2 (1 visible), content at 472 ms
ok   pendingMinMs=0, route chunk delay 0 ms, run 1: server skeleton true, skeleton elements 1, ref attaches 1, most in the DOM at once 1 (1 visible), content at 73 ms
...
ok   pendingMinMs=0, route chunk delay 300 ms, run 1: server skeleton true, skeleton elements 1, ref attaches 1, most in the DOM at once 1 (1 visible), content at 321 ms
...
3/9 loads mounted a second skeleton
```

## Why

On the server, `matchView` renders a data-only match as `<ClientOnly fallback={pendingElement}>`, so the HTML holds the pending component. `hydrate()` presents the boundary as `status: 'pending'`. `offerPending` finds that presented pending match with no session and starts `pendingMinMs` from now ("conservatively start pendingMinMs from now"). After hydration, `ClientOnly` renders its children. `MatchInner` sees `status === 'pending'` with a live `router._tx` and throws `router._tx[5]`. Because this is not a transition, React hides the already-mounted primary content, which is the hydrated pending component, and shows the Suspense fallback: a second `pendingElement`.

With `pendingMinMs: 0` the transaction is usually finished before `ClientOnly` switches, so nothing suspends. The bug needs the match to still be pending when `ClientOnly` switches. `pendingMinMs` makes that certain.
