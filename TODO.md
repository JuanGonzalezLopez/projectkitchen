# TODO: Features & Fixes for projectkitchen

- Generate/accept WebP behavior
    - Task: Add upload options:
        - Option A: Automatically convert uploads to WebP.
        - Option B: Accept PNG-only uploads (no conversion).
        - Option C: Provide an explicit “attempt WebP conversion” flow and mark as unsupported in current Cloudflare impl.
    - Subtasks:
        - Research/decide strategy: client-side conversion (canvas/toBlob WebP), server-side conversion, or external conversion service.
        - Implement client-side conversion as preferred fallback (convert PNG -> WebP before upload).
        - Add UI toggle and validation messages when Cloudflare conversion is impossible.
    - Acceptance criteria:
        - User can toggle behavior and upload either PNG or converted WebP.
        - If Cloudflare conversion is impossible, UI clearly explains limitation and the chosen fallbacks work.

- Fix resend-email domain problem
    - Task: Investigate and resolve wrong domain used when resending confirmation/reset emails.
    - Subtasks:
        - Reproduce error flow and collect headers/from/to values.
        - Confirm email service config (FROM address, reply-to, domain settings).
        - Fix environment/config code path that constructs resend links and From header.
        - Add unit/integration test for resend email link domain.
    - Acceptance criteria:
        - Resent emails contain correct domain in links and From headers.
        - Tests cover expected domain behavior.

- Unify image and manifest UI for easier email addition/removal
    - Task: Merge the image upload UI and manifest editor into a single unified panel.
    - Subtasks:
        - Create a combined edit pane that shows images + manifest fields (including emails).
        - Add inline controls to add/remove email addresses and to attach images to entries.
        - Ensure accessibility and small-screen layouts.
        - Add validation and clear save/cancel affordances.
    - Acceptance criteria:
        - Users can add/remove emails and images from the same view without navigating away.
        - Changes are staged until Save is clicked.

- Auto-insert the random filename value into manifest
    - Task: When an uploaded image is stored with a generated random suffix (e.g., kitchen-4-1767420836573.png), capture that generated filename and use it to populate the manifest entry.
    - Subtasks:
        - Capture final stored filename returned by upload API.
        - Map the uploaded filename to the manifest entry in the client-side staging area.
        - On Save, write the mapped filename into manifest before persisting.
    - Acceptance criteria:
        - Manifest references exact stored filenames (including random suffix) after Save.

- Wait until Save is hit to upload everything
    - Task: Stop immediate uploads that trigger redeploys per image; stage files locally and upload on save.
    - Subtasks:
        - Implement client-side staging (in-memory Blob, IndexedDB, or temp storage) for images + manifest changes.
        - On Save, perform a single batched upload/manifest update to avoid redeploy storms.
        - Add progress/confirmation UI and rollback on failure.
        - Ensure large-file memory concerns handled (fallback to temporary server-side staging if needed).
    - Acceptance criteria:
        - No uploads happen before Save.
        - Single batch upload on Save completes or returns a clear error and rollback.

- QA, Testing, and Rollout
    - Add unit/integration tests for:
        - Filename mapping into manifest
        - Email domain values in resend flows
        - Upload behavior for all three WebP options
    - Staging rollout behind feature flag
    - Documentation: update README/TODO.md with chosen WebP strategy and UI changes

Implementation notes / constraints
    - If Cloudflare cannot perform server-side WebP conversion, prefer client-side conversion or external conversion service.
    - For staging-before-save: IndexedDB is robust for large Blobs; fallback to short-lived server staging if necessary.
    - Ensure upload API returns canonical stored filename (with suffix) to keep mapping reliable.
    - Avoid triggering automated deployments per asset upload — batch operations or a dedicated manifest update endpoint can prevent redeploys.

Priorities (suggested)
    - P0: Wait-until-save batching; filename mapping into manifest; fix resend domain.
    - P1: Unified UI for images + manifest + email editing.
    - P2: WebP workflow (decide strategy and implement client-side conversion fallback).