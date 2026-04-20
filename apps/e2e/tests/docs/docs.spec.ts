// spec: features/docs/docs.feature
// seed: tests/seed.spec.ts

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost';
const USERNAME = process.env.E2E_USERNAME ?? 'admin';
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-admin-password';
const TEST_PROJECT_PREFIX = 'E2E_DOCS_';
const RUN_ID = Date.now().toString(36).slice(-5).toUpperCase();

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocFolder {
  id: string;
  name: string;
}

interface Document {
  id: string;
  title: string;
}

interface DocSnapshot {
  id: string;
  snapshot_number: number;
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

async function authRequest(request: APIRequestContext): Promise<void> {
  await request.post(`${BASE_URL}/api/v1/auth/login`, {
    data: { username: USERNAME, password: PASSWORD, rememberMe: false },
  });
}

async function cleanupTestProjects(request: APIRequestContext): Promise<void> {
  await authRequest(request);
  const allProjects: Array<{ id: string; name: string }> = [];
  let page = 1;
  while (true) {
    const listResp = await request.get(`${BASE_URL}/api/v1/projects?page=${page}&page_size=100`);
    if (!listResp.ok()) break;
    const body = await listResp.json();
    const items: Array<{ id: string; name: string }> = body?.data?.items ?? [];
    if (items.length === 0) break;
    allProjects.push(...items);
    const { page: currentPage, page_size, total } = body.data as { page: number; page_size: number; total: number };
    if (currentPage * page_size >= total) break;
    page++;
  }
  await Promise.all(
    allProjects
      .filter((p) => p.name.startsWith(TEST_PROJECT_PREFIX))
      .map((p) => request.delete(`${BASE_URL}/api/v1/projects/${p.id}`)),
  );
}

async function createProject(request: APIRequestContext, name: string): Promise<string> {
  const resp = await request.post(`${BASE_URL}/api/v1/projects`, { data: { name } });
  const body = await resp.json();
  return body.data.id as string;
}

async function createFolder(
  request: APIRequestContext,
  projectId: string,
  name: string,
): Promise<DocFolder> {
  const resp = await request.post(`${BASE_URL}/api/v1/projects/${projectId}/docs/folders`, {
    data: { name },
  });
  const body = await resp.json();
  return body.data as DocFolder;
}

async function createDocument(
  request: APIRequestContext,
  projectId: string,
  payload: { title: string; folder_id?: string; content?: unknown },
): Promise<Document> {
  const resp = await request.post(`${BASE_URL}/api/v1/projects/${projectId}/docs`, {
    data: payload,
  });
  const body = await resp.json();
  return body.data as Document;
}

async function updateDocument(
  request: APIRequestContext,
  projectId: string,
  docId: string,
  payload: { title?: string; content?: unknown },
): Promise<void> {
  await request.patch(`${BASE_URL}/api/v1/projects/${projectId}/docs/${docId}`, {
    data: payload,
  });
}

async function listSnapshots(
  request: APIRequestContext,
  projectId: string,
  docId: string,
): Promise<DocSnapshot[]> {
  const resp = await request.get(`${BASE_URL}/api/v1/projects/${projectId}/docs/${docId}/snapshots`);
  const body = await resp.json();
  return (body?.data?.items ?? []) as DocSnapshot[];
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

const signIn = async (page: Page) => {
  await page.goto(`${BASE_URL}/`);
  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/i })).toBeVisible();
};

const navigateToDocsPage = async (page: Page, projectId: string) => {
  await page.goto(`${BASE_URL}/projects/${projectId}/docs`);
  await expect(page.getByRole('heading', { name: /docs/i })).toBeVisible({ timeout: 10_000 });
};

// ─── Test Suites ──────────────────────────────────────────────────────────────

// ===========================================================================
// Rule: Document folders
// ===========================================================================

