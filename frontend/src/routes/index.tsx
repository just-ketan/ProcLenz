import { createFileRoute, redirect } from "@tanstack/react-router";
import { config } from "@/api/config";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/p/$processKey/overview", params: { processKey: config.defaultProcessKey } });
  },
});
