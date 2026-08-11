# Kreyco Inquiry Edit Portal — Combined Reference

**Purpose of this document.** This is a single, self-contained reference for the
Kreyco Partnership Inquiry Edit Portal, written to be uploaded as a source into
NotebookLM (or a similar notebook tool) and asked questions of. It covers both
the non-technical workflow used by the Talent team and the technical
implementation used by the engineering team.

**How this document is organised.** Part 1 explains the tool in plain language.
Part 2 is the technical implementation. Part 3 is a glossary. Part 4 is a list
of questions and answers. Part 5 covers troubleshooting. Part 6 records what
changed recently and why.

**A note on style.** Each section repeats enough context to be understood on its
own, because notebook tools retrieve sections individually rather than reading
the document from top to bottom. There are no diagrams; every process is written
as numbered steps.

---

# PART 1 — THE TOOL IN PLAIN LANGUAGE

## 1.1 What the Kreyco Inquiry Edit Portal is

The Kreyco Inquiry Edit Portal is a web page that opens inside Monday.com. A
school that wants to work with Kreyco fills in a partnership inquiry form. Their
answers arrive in Monday.com as an inquiry item, with one row underneath it for
each teaching position the school is requesting.

The portal opens inside that inquiry item. It lets a member of the Talent team
review what the school submitted, correct anything that is wrong, and then pass
those teaching positions on to the school's contract.

Before this portal existed, moving positions onto a contract was manual work done
on a separate Monday.com board. It now happens in the same place and the same
sitting.

## 1.2 Who uses the Kreyco Inquiry Edit Portal

The Talent team uses it. They open a school's inquiry in Monday.com, check the
teaching positions the school asked for, fix any details that came in wrong, and
then push those positions onto either a New Contract or a Renewal.

## 1.3 The seven steps of using the portal

1. **Open.** Open the school's inquiry item in Monday.com and switch to the
   inquiry view. Everything the school submitted is already filled in.
2. **Review.** Check the school's contact details at the top, then each teaching
   position card below. Correct anything wrong.
3. **Check.** Click "Review & Save Changes". A summary appears listing every edit
   you made, with the old value and the new value side by side.
4. **Save.** Click "Confirm & Update the PIF". The inquiry is written back to
   Monday.com.
5. **Choose.** A second screen opens and shows which New Contract or Renewal
   items are connected to this school. Pick one.
6. **Match.** Each teaching position on the inquiry is paired with the matching
   row on the contract. Decide what happens to any that are unmatched.
7. **Finish.** A result screen reports what was created, what was updated, and
   anything that failed.

## 1.4 What the teaching position cards contain

Each teaching position card on the inquiry contains the position title, campus
name, campus address, salary information, start and end dates, a description,
duties, and a teaching schedule. It also contains nine option panels:

- Grade levels
- Languages
- Language acquisition
- Humanities
- STEM
- SPED
- Paraprofessional support
- CTE
- Modality preference

The option panels are laid out three across. They are all the same height and
each one scrolls independently. Because a panel scrolls, options that are ticked
can sit out of view. A count above each panel, reading for example "2 selected",
tells you how many are chosen without needing to scroll.

## 1.5 What happens when nothing has changed

If you open an inquiry, change nothing, and click "Review & Save Changes", the
portal detects that there is nothing to save. The confirm button then reads
"Continue to Contract Update" instead of "Confirm & Update the PIF", and clicking
it skips the save entirely and goes straight to the contract step.

This matters because saving an unchanged inquiry is not harmless. Every save
rewrites every column on the inquiry and regenerates the summary PDF, which
creates a duplicate file in Google Drive and updates the PDF link column. Skipping
a pointless save avoids that.

## 1.6 How the portal finds the contract to update

After the inquiry is saved, the portal automatically looks for the school's
contract. It shows every New Contract and Renewal item that is connected to this
inquiry, each labelled with the Monday.com group it sits in, such as PENDING or
Won/Closed.

Items sitting in a group called "Done / Not Needed" are never offered as
something to update. They are listed separately under a heading that says they
are already closed out. That work is finished and should not be reopened by a
later inquiry edit.

