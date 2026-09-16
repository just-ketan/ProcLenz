import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { isApiRequestError } from "./api/errors";
import { routeTree } from "./routeTree.gen";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // Retry only what the backend classifies as transient: transport failures and 503.
        retry: (failureCount, error) => isApiRequestError(error) && error.isRetryable && failureCount < 3,
        retryDelay: (attempt, error) =>
          isApiRequestError(error) && error.retryAfterSeconds !== undefined
            ? error.retryAfterSeconds * 1_000
            : Math.min(1_000 * 2 ** attempt, 10_000),
      },
      mutations: { retry: false },
    },
  });
}

export const getRouter = () => {
  const queryClient = createQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
