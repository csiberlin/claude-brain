Review brain entries for promotion to CLAUDE.md files. Only entries that **prescribe behavior** ("always do X", "never do Y") belong in CLAUDE.md. Reference documentation (how something works, what properties exist) stays in brain permanently.

## Step 1: Gather entries

1. Call `brain_consolidate` to retrieve all knowledge entries for the current project.
2. From the returned entries, identify **promotion candidates** — entries that meet ALL of these criteria:
   - **Category** is `architecture`, `pattern`, or `config` (not `debugging`, `api`, or `general`)
   - **Age:** `created_at` is more than 7 days ago
   - **Project-scoped:** has a project tag matching the current project (not general/null)
   - **Prescribes behavior:** contains a rule or convention, not just a description
3. If no candidates found, report "No entries are ready for promotion yet" and stop.

## Step 2: Present candidates

List each candidate with:
- Entry ID and title
- Category and age
- A one-line summary of the content

Ask the user which entries to promote: all, specific ones by ID, or none.

## Step 3: Promote approved entries

For each approved entry:

1. **Determine target file** by scanning the entry's content and tags for directory/file path references:
   - If the entry references files in a specific subdirectory (e.g., `src/services/`, `components/`) AND a CLAUDE.md already exists in that directory — target that file.
   - If the entry references a specific subdirectory but no CLAUDE.md exists there — create a new CLAUDE.md in that directory with a minimal `# <Directory Name>` header.
   - If no specific directory is referenced, or the knowledge is project-wide — target the project root CLAUDE.md.

2. **Read the target CLAUDE.md** and check whether equivalent knowledge is already captured (even if worded differently). Skip if already present.

3. **Edit the target CLAUDE.md:**
   - If a `## Knowledge` section exists, append the new content there.
   - If no `## Knowledge` section exists, add one at the end of the file.
   - Write the knowledge as a concise paragraph or bullet points — do NOT paste the raw brain entry verbatim. Rewrite it to read like curated documentation. Merge with adjacent entries on the same topic if applicable.

4. **Delete the brain entry** with `brain_delete`. The knowledge now lives in CLAUDE.md.

## Step 4: Report

Summarize what was done:
- How many entries were promoted
- Which CLAUDE.md files were modified or created
- How many entries were skipped (already captured or user declined)
- Remind the user to review and commit the CLAUDE.md changes
