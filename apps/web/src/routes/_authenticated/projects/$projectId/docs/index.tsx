import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/projects/$projectId/docs/",
)({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/projects/$projectId",
			params: { projectId: params.projectId },
		});
	},
});
