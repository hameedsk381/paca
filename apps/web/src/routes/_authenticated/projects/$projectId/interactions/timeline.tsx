import { createFileRoute } from "@tanstack/react-router";

import { InteractionLayout } from "@/components/projects/interactions/interaction-layout";
import { useProjectPermissions } from "@/hooks/use-project-permissions";

export const Route = createFileRoute(
	"/_authenticated/projects/$projectId/interactions/timeline",
)({
	component: TimelinePage,
});

function TimelinePage() {
	const { projectId } = Route.useParams();
	const { hasProjectPermission } = useProjectPermissions(projectId);

	const canCreate = hasProjectPermission("tasks.write");
	const canEdit = hasProjectPermission("tasks.write");
	const canManageViews = hasProjectPermission("projects.write");

	return (
		<InteractionLayout
			projectId={projectId}
			interactionKey={`timeline:${projectId}`}
			title="Timeline"
			description="Epics and long-horizon planning on a roadmap."
			canCreate={canCreate}
			canEdit={canEdit}
			canManageViews={canManageViews}
			sprintId={null}
			context="timeline"
		/>
	);
}
