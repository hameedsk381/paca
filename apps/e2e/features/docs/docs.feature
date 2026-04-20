@docs
Feature: Documentation
  The documentation feature lets project members create, organise, and
  collaboratively edit rich-text documents (using BlockNote) inside a
  project. Documents can be grouped in folders, each edit creates a
  snapshot for history tracking, and members can add threaded comments.

  @authenticated
  Rule: Document folders

    Background:
      Given the user already has a stored authenticated session
      And a project named "E2E_DOCS_FOLDERS" exists
      And the user is a member of the project with "docs.write" permission
      And the user has navigated to the Docs page of "E2E_DOCS_FOLDERS"

    Scenario: Create a new folder
      When the user clicks "New Folder"
      And the user types "Architecture" as the folder name
      And the user confirms the folder creation
      Then a folder named "Architecture" should appear in the folder list

    Scenario: Rename an existing folder
      Given a folder named "Old Name" exists in the project
      When the user opens the folder options for "Old Name"
      And the user selects "Rename"
      And the user types "New Name" as the folder name
      And the user confirms the rename
      Then the folder list should show "New Name" instead of "Old Name"

    Scenario: Delete an existing folder
      Given a folder named "To Delete" exists in the project
      When the user opens the folder options for "To Delete"
      And the user selects "Delete"
      And the user confirms the deletion
      Then the folder named "To Delete" should no longer appear in the folder list

    Scenario: Member without write permission cannot create a folder
      Given the user is a member of the project with only "docs.read" permission
      Then the "New Folder" button should not be visible

  @authenticated
  Rule: Document lifecycle

    Background:
      Given the user already has a stored authenticated session
      And a project named "E2E_DOCS_LIFECYCLE" exists
      And the user is a member of the project with "docs.write" permission
      And the user has navigated to the Docs page of "E2E_DOCS_LIFECYCLE"

    Scenario: Create a document at the project root
      When the user clicks "New Document"
      Then a new document editor should open with title "Untitled"
      And the document should appear in the document list

    Scenario: Create a document inside a folder
      Given a folder named "Engineering" exists in the project
      When the user clicks "New Document" inside the "Engineering" folder
      Then the new document should be visible under the "Engineering" folder

    Scenario: Empty title defaults to "Untitled"
      When the user clicks "New Document"
      And the user leaves the title blank
      And the user saves the document
      Then the document title should be "Untitled"

    Scenario: Rename a document
      Given a document named "Draft" exists in the project
      When the user opens the document "Draft"
      And the user changes the title to "Final"
      And the user saves the document
      Then the document list should show "Final"

    Scenario: Delete a document
      Given a document named "Temporary Doc" exists in the project
      When the user opens the document options for "Temporary Doc"
      And the user selects "Delete"
      And the user confirms the deletion
      Then "Temporary Doc" should no longer appear in the document list

    Scenario: Member without write permission can view but not edit a document
      Given a document named "Read-Only Doc" exists in the project
      And the user is a member of the project with only "docs.read" permission
      When the user opens the document "Read-Only Doc"
      Then the document editor should be in read-only mode

  @authenticated
  Rule: Document editor with BlockNote

    Background:
      Given the user already has a stored authenticated session
      And a project named "E2E_DOCS_EDITOR" exists
      And the user is a member of the project with "docs.write" permission
      And the user has navigated to the Docs page of "E2E_DOCS_EDITOR"
      And a document named "E2E_EDITOR_DOC" exists in the project

    Scenario: Editor loads existing document content
      When the user opens the document "E2E_EDITOR_DOC"
      Then the BlockNote editor should be visible
      And the document title should be displayed in the title field

    Scenario: User can type content into the editor
      When the user opens the document "E2E_EDITOR_DOC"
      And the user types "Hello World" into the editor
      And the user saves the document
      Then the editor should display "Hello World"

    Scenario: Saving creates a new snapshot
      Given the document "E2E_EDITOR_DOC" already has content "Version 1"
      When the user opens the document "E2E_EDITOR_DOC"
      And the user changes the content to "Version 2"
      And the user saves the document
      Then the document history should contain at least 1 snapshot

  @authenticated
  Rule: Document history and snapshots

    Background:
      Given the user already has a stored authenticated session
      And a project named "E2E_DOCS_HISTORY" exists
      And the user is a member of the project with "docs.write" permission
      And a document named "E2E_HISTORY_DOC" with multiple snapshots exists in the project
      And the user has navigated to the Docs page of "E2E_DOCS_HISTORY"

    Scenario: User can view snapshot history
      When the user opens the document "E2E_HISTORY_DOC"
      And the user opens the history panel
      Then a list of snapshots should be visible
      And each snapshot should show a timestamp

    Scenario: User can view a specific snapshot
      When the user opens the document "E2E_HISTORY_DOC"
      And the user opens the history panel
      And the user clicks on a snapshot entry
      Then the snapshot content should be displayed in read-only mode

  @authenticated
  Rule: Document comments and activity

    Background:
      Given the user already has a stored authenticated session
      And a project named "E2E_DOCS_COMMENTS" exists
      And the user is a member of the project with "docs.write" permission
      And a document named "E2E_COMMENT_DOC" exists in the project
      And the user has navigated to the document "E2E_COMMENT_DOC" in "E2E_DOCS_COMMENTS"

    Scenario: User can add a comment to a document
      When the user types "Great document!" in the comment input
      And the user submits the comment
      Then the comment "Great document!" should appear in the activity panel

    Scenario: User can edit their own comment
      Given the user has posted a comment "Original comment"
      When the user opens the comment options for "Original comment"
      And the user selects "Edit"
      And the user changes the comment text to "Updated comment"
      And the user saves the comment
      Then the activity panel should show "Updated comment"

    Scenario: User can delete their own comment
      Given the user has posted a comment "Delete me"
      When the user opens the comment options for "Delete me"
      And the user selects "Delete"
      And the user confirms the deletion
      Then the comment "Delete me" should no longer appear in the activity panel

    Scenario: Activity log shows document creation event
      Then the activity panel should contain a "Document created" entry
