import type {
	GitHubIntegration,
	GitHubRepository,
	LinkRepositoryInput,
	PacaConfig,
	SetTokenInput,
	SuccessEnvelope,
} from "../types/index.js";

/**
 * Extended API client for GitHub integration.
 */
export class PacaAPIGitHubClient {
	private config: PacaConfig;

	constructor(config: PacaConfig) {
		this.config = config;
	}

	private async request(
		method: string,
		path: string,
		body?: any,
	): Promise<any> {
		const url = `${this.config.baseURL}${path}`;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"X-API-Key": this.config.apiKey,
		};

		const options: RequestInit = {
			method,
			headers,
		};

		if (body) {
			options.body = JSON.stringify(body);
		}

		const response = await fetch(url, options);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`API request failed: ${response.status} ${response.statusText} - ${errorText}`,
			);
		}

		const jsonResponse = await response.json();

		// Handle SuccessEnvelope wrapper
		if (
			jsonResponse &&
			typeof jsonResponse === "object" &&
			"success" in jsonResponse
		) {
			const envelope = jsonResponse as SuccessEnvelope<any>;
			if (envelope.success) {
				return envelope.data;
			}
		}

		// Fallback for responses not wrapped in SuccessEnvelope
		return jsonResponse;
	}

	private async get(path: string): Promise<any> {
		return this.request("GET", path);
	}

	private async post(path: string, body: any): Promise<any> {
		return this.request("POST", path, body);
	}

	private async put(path: string, body: any): Promise<any> {
		return this.request("PUT", path, body);
	}

	private async delete(path: string): Promise<any> {
		return this.request("DELETE", path);
	}

	// ==================== Project GitHub Integration ====================

	async getGitHubIntegration(projectId: string): Promise<GitHubIntegration> {
		return this.get(`/api/v1/projects/${projectId}/github`);
	}

	async setGitHubToken(
		projectId: string,
		input: SetTokenInput,
	): Promise<GitHubIntegration> {
		return this.put(`/api/v1/projects/${projectId}/github/token`, input);
	}

	async deleteGitHubToken(projectId: string): Promise<void> {
		await this.delete(`/api/v1/projects/${projectId}/github/token`);
	}

	async listRepositories(projectId: string): Promise<any[]> {
		const response = await this.get(
			`/api/v1/projects/${projectId}/github/repositories`,
		);
		if (Array.isArray(response)) {
			return response;
		}
		return response.items || response.repositories || response.data || [];
	}

	async listLinkedRepositories(projectId: string): Promise<GitHubRepository[]> {
		const response = await this.get(
			`/api/v1/projects/${projectId}/github/linked-repositories`,
		);
		if (Array.isArray(response)) {
			return response;
		}
		return (
			response.items ||
			response.repositories ||
			response.linkedRepositories ||
			response.data ||
			[]
		);
	}

	async linkRepository(
		projectId: string,
		input: LinkRepositoryInput,
	): Promise<GitHubRepository> {
		return this.post(
			`/api/v1/projects/${projectId}/github/linked-repositories`,
			input,
		);
	}

	async unlinkRepository(projectId: string, repoId: string): Promise<void> {
		await this.delete(
			`/api/v1/projects/${projectId}/github/linked-repositories/${repoId}`,
		);
	}
}