If the automatic search finds the wrong item, or finds nothing at all, there is a
"Not the right item? Choose manually" option. Choosing manually lets you pick the
board first, New Contract or Renewal, and then browse and search that board's
items yourself. Only items in Won or Pending groups are offered.

## 1.7 How positions are matched to contract rows

Once a contract or renewal item is selected, the portal pairs each teaching
position on the inquiry with the matching row on that contract.

Where a link already exists between a position and a contract row, the portal
finds it automatically and marks the row "Auto-matched".

Where no link exists, the row is marked "Needs mapping". For those rows you
either point the position at an existing row on the contract using the dropdown,
or leave it set to "Create a new subitem", in which case a new row is added to
the contract.

Two positions cannot be mapped to the same row on the contract. If you try, the
portal shows a warning and disables the confirm button until it is corrected.

## 1.8 What the portal will never do

The portal never deletes anything on a contract or renewal. It only creates new
rows or updates existing ones. If a teaching position is removed from the
inquiry, the corresponding row on the contract is left exactly as it is. Removing
it is a manual decision for a person to make.

Note the difference: deleting a position card from the inquiry itself and then
saving does delete that row from the inquiry in Monday.com. That part is
permanent. It is only the contract side that is never touched destructively.

## 1.9 What is safe to do

- **Skipping the contract step is safe.** Closing that screen changes nothing on
  the contract. The inquiry edits are already saved and you can come back later.
- **Running the contract update twice is safe.** Positions already linked to a
  contract row are recognised and updated rather than duplicated.
- **Leaving a row as "Create a new subitem" is safe** provided the position
  genuinely does not exist on the contract yet.

## 1.10 What needs care

- **After choosing an item manually.** If you manually pick a contract item that
  was never linked to this inquiry, every position will show "Needs mapping" and
  default to creating new rows. Read the dropdowns before confirming, otherwise
  you may add rows that already exist on that contract.
- **Deleting a position from the inquiry.** This is permanent on the inquiry
  side.
- **When nothing is found.** If no contract is listed, the school's inquiry may
  not be linked to a Lead yet. Expanding "How were these results found?" shows
  what was searched, and that text is what the technical team needs to diagnose
  it.

---

# PART 2 — TECHNICAL IMPLEMENTATION

## 2.1 Platform and hosting of the Kreyco Inquiry Edit Portal

The portal is a Google Apps Script web app running on the V8 runtime with the
timezone set to America/New_York. It is served into Monday.com as an Item View
inside an iframe, which is why the manifest sets XFrameOptions to ALLOWALL. The
web app executes as the deploying user and its access level is
ANYONE_ANONYMOUS.

The Apps Script project ID is
`131ndeYQTpXd_Yg0qn5R2fbbgtzt-UMHpDee4lYhM6sI7iJAU9sXKjvB2`.

## 2.2 Files in the Kreyco Inquiry Edit Portal project

- `appsscript.json` is the Apps Script manifest holding scopes, timezone, and the
  ALLOWALL frame setting.
- `.clasp.json` holds the script ID and root directory for the clasp CLI.
- `code.gs` holds all backend logic.
- `Index.html` holds the page shell and both modal dialogs.
- `JavaScript.html` holds all client-side logic and a local mock of
  `google.script.run` for offline development.
- `Stylesheet.html` holds the Tailwind CDN configuration, dark mode styles, and
  the option panel styling.
- `README.md` is the technical documentation.
- `PROJECT_OVERVIEW.md` is the original edit-portal documentation.
- `NOTEBOOK_REFERENCE.md` is this document.

`Index.html` includes the stylesheet and JavaScript through Apps Script template
tags, and the `doGet` function injects any `?itemId` URL parameter into
`window.SERVER_ITEM_ID`.

## 2.3 Script Properties required by the Kreyco Inquiry Edit Portal

Three properties must be set in Apps Script under Project Settings, Script
Properties:

- `MONDAY_API_KEY` is the Monday.com API token. It needs write access to all four
  boards listed in section 2.4.
- `MONDAY_BOARD_ID` is the inquiry board, `6938836032`.
- `DRIVE_FOLDER_ID` is the root Google Drive folder used for uploaded files and
  generated PDFs.

## 2.4 Monday.com boards used by the Kreyco Inquiry Edit Portal

