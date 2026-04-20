import { queryOptions } from "@tanstack/react-query";

import { apiClient } from "./api-client";
import type { SuccessEnvelope } from "./api-error";

// ── Shapes ────────────────────────────────────────────────────────────────────

export interface DocFolder {
	id: string;
	project_id: string;
	parent_id: string | null;
	name: string;
	position: number;
	created_by: string;
	created_at: string;
	updated_at: string;
}

export interface DocFolderListResult {
	items: DocFolder[];
}

export interface Document {
	id: string;
	project_id: string;
	folder_id: string | null;
	title: string;
	content: unknown[] | null;
	position: number;
	created_by: string;
	updated_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface DocumentListResult {
	items: Document[];
}

export interface DocSnapshot {
	id: string;
	document_id: string;
	title: string;
	content: unknown[] | null;
	snapshot_number: number;
	created_by: string;
	created_at: string;
}

export interface DocSnapshotListResult {
	items: DocSnapshot[];
}

export type DocActivityType =
	| "doc.created"
	| "doc.updated"
	| "doc.deleted"
	| "doc.moved"
	| "doc.folder.created"
	| "doc.folder.updated"
	| "doc.folder.deleted"
	| "comment";

export interface FieldChange {
	field: string;
	old: string;
	new: string;
}

export interface DocActivity {
	id: string;
	document_id: string;
	actor_id: string;
	actor_name: string;
	actor_username: string;
	activity_type: DocActivityType;
	content: string;
	changes: FieldChange[] | null;
	created_at: string;
	updated_at: string;
}

export interface DocActivityListResult {
	items: DocActivity[];
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const docQueryKeys = {
	all: (projectId: string) => ["projects", projectId, "docs"] as const,
	folders: (projectId: string) =>
		["projects", projectId, "docs", "folders"] as const,
	list: (projectId: string, folderId?: string) =>
		folderId
			? (["projects", projectId, "docs", "list", folderId] as const)
			: (["projects", projectId, "docs", "list"] as const),
	detail: (projectId: string, docId: string) =>
		["projects", projectId, "docs", docId] as const,
	snapshots: (projectId: string, docId: string) =>
		["projects", projectId, "docs", docId, "snapshots"] as const,
	snapshot: (projectId: string, docId: string, snapshotId: string) =>
		["projects", projectId, "docs", docId, "snapshots", snapshotId] as const,
	activities: (projectId: string, docId: string) =>
		["projects", projectId, "docs", docId, "activities"] as const,
};

// ── Query options ─────────────────────────────────────────────────────────────

export const docFoldersQueryOptions = (projectId: string) =>
	queryOptions({
		queryKey: docQueryKeys.folders(projectId),
		queryFn: () => listFolders(projectId),
	});

export const docListQueryOptions = (projectId: string, folderId?: string) =>
	queryOptions({
		queryKey: docQueryKeys.list(projectId, folderId),
		queryFn: () => listDocuments(projectId, folderId),
	});

export const docQueryOptions = (projectId: string, docId: string) =>
	queryOptions({
		queryKey: docQueryKeys.detail(projectId, docId),
		queryFn: () => getDocument(projectId, docId),
		enabled: !!docId,
	});

export const docSnapshotsQueryOptions = (projectId: string, docId: string) =>
	queryOptions({
		queryKey: docQueryKeys.snapshots(projectId, docId),
		queryFn: () => listSnapshots(projectId, docId),
		enabled: !!docId,
	});

export const docSnapshotQueryOptions = (
	projectId: string,
	docId: string,
	snapshotId: string,
) =>
	queryOptions({
		queryKey: docQueryKeys.snapshot(projectId, docId, snapshotId),
		queryFn: () => getSnapshot(projectId, docId, snapshotId),
		enabled: !!snapshotId,
	});

export const docActivitiesQueryOptions = (projectId: string, docId: string) =>
	queryOptions({
		queryKey: docQueryKeys.activities(projectId, docId),
		queryFn: () => listActivities(projectId, docId),
		enabled: !!docId,
	});

// ── Folder API ────────────────────────────────────────────────────────────────

export async function listFolders(projectId: string): Promise<DocFolder[]> {
	const { data } = await apiClient.instance.get<
		SuccessEnvelope<DocFolderListResult>
	>(`/projects/${projectId}/docs/folders`);
	return data.data.items;
}

export async function createFolder(
	projectId: string,
	payload: { name: string; parent_id?: string; position?: number },
): Promise<DocFolder> {
	const { data } = await apiClient.instance.post<SuccessEnvelope<DocFolder>>(
		`/projects/${projectId}/docs/folders`,
		payload,
	);
	return data.data;
}

export async function updateFolder(
	projectId: string,
	folderId: string,
	payload: { name?: string; parent_id?: string | null; position?: number },
): Promise<DocFolder> {
	const { data } = await apiClient.instance.patch<SuccessEnvelope<DocFolder>>(
		`/projects/${projectId}/docs/folders/${folderId}`,
		payload,
	);
	return data.data;
}

export async function deleteFolder(
	projectId: string,
	folderId: string,
): Promise<void> {
	await apiClient.instance.delete(
		`/projects/${projectId}/docs/folders/${folderId}`,
	);
}

// ── Document API ──────────────────────────────────────────────────────────────

export async function listDocuments(
	projectId: string,
	folderId?: string,
): Promise<Document[]> {
	const { data } = await apiClient.instance.get<
		SuccessEnvelope<DocumentListResult>
	>(`/projects/${projectId}/docs`, {
		params: folderId ? { folder_id: folderId } : undefined,
	});
	return data.data.items;
}

export async function getDocument(
	projectId: string,
	docId: string,
): Promise<Document> {
	const { data } = await apiClient.instance.get<SuccessEnvelope<Document>>(
		`/projects/${projectId}/docs/${docId}`,
	);
	return data.data;
}

export async function createDocument(
	projectId: string,
	payload: {
		title?: string;
		folder_id?: string | null;
		content?: unknown[] | null;
		position?: number;
	},
): Promise<Document> {
	const { data } = await apiClient.instance.post<SuccessEnvelope<Document>>(
		`/projects/${projectId}/docs`,
		payload,
	);
	return data.data;
}

export async function updateDocument(
	projectId: string,
	docId: string,
	payload: {
		title?: string;
		content?: unknown[] | null;
		folder_id?: string | null;
		position?: number;
	},
): Promise<Document> {
	const { data } = await apiClient.instance.patch<SuccessEnvelope<Document>>(
		`/projects/${projectId}/docs/${docId}`,
		payload,
	);
	return data.data;
}

export async function deleteDocument(
	projectId: string,
	docId: string,
): Promise<void> {
	await apiClient.instance.delete(`/projects/${projectId}/docs/${docId}`);
}

// ── Snapshot API ──────────────────────────────────────────────────────────────

export async function listSnapshots(
	projectId: string,
	docId: string,
): Promise<DocSnapshot[]> {
	const { data } = await apiClient.instance.get<
		SuccessEnvelope<DocSnapshotListResult>
	>(`/projects/${projectId}/docs/${docId}/snapshots`);
	return data.data.items;
}

export async function getSnapshot(
	projectId: string,
	docId: string,
	snapshotId: string,
): Promise<DocSnapshot> {
	const { data } = await apiClient.instance.get<SuccessEnvelope<DocSnapshot>>(
		`/projects/${projectId}/docs/${docId}/snapshots/${snapshotId}`,
	);
	return data.data;
}

// ── Activity / Comment API ────────────────────────────────────────────────────

export async function listActivities(
	projectId: string,
	docId: string,
): Promise<DocActivity[]> {
	const { data } = await apiClient.instance.get<
		SuccessEnvelope<DocActivityListResult>
	>(`/projects/${projectId}/docs/${docId}/activities`);
	return data.data.items;
}

export async function addDocComment(
	projectId: string,
	docId: string,
	text: string,
): Promise<DocActivity> {
	const { data } = await apiClient.instance.post<SuccessEnvelope<DocActivity>>(
		`/projects/${projectId}/docs/${docId}/comments`,
		{ text },
	);
	return data.data;
}

export async function updateDocComment(
	projectId: string,
	docId: string,
	commentId: string,
	text: string,
): Promise<DocActivity> {
	const { data } = await apiClient.instance.patch<SuccessEnvelope<DocActivity>>(
		`/projects/${projectId}/docs/${docId}/comments/${commentId}`,
		{ text },
	);
	return data.data;
}

export async function deleteDocComment(
	projectId: string,
	docId: string,
	commentId: string,
): Promise<void> {
	await apiClient.instance.delete(
		`/projects/${projectId}/docs/${docId}/comments/${commentId}`,
	);
}
