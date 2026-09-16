import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/p/$processKey/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/p/$processKey/overview", params: { processKey: params.processKey } });
  },
});