- The Quote/Estimate Form board, also called the PIF board or the inquiry board,
  has ID `6938836032`.
- The New Contracts board has ID `9746564033` and its subitem board has ID
  `9746564389`.
- The Renewal board has ID `18417033017` and its subitem board has ID
  `18417033021`.

These board IDs also appear in the Send to OPS project, specifically in
`Zap2_Step4_Resolver.js`, which resolves the same relationships for the OPS
workflow. If boards are moved or rebuilt, both projects must be updated.

## 2.5 Deployments of the Kreyco Inquiry Edit Portal

There are two deployments.

The `@HEAD` deployment, ID
`AKfycbznz3yNjYErn06xEaTD4fIErPdU4c9uMNvu84cKT3Vt`, always serves the most
recently pushed code.

The versioned deployment, ID
`AKfycbxREIK1Y6XX0PTQptCKggl0naMYK3RkuxRaQiaSXvww85h8WOXYsDjAhdtdSWSnQ1OrAw`, is
frozen at version 4 and described as "Removed calculated instructional days
banner and fixed light/dark mode contrast".

Running `clasp push` only updates script content. The `@HEAD` deployment picks up
that content immediately. The versioned deployment does not, and will keep
serving old code until a new version is created and promoted to it. Before
assuming a change is live, confirm which of the two URLs the Monday.com app is
pointed at.

## 2.6 The two contract boards behave differently

This is the most important technical fact about the contract sync feature.

On the **New Contracts** board, the subitem columns for subject, grade, language
and modality are real dropdown and status columns. Their values must therefore be
copied across explicitly by the portal.

On the **Renewal** board, the equivalent subitem columns are mirror columns,
which in the Monday.com API appear with IDs beginning `lookup_`. Mirror columns
are read-only and they read their value *through* the board relation that links
the renewal subitem back to the inquiry subitem. Setting that relation is
therefore sufficient; there is nothing else to copy.

The practical consequences are:

- The function `buildContractFieldValues()` returns an empty object for Renewal
  by design. This is not a bug.
- Creating a new Renewal subitem requires only a name and the board relation.
- Creating a new New Contract subitem requires the name, the relation, the text
  link column, and all the copied field values.

## 2.7 Column mapping from inquiry position to New Contract subitem

The portal copies these eight fields from an inquiry teaching position to the
corresponding New Contracts subitem, on both creation and refresh:

- Modality, from `color_mkzcn0h2` to `color_mkzmfhff`, a status column.
- Grade levels, from `dropdown_mkzc6dgm` to `dropdown_mkztz3vk`.
- Language acquisition, from `dropdown_mkzcq8h6` to `dropdown_mkztba57`.
- Languages, from `dropdown_mkzcbcq4` to `dropdown_mkzt9c5y`.
- Humanities, from `dropdown_mm02xrpn` to `dropdown_mm039knb`.
- STEM, from `dropdown_mm02azn5` to `dropdown_mm034g`.
- SPED, from `dropdown_mm02m53x` to `dropdown_mm032ybs`.
- Paraprofessional, from `dropdown_mm02v870` to `dropdown_mm03fsx6`.

The description is copied from `long_text_mkzb794g` to `long_text_mkzzxb21` **only
when a subitem is created**. It is deliberately not refreshed afterwards, because
the Talent team edits descriptions on the contract side and refreshing would
overwrite their work.

Two columns are deliberately not written. CTE is not synced because the New
Contracts board has no CTE column; a column named `dropdown_mkztn0a0` exists on
that board but has never been mapped, and the pre-existing Zap writes an empty
value to it. The column `text_mm5a6trh` was named during design as a refresh
target but appears in no board export, Zap, or resolver, so nothing is written to
it.

## 2.8 Link columns that connect an inquiry position to a contract row

On the New Contracts board there are two columns holding the same fact. The
column `text_mm03m3sd` is a plain text column on the subitem holding the inquiry
subitem ID. The column `board_relation_mm3y1h5m` is a Connect Boards relation
column on the subitem pointing at the inquiry subitem.

The portal reads the relation column first and falls back to the text column when
the relation is empty. It writes both columns on every sync. This means the
relation column is progressively backfilled on older rows, ahead of a planned
migration away from the text column.

