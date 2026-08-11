# Kreyco Partnership Inquiry Form - Monday.com Item View & Edit Portal

## 1. Project Summary & Purpose
The **Kreyco Partnership Inquiry Edit Portal** is a specialized full-stack web application hosted on **Google Apps Script** (V8 Runtime) designed to load existing inquiry submissions directly from Monday.com using an item ID (`itemId`) anchor.

### Key Features & Differences from Main Inquiry Form:
- **Monday.com Item View Embed & Anchor**: Supports loading submissions via URL parameter (`?itemId=12345678`) or Monday.com SDK context iframe listening (`monday.listen("context", ...)`).
- **Data Pre-filling**: Queries Monday.com GraphQL API for parent item column values and all attached subitems (teachers), pre-populating all form fields and rendering teacher cards.
- **Incremental Subitem Editing**: Tracks existing subitem IDs (`subitemId`), allowing user updates to existing subitems, creation of new subitems, or deletion of removed subitems.
- **Drive & Attachment Synchronization**: Allows uploading replacement files for School Calendar, Bell Schedule, or Teacher Schedules, decoding Base64 payloads and organizing them into Google Drive folders.
- **PDF Update**: Re-generates the branded submission PDF summary document and updates the Monday.com PDF link column (`wf_edit_link_wdsn`).
- **No Email Dispatch**: Email notification triggers are intentionally disabled for update/edit operations per requirements.

---

## 2. File Architecture

```
Partner Inquiry Form - Item View/
├── appsscript.json             # Google Apps Script manifest (Timezone, OAuth scopes, XFrameOptions ALLOWALL)
├── .clasp.json                 # Clasp configuration for local deployment
├── code.gs                     # Backend logic (fetchInquiryData, processUpdateApplication, GraphQL, Drive & PDF logic)
├── Index.html                  # Main Edit UI (Header item badge, School details, Teacher cards, Preview modal)
├── JavaScript.html             # Client-side UI logic (itemId detection, Monday SDK listener, pre-filling, validation, mock server)
├── Stylesheet.html             # Tailwind CSS CDN, Font Awesome icons, dark mode, glassmorphism styling
└── PROJECT_OVERVIEW.md         # Technical documentation & architectural guide
```

---

## 3. Monday.com Schema & Field Mapping Dictionary

| Monday.com Level | Column ID | Column Name | Type | Edit Action |
| :--- | :--- | :--- | :--- | :--- |
| **Parent Item** | `name` | School Name (Item Title) | `name` | `change_multiple_column_values` |
| **Parent Item** | `text6__1` | Address | `text` | `change_multiple_column_values` |
| **Parent Item** | `text__1` | Contact Full Name | `text` | `change_multiple_column_values` |
| **Parent Item** | `text5__1` | Email Address | `text` | `change_multiple_column_values` |
| **Parent Item** | `text_mkzc61ta` | Phone Number | `text` | `change_multiple_column_values` |
| **Parent Item** | `long_text7__1` | Additional Information | `long_text` | `change_multiple_column_values` |
| **Parent Item** | `text06__1` | Number of Teachers / TBD Text | `text` | `change_multiple_column_values` |
| **Parent Item** | `color_mksnhewa` | Global Certification | `status/color` | `change_multiple_column_values` |
| **Parent Item** | `long_text_mkzw9xs4` | School Calendar | `long_text` | `change_column_value` / Drive Link |
| **Parent Item** | `long_text_mkzwd7xp` | Bell Schedule | `long_text` | `change_column_value` / Drive Link |
| **Parent Item** | `wf_edit_link_wdsn` | Submission PDF Link | `link` | Updated PDF URL link |
| **Subitem (Teacher)**| `name` | Teacher Title (Item Title) | `name` | `change_multiple_column_values` |
| **Subitem (Teacher)**| `long_text_mkzb794g` | Description | `long_text` | `change_multiple_column_values` |
| **Subitem (Teacher)**| `text_mkzcyvvk` | Teaching Schedule | `text` | `change_multiple_column_values` |
| **Subitem (Teacher)**| `long_text_mkzc84xz` | Duties | `long_text` | `change_multiple_column_values` |
| **Subitem (Teacher)**| `long_text_mkzhdnv7` | Annual Salary | `long_text` | `change_multiple_column_values` |
| **Subitem (Teacher)**| `long_text_mkzhk5pv` | Prorated Salary | `long_text` | `change_multiple_column_values` |
| **Subitem (Teacher)**| `text_mkzc34ak` | Start Date | `text` | `change_multiple_column_values` |
| **Subitem (Teacher)**| `text_mkzce7mc` | Last Day / End Date | `text` | `change_multiple_column_values` |
| **Subitem (Teacher)**| `text_mkzdenv2` | Instructional Days | `text` | `change_multiple_column_values` |
| **Subitem (Teacher)**| `long_text_mm02phkt` | Campus Name | `long_text` | `change_multiple_column_values` |
| **Subitem (Teacher)**| `long_text_mm026ebf` | Campus Address | `long_text` | `change_multiple_column_values` |

---

## 4. Script Properties Configuration

Configure these in Google Apps Script under **Project Settings > Script Properties**:

| Property Key | Description | Example |
| :--- | :--- | :--- |
| `MONDAY_API_KEY` | Monday.com API Token | `eyJhbGciOiJIUzI1NiJ9...` |
| `MONDAY_BOARD_ID` | Monday.com Board ID | `6938836032` |
| `DRIVE_FOLDER_ID` | Google Drive Root Folder ID | `1a2b3c4d5e6f7g8h...` |

---

## 5. Local Synchronization (`clasp`)

Push or pull changes to Apps Script:

```bash
# Push local edits to Google Apps Script
clasp push

# Pull changes from Google Apps Script
clasp pull
```