test.describe('Document folder management', () => {
  let projectId: string;

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}FOLDERS_${RUN_ID}`);
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Create a new folder', async ({ page }) => {
    await signIn(page);
    await navigateToDocsPage(page, projectId);

    await page.getByRole('button', { name: 'New Folder' }).click();
    const input = page.getByRole('textbox', { name: /folder name/i });
    await expect(input).toBeVisible();
    await input.fill('Architecture');
    await page.getByRole('button', { name: /confirm|create|save/i }).click();

    await expect(page.getByRole('listitem').filter({ hasText: 'Architecture' })).toBeVisible({ timeout: 8_000 });
  });

  test('Rename an existing folder', async ({ page, request }) => {
    await createFolder(request, projectId, 'Old Name');

    await signIn(page);
    await navigateToDocsPage(page, projectId);

    const folderItem = page.getByRole('listitem').filter({ hasText: 'Old Name' });
    await folderItem.getByRole('button', { name: /options|more/i }).click();
    await page.getByRole('menuitem', { name: /rename/i }).click();

    const input = page.getByRole('textbox');
    await input.clear();
    await input.fill('New Name');
    await page.getByRole('button', { name: /confirm|save/i }).click();

    await expect(page.getByRole('listitem').filter({ hasText: 'New Name' })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('listitem').filter({ hasText: 'Old Name' })).not.toBeVisible();
  });

  test('Delete an existing folder', async ({ page, request }) => {
    await createFolder(request, projectId, 'To Delete');

    await signIn(page);
    await navigateToDocsPage(page, projectId);

    const folderItem = page.getByRole('listitem').filter({ hasText: 'To Delete' });
    await folderItem.getByRole('button', { name: /options|more/i }).click();
    await page.getByRole('menuitem', { name: /delete/i }).click();
    await page.getByRole('button', { name: /confirm|delete/i }).click();

    await expect(page.getByRole('listitem').filter({ hasText: 'To Delete' })).not.toBeVisible({ timeout: 8_000 });
  });
});

// ===========================================================================
// Rule: Document lifecycle
// ===========================================================================

test.describe('Document lifecycle', () => {
  let projectId: string;

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}LIFECYCLE_${RUN_ID}`);
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Create a document at the project root', async ({ page }) => {
    await signIn(page);
    await navigateToDocsPage(page, projectId);

    await page.getByRole('button', { name: 'New Document' }).click();

    // Editor should open with default title
    await expect(page.getByRole('textbox', { name: /title/i })).toBeVisible({ timeout: 8_000 });
    // Document should appear in sidebar/list
    await expect(page.getByText('Untitled')).toBeVisible({ timeout: 8_000 });
  });

  test('Create a document inside a folder', async ({ page, request }) => {
    const folder = await createFolder(request, projectId, 'Engineering');

    await signIn(page);
    await navigateToDocsPage(page, projectId);

    const folderItem = page.getByRole('listitem').filter({ hasText: 'Engineering' });
    await folderItem.getByRole('button', { name: /new document/i }).click();

    // New document editor should open
    await expect(page.getByRole('textbox', { name: /title/i })).toBeVisible({ timeout: 8_000 });

    // Verify the document appears under the folder
    const folderSection = page.locator('[data-folder-id]').filter({ has: page.getByText('Engineering') });
    await expect(folderSection.getByText('Untitled')).toBeVisible({ timeout: 8_000 });

    // API verification
    const resp = await request.get(
      `${BASE_URL}/api/v1/projects/${projectId}/docs?folder_id=${folder.id}`,
    );
    const body = await resp.json();
    expect(body.data.items.length).toBeGreaterThan(0);
  });

  test('Rename a document via the title field', async ({ page, request }) => {
    const doc = await createDocument(request, projectId, { title: 'Draft' });

    await signIn(page);
    await page.goto(`${BASE_URL}/projects/${projectId}/docs/${doc.id}`);

    const titleInput = page.getByRole('textbox', { name: /title/i });
    await expect(titleInput).toBeVisible({ timeout: 8_000 });
    await titleInput.clear();
    await titleInput.fill('Final');
    // Trigger save (Ctrl+S or blur)
    await titleInput.press('Enter');

    await expect(page.getByRole('heading', { name: 'Final' })).toBeVisible({ timeout: 8_000 });
  });

  test('Delete a document', async ({ page, request }) => {
    const doc = await createDocument(request, projectId, { title: 'Temporary Doc' });

    await signIn(page);
    await navigateToDocsPage(page, projectId);

    const docItem = page.getByRole('listitem').filter({ hasText: doc.title });
    await docItem.getByRole('button', { name: /options|more/i }).click();
    await page.getByRole('menuitem', { name: /delete/i }).click();
    await page.getByRole('button', { name: /confirm|delete/i }).click();

    await expect(page.getByRole('listitem').filter({ hasText: doc.title })).not.toBeVisible({ timeout: 8_000 });
  });
});