On the Renewal board there is one column, `board_relation_mm456sv`, a Connect
Boards relation column on the subitem pointing at the inquiry subitem.

## 2.9 How the portal discovers which contract items are connected

Discovery begins by reading the inquiry parent item's name and its Lead ID, which
is stored in the column `text_mkzk3t3r`.

For **New Contracts**, the portal searches the New Contracts board for items
whose column `text_mkth2f46`, described on the board as "(Catcher) Lead itemID",
exactly matches the inquiry's Lead ID. If the inquiry has no Lead ID, this search
is skipped entirely.

For **Renewal**, three routes are tried in order, because renewal items are not
reliably linked directly back to the inquiry:

1. Search the Renewal board for items whose column `board_relation_mm452jwf`
   links to this inquiry parent item.
2. Search the Renewal board for items whose column `board_relation_mkpt3ya2`
   links to the Lead. This is the same hop that New Contracts uses.
3. If both filtered searches return nothing, page through the Renewal board
   testing both columns, capped at 20 pages of 100 items.

Route 2 is essential. In the first production test, the renewal item was found
only through the Lead hop and not through the direct relation.

Results from all routes are de-duplicated by item ID. Each route records a line
of diagnostic text which is shown in the interface under the heading "How were
these results found?". This distinguishes an API rejection from a genuine
no-match without needing to open the Apps Script logs.

## 2.10 Group filtering rules

Two regular expressions control which Monday.com groups are eligible.

Items in excluded groups are never offered as a sync target. The pattern is
`/\bdone\b|\bnot\s*needed\b/i`. The word boundaries are deliberate and necessary:
an unbounded pattern matching "done" would also match a group named "Abandoned",
because the letters d-o-n-e appear inside that word.

When the user chooses an item manually, only groups matching `/won|pending/i` are
offered, and excluded groups are still filtered out.

## 2.11 Client-callable backend functions

- `getBoardDropdownOptions()` returns the column label sets used by the option
  panels.
- `fetchInquiryData(itemId)` returns the parent details and all teaching
  positions for one inquiry item.
- `processUpdateApplication(data)` writes the inquiry: parent columns, uploaded
  files, subitems, and the regenerated PDF.
- `findContractTargets(pifItemId)` performs step 1, returning candidate contract
  and renewal items with diagnostics.
- `listManualTargets(targetKey)` performs step 1b, listing one board's Won and
  Pending items for manual selection.
- `getContractSyncPlan(pifItemId, targetKey, targetItemId)` performs step 2,
  auto-matching positions to contract rows.
- `applyContractSync(payload)` performs step 3, creating and updating contract
  subitems.

## 2.12 The Monday.com API version pin

The helper `callMondayAPI(query, apiVersion)` takes an optional API version. Only
the contract sync calls pass one, and they pin version `2024-10`. They need it
because they read Connect Boards columns using the `BoardRelationValue` GraphQL
fragment. Every other call in the project omits the parameter and keeps
Monday.com's default behaviour, so existing functionality is unaffected.

A critical API detail: Connect Boards columns return null for both `text` and
`value` even when the Monday.com interface visibly shows a linked item. The
linked item IDs must be read from the `linked_item_ids` field instead.

## 2.13 Write behaviour of the contract sync

A matched row calls `change_multiple_column_values` against the existing contract
subitem. An unmatched row calls `create_subitem` under the contract parent item.
Both calls set `create_labels_if_missing` to true, so a label present on the
inquiry but absent from the contract board is created rather than causing the
write to fail.

Contract subitems with no counterpart on the inquiry are left completely
untouched. Nothing is ever deleted on a contract board.

Failures are captured per row and reported individually. One failing row does not
abort the remaining rows.

The plan is rejected server-side if two inquiry positions are mapped to the same
contract subitem, and the interface blocks the same condition before submission.

## 2.14 Naming convention for created contract subitems

Contract subitems created by the portal use the same naming convention as the
pre-existing "Notify Talent" Zap, so that rows created by either route look
identical on the board. The format is:

```
[Grade] - [Language Acquisition] - [Languages] - [Parent Name in Proper Case]
```

Each segment is capped at 50 characters and the whole name at 200 characters with
an ellipsis. Commas are replaced with the bullet character. This last rule is
mandatory rather than cosmetic: Monday.com treats a comma in an item name as a
separator and would otherwise create several subitems from a single call.

## 2.15 Order of operations and why it matters

The inquiry is saved before the contract step opens. This ordering is deliberate.
Newly added teaching position cards have no Monday.com subitem ID until the
inquiry write happens, and the contract sync matches on subitem IDs. Saving first
is what makes newly added positions mappable at all.

## 2.16 Front-end implementation notes

The inquiry item ID is resolved in this order: the value injected by `doGet` from
a `?itemId` URL parameter; the Monday.com SDK context via `monday.get("context")`
and `monday.listen("context", ...)`; the `?itemId` parameter read directly from
the browser location; and finally a manual entry banner.

The nine option panels are driven by a single `OPTION_GROUPS` array mapping the
payload field name to the display label and the Monday.com column ID. Adding a
new option group requires one entry in that array and one call to
`renderOptionPanel` in the card markup.

Option ordering and filtering deliberately mirrors the original Partner Inquiry
Form. Grade level band labels are removed and the remaining grades are sorted K,
PreK, then 1st through 12th. The label "Other" is removed from Languages. The
label "Both options are fine." is removed from Modality because it is a
school-level answer rather than a per-teacher one. In every other panel, the
labels "NA" and "Other" are pinned to the bottom of the list.

Values already saved on an inquiry position remain ticked even if the label has
since been removed from the Monday.com board. This prevents an edit from silently
discarding data a school previously submitted.

There is a load-order race that is explicitly handled. The Monday.com SDK call
`monday.get("context")` can resolve before `getBoardDropdownOptions()` returns. If
an inquiry were rendered before the column labels arrived, every option panel
would render empty. The render is therefore gated on a `dropdownOptionsLoaded`
flag, with the fetched inquiry parked in `pendingInquiryResponse` until the
options arrive.

## 2.17 Local development without Apps Script

`JavaScript.html` installs a mock implementation of `google.script.run` whenever
the global `google` object is undefined. The mock covers all seven server
functions with representative data, including deliberately unsorted grade labels
and band labels so that the sorting and filtering rules can be exercised offline.

To run the portal outside Apps Script, inline the two includes into `Index.html`
and replace the server-injected item ID with a literal value, then serve the
result over HTTP rather than opening it as a file, so the CDN assets load.

Both script files should be syntax-checked before pushing, because Apps Script
will accept a broken file without complaint. Copy `code.gs` to a `.js` extension
and run `node --check` on it, and strip the surrounding script tags from
`JavaScript.html` before doing the same.

## 2.18 Known constraints and interactions

**The "Notify Talent" Zap still runs.** It fires when an inquiry is linked to a
Lead and creates New Contract subitems independently of the portal. The portal is
idempotent, meaning it skips any contract subitem already linked to an inquiry
subitem, so the two do not duplicate each other's work. However, if the Zap ever
creates a subitem without writing the text link column, the portal will read that
subitem as unlinked and create a second one.

**Manual selection bypasses discovery but not matching.** Choosing an item by
hand that was never linked to this inquiry means every position shows as needing
mapping and defaults to creating new subitems.

**Manual item lists load 200 items per group**, with a client-side search filter.
A group larger than that is flagged in the interface.

**The Renewal board scan is capped** at 20 pages of 100 items, and only runs when
both filtered lookups return nothing.

**Teaching schedule text accumulates unless stripped.** When a schedule file is
uploaded, the backend appends a line reading "File:" followed by the URL to the
column `text_mkzcyvvk`. The function `stripFileReferences()` removes any previous
such line first, because the old value round-trips through the edit form and
would otherwise gain one line per upload.

---

# PART 3 — GLOSSARY

**Inquiry.** The partnership inquiry a school submits. Also called the PIF or the
Quote/Estimate Form. It lives on Monday.com board `6938836032`.

**PIF.** An older internal abbreviation for the partnership inquiry form. The
term still appears on the save button, which reads "Confirm & Update the PIF".

**Position.** One teaching role a school is requesting. Each position becomes a
subitem underneath the inquiry item in Monday.com.

**Subitem.** Monday.com's term for a row sitting underneath a main item.