// ===========================================================================
// Rule: Document editor with BlockNote
// ===========================================================================

test.describe('Document editor', () => {
  let projectId: string;
  let doc: Document;

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}EDITOR_${RUN_ID}`);
    doc = await createDocument(request, projectId, {
      title: 'E2E_EDITOR_DOC',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Version 1' }] }] },
    });
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Editor loads existing document content', async ({ page }) => {
    await signIn(page);
    await page.goto(`${BASE_URL}/projects/${projectId}/docs/${doc.id}`);

    // BlockNote editor container should be present
    await expect(page.locator('.bn-editor, [data-testid="blocknote-editor"]')).toBeVisible({ timeout: 10_000 });
    // Title field shows the document title
    await expect(page.getByRole('textbox', { name: /title/i })).toHaveValue('E2E_EDITOR_DOC', { timeout: 10_000 });
  });

  test('User can type content into the editor', async ({ page }) => {
    await signIn(page);
    await page.goto(`${BASE_URL}/projects/${projectId}/docs/${doc.id}`);

    const editor = page.locator('.bn-editor, [data-testid="blocknote-editor"]');
    await expect(editor).toBeVisible({ timeout: 10_000 });

    // Click into editor and type
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Hello World');

    // Save with keyboard shortcut
    await page.keyboard.press('Control+s');
    await expect(editor.getByText('Hello World')).toBeVisible({ timeout: 8_000 });
  });

  test('Saving updated content creates a new snapshot', async ({ page }) => {
    await signIn(page);
    await page.goto(`${BASE_URL}/projects/${projectId}/docs/${doc.id}`);

    const editor = page.locator('.bn-editor, [data-testid="blocknote-editor"]');
    await expect(editor).toBeVisible({ timeout: 10_000 });

    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Version 2');
    await page.keyboard.press('Control+s');

    // Wait for save confirmation
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 8_000 });

    // Verify snapshot via API
    // Allow brief async flush
    await page.waitForTimeout(500);
    const snaps = await listSnapshots(page.request, projectId, doc.id);
    expect(snaps.length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// Rule: Document history and snapshots
// ===========================================================================

test.describe('Document history', () => {
  let projectId: string;
  let doc: Document;

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}HISTORY_${RUN_ID}`);
    doc = await createDocument(request, projectId, {
      title: 'E2E_HISTORY_DOC',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Initial' }] }] },
    });
    // Generate a snapshot by updating the content
    await updateDocument(request, projectId, doc.id, {
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated' }] }] },
    });
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('User can view snapshot history', async ({ page }) => {
    await signIn(page);
    await page.goto(`${BASE_URL}/projects/${projectId}/docs/${doc.id}`);

    // Open the history panel (button in toolbar or sidebar)
    await page.getByRole('button', { name: /history|snapshots/i }).click();

    await expect(page.getByRole('list', { name: /history|snapshots/i })).toBeVisible({ timeout: 8_000 });
    // At least one snapshot entry
    await expect(page.getByRole('listitem').filter({ hasText: /snapshot|version/i }).first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('User can view a specific snapshot in read-only mode', async ({ page }) => {
    await signIn(page);
    await page.goto(`${BASE_URL}/projects/${projectId}/docs/${doc.id}`);

    await page.getByRole('button', { name: /history|snapshots/i }).click();

    const firstSnapshot = page.getByRole('listitem').filter({ hasText: /snapshot|version/i }).first();
    await expect(firstSnapshot).toBeVisible({ timeout: 8_000 });
    await firstSnapshot.click();

    // Editor should be in read-only mode when viewing a snapshot
    const editor = page.locator('.bn-editor, [data-testid="blocknote-editor"]');
    await expect(editor).toBeVisible({ timeout: 8_000 });
    await expect(editor).toHaveAttribute('contenteditable', 'false');
  });
});

// ===========================================================================
// Rule: Document comments and activity
// ===========================================================================

test.describe('Document comments and activity', () => {
  let projectId: string;
  let doc: Document;

  test.beforeEach(async ({ request, context }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}COMMENTS_${RUN_ID}`);
    doc = await createDocument(request, projectId, { title: 'E2E_COMMENT_DOC' });
    await context.clearCookies();
    await context.clearPermissions();
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Activity panel shows a document creation event', async ({ page }) => {
    await signIn(page);
    await page.goto(`${BASE_URL}/projects/${projectId}/docs/${doc.id}`);

    await expect(page.getByText(/document created/i)).toBeVisible({ timeout: 10_000 });
  });

  test('User can add a comment to a document', async ({ page }) => {
    await signIn(page);
    await page.goto(`${BASE_URL}/projects/${projectId}/docs/${doc.id}`);

    const commentInput = page.getByRole('textbox', { name: /comment/i });
    await expect(commentInput).toBeVisible({ timeout: 8_000 });
    await commentInput.fill('Great document!');
    await page.getByRole('button', { name: /submit|add comment|send/i }).click();

    await expect(page.getByText('Great document!')).toBeVisible({ timeout: 8_000 });
  });

  test('User can edit their own comment', async ({ page }) => {
    await signIn(page);
    await page.goto(`${BASE_URL}/projects/${projectId}/docs/${doc.id}`);

    // Add comment first
    const commentInput = page.getByRole('textbox', { name: /comment/i });
    await commentInput.fill('Original comment');
    await page.getByRole('button', { name: /submit|add comment|send/i }).click();
    await expect(page.getByText('Original comment')).toBeVisible({ timeout: 8_000 });

    // Edit the comment
    const commentItem = page.locator('[data-comment-id], [data-activity-type="comment"]').filter({
      hasText: 'Original comment',
    });
    await commentItem.getByRole('button', { name: /options|more/i }).click();
    await page.getByRole('menuitem', { name: /edit/i }).click();

    const editInput = page.getByRole('textbox', { name: /comment/i });
    await editInput.clear();
    await editInput.fill('Updated comment');
    await page.getByRole('button', { name: /save|update/i }).click();

    await expect(page.getByText('Updated comment')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Original comment')).not.toBeVisible();
  });

  test('User can delete their own comment', async ({ page }) => {
    await signIn(page);
    await page.goto(`${BASE_URL}/projects/${projectId}/docs/${doc.id}`);

    const commentInput = page.getByRole('textbox', { name: /comment/i });
    await commentInput.fill('Delete me');
    await page.getByRole('button', { name: /submit|add comment|send/i }).click();
    await expect(page.getByText('Delete me')).toBeVisible({ timeout: 8_000 });

    const commentItem = page.locator('[data-comment-id], [data-activity-type="comment"]').filter({
      hasText: 'Delete me',
    });
    await commentItem.getByRole('button', { name: /options|more/i }).click();
    await page.getByRole('menuitem', { name: /delete/i }).click();
    await page.getByRole('button', { name: /confirm|delete/i }).click();

    await expect(page.getByText('Delete me')).not.toBeVisible({ timeout: 8_000 });
  });

  // ─── API-level tests (fast, no full UI interaction needed) ─────────────────

  test('POST /comments with empty text returns 400', async ({ request }) => {
    await authRequest(request);
    const resp = await request.post(`${BASE_URL}/api/v1/projects/${projectId}/docs/${doc.id}/comments`, {
      data: { text: '   ' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error_code).toBe('DOC_COMMENT_TEXT_INVALID');
  });
});

// ===========================================================================
// Rule: API-level access control (fast, no browser)
// ===========================================================================

test.describe('Document API access control', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    await cleanupTestProjects(request);
    projectId = await createProject(request, `${TEST_PROJECT_PREFIX}ACL_${RUN_ID}`);
  });

  test.afterEach(async ({ request }) => {
    await cleanupTestProjects(request);
  });

  test('Unauthenticated request returns 401', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/v1/projects/${projectId}/docs`);
    expect(resp.status()).toBe(401);
  });

  test('Authenticated user can list documents', async ({ request }) => {
    await authRequest(request);
    const resp = await request.get(`${BASE_URL}/api/v1/projects/${projectId}/docs`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.data).toHaveProperty('items');
  });

  test('Authenticated user can create a document', async ({ request }) => {
    await authRequest(request);
    const resp = await request.post(`${BASE_URL}/api/v1/projects/${projectId}/docs`, {
      data: { title: 'API Test Doc' },
    });
    expect(resp.status()).toBe(201);
  });

  test('Creating a document with empty title defaults to Untitled', async ({ request }) => {
    await authRequest(request);
    const resp = await request.post(`${BASE_URL}/api/v1/projects/${projectId}/docs`, {
      data: { title: '' },
    });
    expect(resp.status()).toBe(201);
    const body = await resp.json();
    expect(body.data.title).toBe('Untitled');
  });

  test('Patching a document with empty title returns 400', async ({ request }) => {
    await authRequest(request);
    const doc = await createDocument(request, projectId, { title: 'Has Title' });
    const resp = await request.patch(`${BASE_URL}/api/v1/projects/${projectId}/docs/${doc.id}`, {
      data: { title: '  ' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error_code).toBe('DOC_TITLE_INVALID');
  });

  test('GET non-existent document returns 404', async ({ request }) => {
    await authRequest(request);
    const resp = await request.get(
      `${BASE_URL}/api/v1/projects/${projectId}/docs/00000000-0000-0000-0000-000000000000`,
    );
    expect(resp.status()).toBe(404);
    const body = await resp.json();
    expect(body.error_code).toBe('DOC_NOT_FOUND');
  });

  test('Creating a folder with blank name returns 400', async ({ request }) => {
    await authRequest(request);
    const resp = await request.post(`${BASE_URL}/api/v1/projects/${projectId}/docs/folders`, {
      data: { name: '   ' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error_code).toBe('DOC_FOLDER_NAME_INVALID');
  });

  test('Deleting a non-existent folder returns 404', async ({ request }) => {
    await authRequest(request);
    const resp = await request.delete(
      `${BASE_URL}/api/v1/projects/${projectId}/docs/folders/00000000-0000-0000-0000-000000000000`,
    );
    expect(resp.status()).toBe(404);
    const body = await resp.json();
    expect(body.error_code).toBe('DOC_FOLDER_NOT_FOUND');
  });

  test('Folder CRUD lifecycle', async ({ request }) => {
    await authRequest(request);

    // Create
    const folder = await createFolder(request, projectId, 'API Folder');
    expect(folder.id).toBeTruthy();
    expect(folder.name).toBe('API Folder');

    // List
    const listResp = await request.get(`${BASE_URL}/api/v1/projects/${projectId}/docs/folders`);
    const listBody = await listResp.json();
    expect(listBody.data.items.some((f: DocFolder) => f.id === folder.id)).toBe(true);

    // Rename
    const patchResp = await request.patch(
      `${BASE_URL}/api/v1/projects/${projectId}/docs/folders/${folder.id}`,
      { data: { name: 'Renamed Folder' } },
    );
    expect(patchResp.status()).toBe(200);

    // Delete
    const delResp = await request.delete(
      `${BASE_URL}/api/v1/projects/${projectId}/docs/folders/${folder.id}`,
    );
    expect(delResp.status()).toBe(204);
  });

  test('Document content update creates a snapshot', async ({ request }) => {
    await authRequest(request);
    const doc = await createDocument(request, projectId, {
      title: 'Snapshot Test',
      content: { type: 'doc', content: [] },
    });

    // Initial: no snapshots
    const before = await listSnapshots(request, projectId, doc.id);
    expect(before).toHaveLength(0);

    // Update content — triggers snapshot
    await updateDocument(request, projectId, doc.id, {
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });

    const after = await listSnapshots(request, projectId, doc.id);
    expect(after.length).toBeGreaterThanOrEqual(1);
  });

  test('Snapshot not found returns 404', async ({ request }) => {
    await authRequest(request);
    const doc = await createDocument(request, projectId, { title: 'No Snaps' });
    const resp = await request.get(
      `${BASE_URL}/api/v1/projects/${projectId}/docs/${doc.id}/snapshots/00000000-0000-0000-0000-000000000000`,
    );
    expect(resp.status()).toBe(404);
    const body = await resp.json();
    expect(body.error_code).toBe('DOC_SNAPSHOT_NOT_FOUND');
  });

  test('Filter documents by folder_id', async ({ request }) => {
    await authRequest(request);
    const folder = await createFolder(request, projectId, 'Filtered');
    await createDocument(request, projectId, { title: 'In Folder', folder_id: folder.id });
    await createDocument(request, projectId, { title: 'Root Doc' });

    const resp = await request.get(
      `${BASE_URL}/api/v1/projects/${projectId}/docs?folder_id=${folder.id}`,
    );
    const body = await resp.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].title).toBe('In Folder');
  });
});