**New Contract.** A first-time agreement with a school, on board `9746564033`.
Subject and grade details are copied onto its subitems.

**Renewal.** A returning school's agreement, on board `18417033017`. Its subject
and grade fields are mirror columns that read from the linked inquiry subitem, so
only the link is written.

**Replacement.** A third board, ID `9746677771`, handled by the Send to OPS
workflow. It is **not** part of the inquiry portal's contract sync and has no
inquiry-subitem link column.

**Lead.** The Monday.com item representing the sales lead for a school. The
inquiry stores its ID in column `text_mkzk3t3r`, and both contract boards link to
it via `board_relation_mkpt3ya2`.

**Auto-matched.** The portal already knows which contract row belongs to a given
inquiry position, because a link column says so.

**Needs mapping.** No link exists between an inquiry position and any contract
row, so the user must choose a row or accept the creation of a new one.

**Mirror column.** A Monday.com column that displays a value from a linked item
on another board rather than storing its own. Mirror column IDs begin `lookup_`.
Mirror columns are read-only.

**Connect Boards column.** A Monday.com relation column linking an item to items
on another board. Column IDs begin `board_relation_`. Their linked items must be
read from `linked_item_ids`, not from `text` or `value`.

**Group.** A section within a Monday.com board. Relevant groups here are PENDING,
Won/Closed, and Done / Not Needed.

**clasp.** The Google command-line tool used to push and pull Apps Script source
code.

---

# PART 4 — QUESTIONS AND ANSWERS

**What does the Kreyco Inquiry Edit Portal do?**
It lets the Talent team review and correct a school's partnership inquiry inside
Monday.com, and then push the requested teaching positions onto that school's New
Contract or Renewal item.

**Where do I find the portal?**
Open the school's inquiry item on the Quote/Estimate Form board in Monday.com and
switch to the inquiry view. The portal is embedded there.

**Does the portal ever delete anything on a contract?**
No. The portal only creates new rows or updates existing ones on a contract or
renewal. Rows with no matching position on the inquiry are left untouched.

**Does the portal ever delete anything on the inquiry?**
Yes. Removing a teaching position card and then saving deletes that subitem from
the inquiry in Monday.com. That deletion is permanent.

**What happens if I run the contract update twice?**
Nothing harmful. Positions already linked to a contract row are recognised and
updated rather than duplicated.

**Why does the save button sometimes say "Continue to Contract Update"?**
Because the portal detected that nothing on the inquiry has changed. In that case
it skips writing to Monday.com entirely, since a pointless save would rewrite
every column and generate a duplicate PDF.

**Why can I not select a contract item that is in the Done / Not Needed group?**
Because that work is finished and must not be reopened by a later inquiry edit.
Such items are listed separately under a note saying they are already closed out.

**No contract or renewal was found. What now?**
The school's inquiry may not be linked to a Lead yet. Expand "How were these
results found?" to see exactly what was searched and what each search returned.
You can also use "Not the right item? Choose manually" to pick an item yourself.

**What does "Needs mapping" mean?**
It means the portal found no existing link between that inquiry position and any
row on the contract. Either choose an existing row from the dropdown, or leave it
set to create a new subitem.

**Can two positions point at the same contract row?**
No. The interface blocks it and the server rejects it. Each contract row can be
matched to only one inquiry position.

**Why are Renewal items handled differently from New Contract items?**
Because on the Renewal board the subject, grade and modality columns are mirror
columns that read through the board relation. They are read-only, so setting the
relation is enough. On the New Contracts board those columns are real dropdowns
whose values must be copied explicitly.

**Why is CTE not copied to the New Contract?**
Because the New Contracts board has no CTE column. A column named
`dropdown_mkztn0a0` exists there but has never been mapped to CTE, and the
pre-existing Zap writes an empty value to it.

**Which Monday.com column stores the link between an inquiry position and a
contract row?**
On New Contracts there are two: the text column `text_mm03m3sd` and the relation
column `board_relation_mm3y1h5m`. The portal reads the relation first, falls back
to the text column, and writes both. On Renewal there is one relation column,
`board_relation_mm456sv`.

**How does the portal find the right New Contract item?**
It reads the Lead ID from the inquiry column `text_mkzk3t3r` and searches the New
Contracts board for an item whose column `text_mkth2f46` exactly matches it.

**How does the portal find the right Renewal item?**
It tries three routes in order: a direct relation from the renewal to the inquiry
via `board_relation_mm452jwf`; a link from the renewal to the Lead via
`board_relation_mkpt3ya2`; and finally a paged scan of the board. The Lead route
is essential, because in production the renewal was found only that way.

**Why does the inquiry save before the contract step?**
Because newly added teaching positions have no Monday.com subitem ID until the
inquiry is written, and the contract sync matches on subitem IDs. Saving first is
what makes new positions mappable.

**I pushed with clasp but nothing changed in Monday.com. Why?**
Most likely the Monday.com app points at the versioned deployment rather than
`@HEAD`. Pushing updates script content, which `@HEAD` serves immediately, but a
versioned deployment keeps serving its frozen version until a new version is
created and promoted.

**clasp printed "Skipping push." and did nothing. Why?**
clasp believes the manifest changed and is waiting for a confirmation it cannot
receive when run non-interactively. This is often only a trailing-newline
difference on `appsscript.json`. Diff the manifest, confirm there is no
meaningful change, then push with the force flag.

---

# PART 5 — TROUBLESHOOTING

**Option panels stay on loading spinners.** The call to
`getBoardDropdownOptions()` failed, or the subitem board could not be resolved
from the parent board's subtasks column. Check the Apps Script execution log.

**The contract screen says no linked item was found.** Expand "How were these
results found?". It names each lookup that ran and what it returned, which
distinguishes an API rejection from a genuine absence of linked items.

**A diagnostic line says a lookup "was rejected by the API".** Monday.com refused
server-side filtering on that column. The paged scan fallback is doing the work
instead. Confirm the item is within the scan cap of 20 pages of 100 items.

**Every position shows "Needs mapping".** The contract item's link columns are
empty. This is expected on a first sync, or after manually choosing an item that
was never linked to this inquiry.

**A row fails with an error mentioning labels.** The `create_labels_if_missing`
setting did not cover the case, most likely a status column rejecting a value.

**Changes are not visible in Monday.com.** Check whether the app points at the
versioned deployment rather than `@HEAD`.

---

# PART 6 — RECENT CHANGES AND WHY

**The option panels were rebuilt.** They previously used a cramped mixed layout,
with grade levels spread seven across and other groups in shorter boxes of
differing heights. They now use a uniform three-column grid of equal-height
scrollable panels, matching the original Partner Inquiry Form, along with that
form's ordering and filtering rules.

**Language Acquisition was added to the interface.** This fixed a data-loss bug.
The panel did not previously exist, so the form never submitted a value for it,
and the backend treats a missing multi-select as an instruction to clear the
column. Every save therefore wiped the Language Acquisition column on every
teaching position. This is fixed going forward, but positions edited through the
portal before the fix have already lost that value. It can only be recovered from
the Monday.com item activity log.

**A malformed CSS selector was corrected.** A typo in a query selector caused an
exception whenever the change preview was generated for an existing teaching
position, which prevented the preview dialog from opening at all. The deployed
copy of the file did not contain this typo; only the local working copy did.

**Clearing a value now works.** Previously, blanking the certification field on
the inquiry or the modality field on a position left the old value in place,
because the column was only written when it had a value. Empty values are now
written explicitly so the column clears.

**Deleted-subitem tracking is cleared after a save.** Previously the list
persisted, so a second save in the same session would reissue delete calls for
already-deleted rows and keep listing them in the preview.

**Uploaded files no longer duplicate.** The school-level file pickers are cleared
after a successful save, so a second save does not re-upload the same file and
create a duplicate in Google Drive.

**Dropdown option lookup was made more robust.** The subitem board is now
resolved from the parent board's subtasks column, which works whether or not any
inquiry currently has positions. The older approach, which reached the subitem
board through an existing subitem, remains as a fallback.

**The contract sync feature was added.** This is the New Contract and Renewal
update described throughout Part 1 and Part 2.

**No-change saves are now skipped**, and the confirm button was renamed from
"Confirm & Update Monday.com" to "Confirm & Update the PIF".

**The manual selection option was made prominent.** It was previously a small
text link that users did not notice. It is now a full-width bordered card.
