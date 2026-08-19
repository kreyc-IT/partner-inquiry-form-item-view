/**
 * ========================================================================
 * KREYCO PARTNERSHIP INQUIRY FORM - MONDAY.COM ITEM VIEW & EDIT PORTAL
 * ========================================================================
 * * PURPOSE:
 * This script allows users to load an existing inquiry submission via Monday.com Item ID,
 * edit school details, edit existing teacher subitems, add new teachers, remove deleted teachers,
 * replace file attachments, and update Monday.com, Drive, and the PDF summary.
 * 
 * * NOTE: Email notifications are disabled for edit/update actions per user specification.
 * * @version 3.0 (Item View & Incremental Subitem Editing)
 * @date 2026-08-07
 */

// ========================================================================
// SECTION 1: WEB APP INITIALIZATION & UTILITIES
// ========================================================================

/**
 * Serves the HTML interface to users
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  template.itemId = (e && e.parameter && e.parameter.itemId) ? e.parameter.itemId : '';
  
  return template
    .evaluate()
    .setTitle('Kreyco Inquiry Edit Portal')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Helper function to include external HTML files
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Retrieves configuration from Script Properties
 */
function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    boardId: props.getProperty('MONDAY_BOARD_ID'),
    driveFolderId: props.getProperty('DRIVE_FOLDER_ID'),
    apiKey: props.getProperty('MONDAY_API_KEY'),
    logSheetId: props.getProperty('LOG_SHEET_ID')
  };
}

// ========================================================================
// SECTION 1B: ACTIVITY LOGGING
// ========================================================================
//
// Every logged action is written as one row to a Google Sheet named by the
// LOG_SHEET_ID script property. Logging is entirely optional: with no
// property set, every log call is a no-op and the portal behaves exactly as
// before.
//
// Logging must never break the portal. Every function here swallows its own
// errors - a failed log line is written to the Apps Script log and otherwise
// ignored.
// ========================================================================

const LOG_SHEET_NAME = 'Activity Log';

const LOG_HEADERS = [
  'Timestamp',
  'Event',
  'Status',
  'PIF Item ID',
  'PIF Name',
  'Monday User',
  'Summary',
  'Details',
  'Duration (ms)'
];

// Sheet cells hold far more than this, but a runaway payload helps nobody.
const LOG_DETAIL_LIMIT = 2000;

/**
 * Returns the log sheet, creating the tab and header row when needed.
 * Returns null when logging is not configured. Trailing underscore keeps it
 * out of reach of google.script.run.
 */
function getLogSheet_() {
  const config = getConfig();
  if (!config.logSheetId) return null;

  const spreadsheet = SpreadsheetApp.openById(config.logSheetId);
  let sheet = spreadsheet.getSheetByName(LOG_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(LOG_SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(LOG_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight('bold');
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(7, 380);
    sheet.setColumnWidth(8, 420);
  }

  return sheet;
}

/**
 * Appends one row to the activity log.
 *
 * @param {string} event   Short event name, e.g. 'SAVE' or 'CONTRACT_SYNC'.
 * @param {Object} entry   { status, itemId, itemName, mondayUser, summary,
 *                           details, startedAt }
 */
function logEvent_(event, entry) {
  try {
    const sheet = getLogSheet_();
    if (!sheet) return;

    const data = entry || {};

    let details = '';
    if (data.details !== undefined && data.details !== null) {
      details = (typeof data.details === 'string')
        ? data.details
        : JSON.stringify(data.details);
      if (details.length > LOG_DETAIL_LIMIT) {
        details = details.slice(0, LOG_DETAIL_LIMIT) + '...[truncated]';
      }
    }

    const duration = data.startedAt ? (new Date().getTime() - data.startedAt) : '';

    sheet.appendRow([
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      event || '',
      data.status || '',
      data.itemId ? String(data.itemId) : '',
      data.itemName || '',
      data.mondayUser ? String(data.mondayUser) : '',
      data.summary || '',
      details,
      duration
    ]);

  } catch (error) {
    // A logging failure must never surface to the user or abort the action.
    Logger.log('Activity logging failed (ignored): ' + error.toString());
  }
}

/**
 * Reads the Monday user ID the client passed alongside a request, if any.
 * The web app runs as the deploying user with anonymous access, so
 * Session.getActiveUser() cannot identify who is actually using the portal -
 * the Monday.com SDK context is the only real attribution available.
 */
function clientUser_(clientMeta) {
  if (!clientMeta) return '';
  return clientMeta.mondayUserId || clientMeta.mondayUserName || '';
}

/**
 * One-time setup helper. Run this manually from the Apps Script editor.
 *
 * With LOG_SHEET_ID already set it verifies the sheet is reachable. With no
 * property set it creates a new spreadsheet, stores its ID, and logs the URL.
 */
function setupLogSheet() {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperty('LOG_SHEET_ID');

  if (existing) {
    const sheet = getLogSheet_();
    const url = SpreadsheetApp.openById(existing).getUrl();
    Logger.log(`LOG_SHEET_ID already set. Logging to: ${url}`);
    Logger.log(`Sheet tab "${LOG_SHEET_NAME}" has ${sheet.getLastRow()} row(s) including the header.`);
    return url;
  }

  const spreadsheet = SpreadsheetApp.create('Kreyco Inquiry Portal - Activity Log');
  props.setProperty('LOG_SHEET_ID', spreadsheet.getId());

  getLogSheet_();

  const url = spreadsheet.getUrl();
  Logger.log(`Created activity log and stored LOG_SHEET_ID.`);
  Logger.log(`Open it here: ${url}`);
  return url;
}

/**
 * Makes API calls to Monday.com using GraphQL
 */
function callMondayAPI(query, apiVersion) {
  const config = getConfig();

  if (!config.apiKey) {
    throw new Error("MONDAY_API_KEY not configured in Script Properties");
  }

  const headers = { 'Authorization': config.apiKey };

  // Only the contract-sync queries pin a version. They read Connect Boards
  // columns via the BoardRelationValue fragment, which needs a version that
  // supports it; everything else keeps Monday's default behaviour.
  if (apiVersion) {
    headers['API-Version'] = apiVersion;
  }

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify({ query: query }),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch('https://api.monday.com/v2', options);
  const json = JSON.parse(response.getContentText());
  
  if (json.errors) {
    Logger.log("Monday API Error: " + JSON.stringify(json.errors));
  }
  
  return json;
}

/**
 * Removes previously appended "File: <url>" lines from a free-text field,
 * returning just the human-written notes (trimmed, may be empty).
 */
function stripFileReferences(text) {
  if (!text) return '';
  return String(text)
    .split(/\r?\n/)
    .filter(function (line) { return !/^\s*File:\s*https?:\/\//i.test(line); })
    .join('\n')
    .trim();
}

/**
 * Escapes special characters for GraphQL queries
 */
function escapeGql(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * Rejects an ID that is not a plain number.
 *
 * IDs are interpolated straight into the GraphQL strings below, so a
 * non-numeric value is an injection vector rather than just a bad lookup.
 */
function assertNumericId_(id, label) {
  const str = String(id === null || id === undefined ? '' : id).trim();
  if (!/^\d+$/.test(str)) {
    throw new Error(`Invalid ${label || 'item'} ID.`);
  }
  return str;
}

/**
 * Validates the item the client asked for and returns everything the save
 * path needs to stay inside it.
 *
 * The web app is reachable by every domain user, so an item ID arriving from
 * the client is untrusted: without this check any of them could read or
 * overwrite an arbitrary Monday item - on any board - by passing its ID.
 * Subitem IDs get the same treatment, since they are interpolated into
 * update and delete mutations.
 *
 * One query covers all of it: board membership, the set of subitems that may
 * legitimately be touched, and the subitem board ID needed by updateSubitem.
 *
 * @return {{itemId: string, subitemIds: Object, subitemBoardId: (string|null)}}
 */
function loadItemScope_(itemId) {
  const config = getConfig();
  const id = assertNumericId_(itemId, 'item');

  const query = `
    query {
      items (ids: [${id}]) {
        id
        board { id }
        subitems { id board { id } }
      }
    }
  `;

  const response = callMondayAPI(query);
  const item = response.data && response.data.items && response.data.items[0];
  if (!item) {
    throw new Error(`Item ${id} not found in Monday.com.`);
  }
  if (!item.board || String(item.board.id) !== String(config.boardId)) {
    throw new Error(`Item ${id} is not on the inquiry board.`);
  }

  const subitemIds = {};
  let subitemBoardId = null;
  (item.subitems || []).forEach(function (sub) {
    subitemIds[String(sub.id)] = true;
    if (!subitemBoardId && sub.board && sub.board.id) {
      subitemBoardId = String(sub.board.id);
    }
  });

  return { itemId: id, subitemIds: subitemIds, subitemBoardId: subitemBoardId };
}

/**
 * Confirms a subitem ID belongs to the parent item being saved.
 */
function assertOwnedSubitem_(scope, subitemId, action) {
  const id = assertNumericId_(subitemId, 'subitem');
  if (!scope.subitemIds[id]) {
    throw new Error(
      `Subitem ${id} does not belong to item ${scope.itemId}; refusing to ${action || 'modify'} it. ` +
      `Reload the form and try again.`
    );
  }
  return id;
}

/**
 * Updates a specific column on Monday.com
 */
function updateMondayColumn(itemId, columnId, value) {
  const config = getConfig();
  let valueStr;
  
  if (typeof value === 'object') {
    valueStr = JSON.stringify(JSON.stringify(value));
  } else {
    valueStr = JSON.stringify(String(value));
  }

  const query = `
    mutation {
      change_column_value (
        board_id: ${config.boardId},
        item_id: ${itemId},
        column_id: "${columnId}",
        value: ${valueStr}
      ) {
        id
      }
    }
  `;

  const response = callMondayAPI(query);
  if (response.errors) {
    throw new Error("Monday API Update Column Error: " + JSON.stringify(response.errors));
  }
  return response;
}

// ========================================================================
// SECTION 2: DROPDOWN OPTIONS & DATA FETCHING
// ========================================================================

// Subitem columns whose labels drive the teacher option panels.
const SUBITEM_OPTION_COLUMN_IDS = [
  "dropdown_mkzc6dgm",  // Grade Levels
  "color_mkzcn0h2",     // Modality
  "dropdown_mm02xrpn",  // Humanities
  "dropdown_mm02azn5",  // STEM
  "dropdown_mm02m53x",  // SPED
  "dropdown_mm02v870",  // Paraprofessional
  "dropdown_mkzcbcq4",  // Languages
  "dropdown_mkzcq8h6",  // Language acquisition
  "dropdown_mm08qwm1"   // CTE
];

/**
 * Resolves the subitem board ID from the parent board's subtasks column.
 *
 * The board reference lives in that column's settings_str as
 * {"boardIds":[123456]}, which is available whether or not any item on the
 * board currently has subitems.
 */
function getSubitemBoardId() {
  const config = getConfig();

  const query = `
    query {
      boards (ids: ${config.boardId}) {
        columns {
          id
          type
          settings_str
        }
      }
    }
  `;

  const response = callMondayAPI(query);
  try {
    const columns = response.data.boards[0].columns || [];
    for (let i = 0; i < columns.length; i++) {
      if (columns[i].type === 'subtasks') {
        const settings = JSON.parse(columns[i].settings_str);
        if (settings.boardIds && settings.boardIds.length > 0) {
          return settings.boardIds[0];
        }
      }
    }
  } catch (e) {
    Logger.log("Could not resolve subitem board ID: " + e.toString());
  }

  return null;
}

/**
 * Fetches dropdown options for parent and subitem columns
 */
function getBoardDropdownOptions() {
  const config = getConfig();
  if (!config.boardId) {
    throw new Error("MONDAY_BOARD_ID not configured in Script Properties");
  }

  const options = {};

  const parentQuery = `
    query {
      boards (ids: ${config.boardId}) {
        columns (ids: ["color_mksnhewa"]) {
          id
          title
          type
          settings_str
        }
      }
    }
  `;

  const parentResponse = callMondayAPI(parentQuery);
  if (parentResponse.data && parentResponse.data.boards && parentResponse.data.boards.length > 0) {
    processColumns(parentResponse.data.boards[0].columns, options);
  }

  // Preferred path: read the subitem board's columns directly.
  const subitemBoardId = getSubitemBoardId();
  if (subitemBoardId) {
    const subitemQuery = `
      query {
        boards (ids: ${subitemBoardId}) {
          columns (ids: ${JSON.stringify(SUBITEM_OPTION_COLUMN_IDS)}) {
            id
            title
            type
            settings_str
          }
        }
      }
    `;

    const subitemResponse = callMondayAPI(subitemQuery);
    try {
      processColumns(subitemResponse.data.boards[0].columns, options);
    } catch (e) {
      Logger.log("Subitem board column query info: " + e.toString());
    }
  }

  // Fallback: reach the subitem board through an existing subitem. Only
  // needed if the subtasks column could not be resolved above.
  const resolvedAny = SUBITEM_OPTION_COLUMN_IDS.some(function (id) { return !!options[id]; });
  if (!resolvedAny) {
    Logger.log("Falling back to items_page lookup for subitem options.");
    const fallbackQuery = `
      query {
        boards (ids: ${config.boardId}) {
          items_page (limit: 25) {
            items {
              subitems {
                board {
                  columns (ids: ${JSON.stringify(SUBITEM_OPTION_COLUMN_IDS)}) {
                    id
                    title
                    type
                    settings_str
                  }
                }
              }
            }
          }
        }
      }
    `;

    const fallbackResponse = callMondayAPI(fallbackQuery);
    try {
      const items = fallbackResponse.data.boards[0].items_page.items || [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].subitems && items[i].subitems.length > 0) {
          processColumns(items[i].subitems[0].board.columns, options);
          break;
        }
      }
    } catch (e) {
      Logger.log("Subitem options fallback info: " + e.toString());
    }
  }

  return options;
}

function processColumns(columns, options) {
  if (!columns) return;
  columns.forEach(column => {
    try {
      const settings = JSON.parse(column.settings_str);
      if (column.type === 'dropdown' && settings.labels) {
        options[column.id] = {
          title: column.title,
          type: column.type,
          labels: settings.labels.map(label => ({ name: label.name }))
        };
      } else if ((column.type === 'color' || column.type === 'status') && settings.labels) {
        options[column.id] = {
          title: column.title,
          type: column.type,
          labels: Object.values(settings.labels).map(label => ({ name: label }))
        };
      }
    } catch (err) {
      Logger.log(`Error parsing column ${column.id}: ${err}`);
    }
  });
}

/**
 * FETCHES EXISTING INQUIRY SUBMISSION DATA BY ITEM ID
 */
function fetchInquiryData(itemId, clientMeta) {
  const startedAt = new Date().getTime();
  try {
    if (!itemId) {
      return { success: false, message: "No Item ID provided." };
    }

    // The ID comes from the client, so confirm it is numeric and really on
    // the inquiry board before reading anything back to the browser.
    const safeItemId = assertNumericId_(itemId, 'item');

    const query = `
      query {
        items (ids: [${safeItemId}]) {
          board { id }
          id
          name
          column_values {
            id
            text
            value
          }
          subitems {
            id
            name
            column_values {
              id
              text
              value
            }
          }
        }
      }
    `;

    const response = callMondayAPI(query);
    
    if (!response.data || !response.data.items || response.data.items.length === 0) {
      return { success: false, message: `Item ID ${itemId} not found in Monday.com.` };
    }

    const item = response.data.items[0];
    const config = getConfig();
    if (!item.board || String(item.board.id) !== String(config.boardId)) {
      return { success: false, message: `Item ${safeItemId} is not on the inquiry board.` };
    }

    const colMap = {};
    item.column_values.forEach(cv => {
      colMap[cv.id] = cv.text || '';
    });

    const schoolData = {
      schoolName: item.name || '',
      address: colMap['text6__1'] || '',
      fullName: colMap['text__1'] || '',
      email: colMap['text5__1'] || '',
      phone: colMap['text_mkzc61ta'] || '',
      additionalInfo: colMap['long_text7__1'] || '',
      numberOfTeachers: colMap['text06__1'] || '',
      certification: colMap['color_mksnhewa'] || '',
      calendarText: colMap['long_text_mkzw9xs4'] || '',
      bellScheduleText: colMap['long_text_mkzwd7xp'] || ''
    };

    // Extract subitems (teachers)
    const teachers = [];
    if (item.subitems && item.subitems.length > 0) {
      item.subitems.forEach(sub => {
        const subColMap = {};
        const rawValMap = {};
        
        sub.column_values.forEach(scv => {
          subColMap[scv.id] = scv.text || '';
          rawValMap[scv.id] = scv.value ? JSON.parse(scv.value) : null;
        });

        // Helper to parse dropdown labels array
        const parseDropdown = (colId) => {
          if (subColMap[colId]) {
            return subColMap[colId].split(',').map(s => s.trim()).filter(Boolean);
          }
          return [];
        };

        teachers.push({
          subitemId: sub.id,
          name: sub.name || '',
          campusName: subColMap['long_text_mm02phkt'] || '',
          campusAddress: subColMap['long_text_mm026ebf'] || '',
          description: subColMap['long_text_mkzb794g'] || '',
          teachingSchedule: subColMap['text_mkzcyvvk'] || '',
          duties: subColMap['long_text_mkzc84xz'] || '',
          annualSalary: subColMap['long_text_mkzhdnv7'] || '',
          proratedSalary: subColMap['long_text_mkzhk5pv'] || '',
          startDate: subColMap['text_mkzc34ak'] || '',
          lastDay: subColMap['text_mkzce7mc'] || '',
          instructionalDays: subColMap['text_mkzdenv2'] || '',
          gradeLevels: parseDropdown('dropdown_mkzc6dgm'),
          languageAcquisition: parseDropdown('dropdown_mkzcq8h6'),
          humanities: parseDropdown('dropdown_mm02xrpn'),
          stem: parseDropdown('dropdown_mm02azn5'),
          sped: parseDropdown('dropdown_mm02m53x'),
          paraprofessional: parseDropdown('dropdown_mm02v870'),
          languages: parseDropdown('dropdown_mkzcbcq4'),
          cte: parseDropdown('dropdown_mm08qwm1'),
          modality: subColMap['color_mkzcn0h2'] || ''
        });
      });
    }

    // Only the client passes clientMeta. Internal callers omit it, so
    // loading data as part of a sync does not log a spurious LOAD row.
    if (clientMeta) {
      logEvent_('LOAD', {
        status: 'success',
        itemId: item.id,
        itemName: schoolData.schoolName,
        mondayUser: clientUser_(clientMeta),
        summary: `Opened inquiry with ${teachers.length} position(s)`,
        startedAt: startedAt
      });
    }

    return {
      success: true,
      itemId: item.id,
      schoolData: schoolData,
      teachers: teachers
    };

  } catch (error) {
    Logger.log("Error in fetchInquiryData: " + error.toString());
    if (clientMeta) {
      logEvent_('LOAD', {
        status: 'error',
        itemId: itemId,
        mondayUser: clientUser_(clientMeta),
        summary: 'Failed to open inquiry',
        details: error.toString(),
        startedAt: startedAt
      });
    }
    return { success: false, message: error.toString() };
  }
}

// ========================================================================
// SECTION 3: SUBMISSION UPDATING & MUTATIONS
// ========================================================================

/**
 * MAIN UPDATE ENTRY POINT
 */
function processUpdateApplication(data) {
  const startedAt = new Date().getTime();
  try {
    const config = getConfig();
    if (!data.itemId) {
      throw new Error("Missing parent Item ID for update.");
    }

    // Every ID in this payload is client-supplied. Resolve the item once and
    // reuse the result to keep every later write inside it.
    const scope = loadItemScope_(data.itemId);
    const itemId = scope.itemId;

    const submissionDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const mainFolder = config.driveFolderId ? DriveApp.getFolderById(config.driveFolderId) : null;

    // STEP 1: Update Parent Item columns on Monday.com
    Logger.log(`Updating parent item ID: ${itemId}`);
    updateParentItem(itemId, data.schoolData);

    // Non-fatal problems worth telling the user about. A failed upload must
    // not lose the teacher edits, but it must not pass silently either - the
    // save otherwise reports success while the file is missing on Monday.
    const warnings = [];

    // STEP 2: Handle Calendar replacement file upload
    let calendarUrl = null;
    if (data.schoolData.calendarFileData && data.schoolData.calendarFileName && mainFolder) {
      try {
        calendarUrl = uploadSchoolCalendar(data.schoolData, itemId, mainFolder, submissionDate);
        if (calendarUrl) {
          updateMondayColumn(itemId, "long_text_mkzw9xs4", { text: `File: ${calendarUrl}` });
          data.schoolData.calendarUrl = calendarUrl;
        }
      } catch (calErr) {
        Logger.log("Calendar upload error: " + calErr);
        warnings.push(`The school calendar file could not be attached. ${reasonFor_(calErr)}`);
      }
    } else if (data.schoolData.calendarText) {
      updateMondayColumn(itemId, "long_text_mkzw9xs4", { text: data.schoolData.calendarText });
    }

    // STEP 2.5: Handle Bell Schedule replacement file upload
    let bellUrl = null;
    if (data.schoolData.bellScheduleFileData && data.schoolData.bellScheduleFileName && mainFolder) {
      try {
        bellUrl = uploadBellSchedule(data.schoolData, itemId, mainFolder, submissionDate);
        if (bellUrl) {
          updateMondayColumn(itemId, "long_text_mkzwd7xp", { text: `File: ${bellUrl}` });
          data.schoolData.bellUrl = bellUrl;
        }
      } catch (bellErr) {
        Logger.log("Bell schedule upload error: " + bellErr);
        warnings.push(`The bell schedule file could not be attached. ${reasonFor_(bellErr)}`);
      }
    } else if (data.schoolData.bellScheduleText) {
      updateMondayColumn(itemId, "long_text_mkzwd7xp", { text: data.schoolData.bellScheduleText });
    }

    // STEP 3: Handle Deleted Subitems
    // Failures are collected rather than thrown so the teacher edits below
    // still get applied; they are reported at the end so the client keeps the
    // delete queue and the user can retry.
    const failedDeletes = [];
    if (data.deletedSubitemIds && data.deletedSubitemIds.length > 0) {
      Logger.log(`Deleting ${data.deletedSubitemIds.length} subitem(s)...`);
      data.deletedSubitemIds.forEach(subId => {
        try {
          deleteMondayItem(assertOwnedSubitem_(scope, subId, 'delete'));
        } catch (delErr) {
          Logger.log(`Error deleting subitem ${subId}: ${delErr}`);
          failedDeletes.push(String(subId));
        }
      });
    }

    // STEP 4: Process Subitems (Edit existing or Create new)
    let processedTeachers = data.teachers || [];
    if (processedTeachers.length > 0) {
      // Updating a subitem needs the board it lives on, which is the subitem
      // board, not the parent board. loadItemScope_ already read it off this
      // item's existing subitems; the column lookup is only needed when the
      // item had none, in which case there is nothing to update anyway.
      let subitemBoardId = scope.subitemBoardId;
      if (!subitemBoardId && processedTeachers.some(function (t) { return !!t.subitemId; })) {
        subitemBoardId = getSubitemBoardId();
        if (!subitemBoardId) {
          throw new Error("Could not resolve the subitem board ID; teacher edits were not saved.");
        }
      }

      processedTeachers.forEach(teacher => {
        // Upload teacher schedule file if new file provided
        if (teacher.teachingScheduleFileData && teacher.teachingScheduleFileName && mainFolder) {
          try {
            const fileUrl = uploadTeacherSchedule(teacher, data.schoolData.schoolName, mainFolder, submissionDate);
            if (fileUrl) {
              // Drop any link written by an earlier save before appending the
              // new one. The old value round-trips through the edit form, so
              // appending blindly stacks up a "File:" line on every upload.
              const scheduleNotes = stripFileReferences(teacher.teachingSchedule);
              teacher.teachingSchedule = scheduleNotes
                ? `${scheduleNotes}\n\nFile: ${fileUrl}`
                : `File: ${fileUrl}`;
            }
          } catch (tFileErr) {
            Logger.log("Teacher schedule file upload error: " + tFileErr);
            warnings.push(`The schedule file for "${teacher.name || 'a teacher position'}" could not be attached. ${reasonFor_(tFileErr)}`);
          }
        }

        if (teacher.subitemId) {
          // Existing subitem -> Update
          updateSubitem(assertOwnedSubitem_(scope, teacher.subitemId, 'update'), teacher, subitemBoardId);
        } else {
          // New teacher card -> Create new subitem
          const newSubId = createSubitem(itemId, teacher);
          teacher.subitemId = newSubId;
        }
      });
    }

    // STEP 5: Regenerate PDF & Update Monday Link Column
    if (mainFolder) {
      try {
        const completionData = {
          teachers: processedTeachers,
          schoolData: data.schoolData,
          parentId: itemId,
          submissionDate: submissionDate
        };
        generateAndUploadPDF(completionData, itemId, mainFolder, submissionDate);
      } catch (pdfErr) {
        Logger.log("PDF update error: " + pdfErr);
        warnings.push('The submission PDF could not be regenerated, so the PDF link on Monday still shows the previous version.');
      }
    }

    // Note: Email notification intentionally omitted per user specification.

    logEvent_('SAVE', {
      status: 'success',
      itemId: itemId,
      itemName: data.schoolData.schoolName,
      mondayUser: clientUser_(data.clientMeta),
      summary: `Saved inquiry: ${processedTeachers.length} position(s), ${(data.deletedSubitemIds || []).length} deleted`,
      details: {
        positions: processedTeachers.length,
        deleted: (data.deletedSubitemIds || []).length,
        calendarUploaded: !!calendarUrl,
        bellScheduleUploaded: !!bellUrl
      },
      startedAt: startedAt
    });

    if (failedDeletes.length > 0) {
      // Everything else saved, but saying "success" here would let the client
      // clear its delete queue and leave those subitems on Monday for good.
      return {
        success: false,
        message: "Your edits were saved, but these teacher position(s) could not be removed: " +
          failedDeletes.join(', ') + ". Please try removing them again.",
        warnings: warnings
      };
    }

    return {
      success: true,
      message: "Inquiry submission updated successfully!",
      warnings: warnings
    };

  } catch (error) {
    Logger.log("Error in processUpdateApplication: " + error.toString());
    logEvent_('SAVE', {
      status: 'error',
      itemId: data ? data.itemId : '',
      itemName: (data && data.schoolData) ? data.schoolData.schoolName : '',
      mondayUser: clientUser_(data ? data.clientMeta : null),
      summary: 'Failed to save inquiry',
      details: error.toString(),
      startedAt: startedAt
    });
    return { success: false, message: "Update Error: " + error.toString() };
  }
}

/**
 * Updates Parent Item on Monday.com
 */
function updateParentItem(itemId, schoolData) {
  const config = getConfig();
  
  const columnValues = {
    "name": schoolData.schoolName,
    "text6__1": schoolData.address,
    "text__1": schoolData.fullName,
    "text5__1": schoolData.email,
    "text_mkzc61ta": schoolData.phone,
    "long_text7__1": schoolData.additionalInfo,
    "text06__1": schoolData.numberOfTeachers
  };

  // An empty string clears a status column; omitting the key would instead
  // leave a stale certification on the item after the user blanks the field.
  columnValues["color_mksnhewa"] = schoolData.certification
    ? { label: schoolData.certification }
    : "";

  const query = `
    mutation {
      change_multiple_column_values (
        board_id: ${config.boardId},
        item_id: ${itemId},
        column_values: ${JSON.stringify(JSON.stringify(columnValues))}
      ) {
        id
      }
    }
  `;

  const response = callMondayAPI(query);
  if (response.errors) {
    throw new Error("Monday API Update Parent Error: " + JSON.stringify(response.errors));
  }
}

// Maps a teacher payload field to its multi-select subitem column.
const TEACHER_DROPDOWN_COLUMNS = {
  gradeLevels: "dropdown_mkzc6dgm",
  languageAcquisition: "dropdown_mkzcq8h6",
  humanities: "dropdown_mm02xrpn",
  stem: "dropdown_mm02azn5",
  sped: "dropdown_mm02m53x",
  paraprofessional: "dropdown_mm02v870",
  languages: "dropdown_mkzcbcq4",
  cte: "dropdown_mm08qwm1"
};

/**
 * Builds the subitem column payload shared by create and update.
 *
 * @param {Object} teacher Teacher card data from the client.
 * @param {boolean} clearEmpty When true (updates), fields the user emptied
 *   are explicitly cleared. When false (creates), empty multi-selects are
 *   simply omitted.
 */
function buildTeacherColumnValues(teacher, clearEmpty) {
  const columnValues = {
    "long_text_mkzb794g": teacher.description || "",
    "text_mkzcyvvk": teacher.teachingSchedule || "",
    "long_text_mkzc84xz": teacher.duties || "",
    "long_text_mkzhdnv7": teacher.annualSalary || "",
    "long_text_mkzhk5pv": teacher.proratedSalary || "",
    "text_mkzc34ak": teacher.startDate || "",
    "text_mkzce7mc": teacher.lastDay || "",
    "text_mkzdenv2": teacher.instructionalDays || "",
    "long_text_mm02phkt": teacher.campusName || "",
    "long_text_mm026ebf": teacher.campusAddress || ""
  };

  Object.keys(TEACHER_DROPDOWN_COLUMNS).forEach(function (field) {
    const columnId = TEACHER_DROPDOWN_COLUMNS[field];
    const labels = teacher[field];

    if (labels && labels.length > 0) {
      columnValues[columnId] = { labels: labels };
    } else if (clearEmpty) {
      columnValues[columnId] = { labels: [] };
    }
  });

  if (teacher.modality) {
    columnValues["color_mkzcn0h2"] = { label: teacher.modality };
  } else if (clearEmpty) {
    // Empty string clears a status column.
    columnValues["color_mkzcn0h2"] = "";
  }

  return columnValues;
}

/**
 * Updates an existing Subitem on Monday.com
 *
 * board_id is required by change_multiple_column_values and must be the
 * subitem board - subitems do not live on the parent board. Callers resolve
 * it once via getSubitemBoardId() and pass it in.
 */
function updateSubitem(subitemId, teacher, subitemBoardId) {
  if (!subitemBoardId) {
    throw new Error("updateSubitem requires the subitem board ID.");
  }

  const columnValues = buildTeacherColumnValues(teacher, true);
  columnValues["name"] = teacher.name;

  const query = `
    mutation {
      change_multiple_column_values (
        board_id: ${subitemBoardId},
        item_id: ${subitemId},
        column_values: ${JSON.stringify(JSON.stringify(columnValues))},
        create_labels_if_missing: true
      ) {
        id
      }
    }
  `;

  const response = callMondayAPI(query);
  if (response.errors) {
    throw new Error("Monday API Update Subitem Error: " + JSON.stringify(response.errors));
  }
  return response;
}

/**
 * Creates a new Subitem on Monday.com
 */
function createSubitem(parentId, teacher) {
  const columnValues = buildTeacherColumnValues(teacher, false);

  const query = `
    mutation {
      create_subitem (
        parent_item_id: ${parentId},
        item_name: "${escapeGql(teacher.name)}",
        column_values: ${JSON.stringify(JSON.stringify(columnValues))}
      ) {
        id
      }
    }
  `;

  const response = callMondayAPI(query);
  if (response.errors) {
    throw new Error("Monday API Create Subitem Error: " + JSON.stringify(response.errors));
  }
  return response.data.create_subitem.id;
}

/**
 * Deletes an item or subitem from Monday.com
 */
function deleteMondayItem(itemId) {
  const query = `
    mutation {
      delete_item (item_id: ${assertNumericId_(itemId, 'item')}) {
        id
      }
    }
  `;
  const response = callMondayAPI(query);
  if (response.errors) {
    throw new Error("Monday API Delete Error: " + JSON.stringify(response.errors));
  }
  return response;
}

// ========================================================================
// SECTION 4: GOOGLE DRIVE HELPER FUNCTIONS
// ========================================================================

function getOrCreateFolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(folderName);
}

function inheritFilePermissions(targetFile, sourceFolder) {
  try {
    const viewers = sourceFolder.getViewers();
    viewers.forEach(viewer => targetFile.addViewer(viewer.getEmail()));
    
    const editors = sourceFolder.getEditors();
    editors.forEach(editor => targetFile.addEditor(editor.getEmail()));
  } catch (e) {
    Logger.log("Error inheriting permissions: " + e.toString());
  }
}

// Uploads are accepted from any signed-in domain user and written into the
// deploying account's Drive, so the browser's accept="" filter is not a
// control - it is a convenience. These are the real limits.
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
const UPLOAD_ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx'];
const UPLOAD_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

/**
 * Validates one client-supplied upload before it is decoded to a blob.
 *
 * Throws with a message meant for the user - callers let it bubble into the
 * save's warning list rather than failing the whole save.
 *
 * @param {string} fileName Original file name from the browser.
 * @param {string} mimeType Reported MIME type; browsers leave this empty for
 *   some .doc files, so an allowed extension carries an empty type.
 * @param {string} base64Data The encoded payload, used to size the file.
 * @param {string} label Human-readable name of the field, used in errors.
 */
/**
 * Turns a caught error into something worth showing the user. Validation
 * messages are written for them; anything else is left generic and stays in
 * the log.
 */
function reasonFor_(err) {
  const message = (err && err.message) ? String(err.message) : String(err || '');
  return /^(School calendar|Bell schedule|Schedule for)/.test(message)
    ? message
    : 'Please try uploading it again.';
}

function validateUpload_(fileName, mimeType, base64Data, label) {
  const name = String(fileName || '').trim();
  if (!name) {
    throw new Error(`${label}: the file has no name.`);
  }

  const dot = name.lastIndexOf('.');
  const extension = dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
  if (UPLOAD_ALLOWED_EXTENSIONS.indexOf(extension) === -1) {
    throw new Error(
      `${label}: "${name}" is a .${extension || 'unknown'} file. ` +
      `Only ${UPLOAD_ALLOWED_EXTENSIONS.join(', ')} files are accepted.`
    );
  }

  const type = String(mimeType || '').trim().toLowerCase();
  if (type && UPLOAD_ALLOWED_MIME_TYPES.indexOf(type) === -1) {
    throw new Error(`${label}: "${name}" is not a document file (${type}).`);
  }

  // base64 carries 3 bytes per 4 characters; the trailing '=' padding is not
  // part of the payload.
  const encoded = String(base64Data || '');
  if (!encoded) {
    throw new Error(`${label}: "${name}" arrived empty.`);
  }
  const padding = encoded.endsWith('==') ? 2 : (encoded.endsWith('=') ? 1 : 0);
  const bytes = Math.floor(encoded.length * 3 / 4) - padding;
  if (bytes > UPLOAD_MAX_BYTES) {
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    throw new Error(
      `${label}: "${name}" is ${mb} MB, over the ` +
      `${UPLOAD_MAX_BYTES / (1024 * 1024)} MB limit.`
    );
  }

  return name;
}

function uploadSchoolCalendar(schoolData, parentId, mainFolder, submissionDate) {
  validateUpload_(schoolData.calendarFileName, schoolData.calendarMimeType, schoolData.calendarFileData, 'School calendar');
  const schoolFolder = getOrCreateFolder(mainFolder, schoolData.schoolName);
  const dateFolder = getOrCreateFolder(schoolFolder, submissionDate);
  const newFileName = `School Calendar File (Updated) - ${schoolData.calendarFileName}`;
  
  const blob = Utilities.newBlob(
    Utilities.base64Decode(schoolData.calendarFileData),
    schoolData.calendarMimeType,
    newFileName
  );
  
  const file = dateFolder.createFile(blob);
  inheritFilePermissions(file, mainFolder);
  return file.getUrl();
}

function uploadBellSchedule(schoolData, parentId, mainFolder, submissionDate) {
  validateUpload_(schoolData.bellScheduleFileName, schoolData.bellScheduleMimeType, schoolData.bellScheduleFileData, 'Bell schedule');
  const schoolFolder = getOrCreateFolder(mainFolder, schoolData.schoolName);
  const dateFolder = getOrCreateFolder(schoolFolder, submissionDate);
  const newFileName = `Bell Schedule File (Updated) - ${schoolData.bellScheduleFileName}`;
  
  const blob = Utilities.newBlob(
    Utilities.base64Decode(schoolData.bellScheduleFileData),
    schoolData.bellScheduleMimeType,
    newFileName
  );
  
  const file = dateFolder.createFile(blob);
  inheritFilePermissions(file, mainFolder);
  return file.getUrl();
}

function uploadTeacherSchedule(teacher, schoolName, mainFolder, submissionDate) {
  validateUpload_(teacher.teachingScheduleFileName, teacher.teachingScheduleMimeType, teacher.teachingScheduleFileData, `Schedule for "${teacher.name || 'teacher position'}"`);
  const schoolFolder = getOrCreateFolder(mainFolder, schoolName);
  const dateFolder = getOrCreateFolder(schoolFolder, submissionDate);
  const newFileName = `${teacher.name} - Schedule (Updated) - ${teacher.teachingScheduleFileName}`;
  
  const blob = Utilities.newBlob(
    Utilities.base64Decode(teacher.teachingScheduleFileData),
    teacher.teachingScheduleMimeType,
    newFileName
  );
  
  const file = dateFolder.createFile(blob);
  inheritFilePermissions(file, mainFolder);
  return file.getUrl();
}

// ========================================================================
// SECTION 5: PDF GENERATION & UPDATE LINK
// ========================================================================

function generateAndUploadPDF(data, parentId, mainFolder, submissionDate) {
  try {
    const pdfUrl = generateSubmissionPDF(data.schoolData, data.teachers, parentId, mainFolder, submissionDate);
    if (pdfUrl) {
      updateMondayColumn(parentId, "wf_edit_link_wdsn", { url: pdfUrl, text: "View Submission PDF (Updated)" });
    }
  } catch (error) {
    Logger.log("PDF generation error: " + error.toString());
  }
}

function generateSubmissionPDF(schoolData, teachers, parentId, mainFolder, submissionDate) {
  const schoolFolder = getOrCreateFolder(mainFolder, schoolData.schoolName);
  const dateFolder = getOrCreateFolder(schoolFolder, submissionDate);
  
  let logoBase64 = '';
  try {
    const logoUrl = "https://kreyco.s3.us-east-2.amazonaws.com/kreyco-logo.png";
    const logoBlob = UrlFetchApp.fetch(logoUrl).getBlob();
    logoBase64 = "data:image/png;base64," + Utilities.base64Encode(logoBlob.getBytes());
  } catch (e) {
    Logger.log("Logo fetch error: " + e.toString());
  }

  let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @page { margin: 40px; size: letter; }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #ffffff; color: #1f2937; line-height: 1.5; }
        .container { max-width: 100%; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #f3f4f6; }
        .logo { height: 60px; margin-bottom: 15px; }
        h1 { color: #16367B; margin: 0; font-size: 24px; font-weight: 700; }
        .section { margin-bottom: 30px; }
        .section-title { color: #16367B; font-size: 18px; font-weight: 600; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 15px; }
        .grid { display: table; width: 100%; border-spacing: 0 10px; }
        .row { display: table-row; }
        .label { display: table-cell; font-weight: 600; color: #4b5563; width: 140px; padding: 4px 0; vertical-align: top; }
        .value { display: table-cell; color: #111827; padding: 4px 0; vertical-align: top; }
        .value a { color: #16367B; text-decoration: none; }
        .teacher-card { border: 1px solid #e5e7eb; padding: 20px; margin-bottom: 20px; border-radius: 12px; background: #f9fafb; page-break-inside: avoid; }
        .teacher-header { font-weight: 700; color: #16367B; font-size: 16px; padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid #e5e7eb; }
        .teacher-row { margin-bottom: 8px; }
        .t-label { font-weight: 600; color: #4b5563; font-size: 0.9em; display: inline-block; width: 130px; vertical-align: top; }
        .t-value { display: inline-block; color: #1f2937; width: calc(100% - 135px); vertical-align: top; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${logoBase64 ? `<img src="${logoBase64}" class="logo" alt="Kreyco">` : ''}
          <h1>Partnership Inquiry (Updated)</h1>
        </div>
        
        <div class="section">
          <div class="section-title">School Information</div>
          <div class="grid">
            <div class="row"><div class="label">School Name</div><div class="value">${escapeHtml(schoolData.schoolName)}</div></div>
            <div class="row"><div class="label">Address</div><div class="value">${escapeHtml(schoolData.address)}</div></div>
            <div class="row"><div class="label">Contact</div><div class="value">${escapeHtml(schoolData.fullName)}</div></div>
            <div class="row"><div class="label">Email</div><div class="value">${escapeHtml(schoolData.email)}</div></div>
            <div class="row"><div class="label">Phone</div><div class="value">${escapeHtml(schoolData.phone)}</div></div>
            <div class="row"><div class="label">School Calendar</div><div class="value">${schoolData.calendarText ? escapeHtml(schoolData.calendarText) : (schoolData.calendarUrl ? `<a href="${schoolData.calendarUrl}" target="_blank">View File</a>` : 'Not provided')}</div></div>
            <div class="row"><div class="label">Bell Schedule</div><div class="value">${schoolData.bellScheduleText ? escapeHtml(schoolData.bellScheduleText) : (schoolData.bellUrl ? `<a href="${schoolData.bellUrl}" target="_blank">View File</a>` : 'Not provided')}</div></div>
            <div class="row"><div class="label">Additional Info</div><div class="value">${escapeHtml(schoolData.additionalInfo || 'None provided')}</div></div>
          </div>
        </div>

        <div class="section">
  `;

  let teacherSectionTitle = 'Teachers';
  let teacherSectionContent = '';

  if (teachers && teachers.length > 0) {
    teacherSectionTitle += ` (${teachers.length})`;
    teachers.forEach(teacher => {
      teacherSectionContent += `
        <div class="teacher-card">
          <div class="teacher-header">${escapeHtml(teacher.name)}</div>
          ${teacher.campusName ? `<div class="teacher-row"><span class="t-label">Campus Name</span><span class="t-value">${escapeHtml(teacher.campusName)}</span></div>` : ''}
          ${teacher.campusAddress ? `<div class="teacher-row"><span class="t-label">Campus Address</span><span class="t-value">${escapeHtml(teacher.campusAddress)}</span></div>` : ''}
          ${teacher.description ? `<div class="teacher-row"><span class="t-label">Description</span><span class="t-value">${escapeHtml(teacher.description)}</span></div>` : ''}
          ${teacher.duties ? `<div class="teacher-row"><span class="t-label">Duties</span><span class="t-value">${escapeHtml(teacher.duties)}</span></div>` : ''}
          ${teacher.gradeLevels && teacher.gradeLevels.length > 0 ? `<div class="teacher-row"><span class="t-label">Grades</span><span class="t-value">${escapeHtml(teacher.gradeLevels.join(', '))}</span></div>` : ''}
          ${teacher.languages && teacher.languages.length > 0 ? `<div class="teacher-row"><span class="t-label">Languages</span><span class="t-value">${escapeHtml(teacher.languages.join(', '))}</span></div>` : ''}
          ${teacher.languageAcquisition && teacher.languageAcquisition.length > 0 ? `<div class="teacher-row"><span class="t-label">Lang. Acquisition</span><span class="t-value">${escapeHtml(teacher.languageAcquisition.join(', '))}</span></div>` : ''}
          ${teacher.humanities && teacher.humanities.length > 0 ? `<div class="teacher-row"><span class="t-label">Humanities</span><span class="t-value">${escapeHtml(teacher.humanities.join(', '))}</span></div>` : ''}
          ${teacher.stem && teacher.stem.length > 0 ? `<div class="teacher-row"><span class="t-label">STEM</span><span class="t-value">${escapeHtml(teacher.stem.join(', '))}</span></div>` : ''}
          ${teacher.sped && teacher.sped.length > 0 ? `<div class="teacher-row"><span class="t-label">SPED</span><span class="t-value">${escapeHtml(teacher.sped.join(', '))}</span></div>` : ''}
          ${teacher.paraprofessional && teacher.paraprofessional.length > 0 ? `<div class="teacher-row"><span class="t-label">Paraprofessional</span><span class="t-value">${escapeHtml(teacher.paraprofessional.join(', '))}</span></div>` : ''}
          ${teacher.cte && teacher.cte.length > 0 ? `<div class="teacher-row"><span class="t-label">CTE</span><span class="t-value">${escapeHtml(teacher.cte.join(', '))}</span></div>` : ''}
          ${teacher.modality ? `<div class="teacher-row"><span class="t-label">Modality</span><span class="t-value">${escapeHtml(teacher.modality)}</span></div>` : ''}
          ${teacher.teachingSchedule ? `<div class="teacher-row"><span class="t-label">Schedule</span><span class="t-value">${escapeHtml(teacher.teachingSchedule)}</span></div>` : ''}
          ${teacher.annualSalary ? `<div class="teacher-row"><span class="t-label">Annual Salary</span><span class="t-value">${escapeHtml(teacher.annualSalary)}</span></div>` : ''}
          ${teacher.proratedSalary ? `<div class="teacher-row"><span class="t-label">Prorated Salary</span><span class="t-value">${escapeHtml(teacher.proratedSalary)}</span></div>` : ''}
          ${teacher.startDate ? `<div class="teacher-row"><span class="t-label">Start Date</span><span class="t-value">${escapeHtml(teacher.startDate)}</span></div>` : ''}
          ${teacher.lastDay ? `<div class="teacher-row"><span class="t-label">End Date</span><span class="t-value">${escapeHtml(teacher.lastDay)}</span></div>` : ''}
          ${teacher.instructionalDays ? `<div class="teacher-row"><span class="t-label">Instructional Days</span><span class="t-value">${escapeHtml(teacher.instructionalDays)}</span></div>` : ''}
        </div>`;
    });
  } else {
    const tbdDescription = schoolData.numberOfTeachers || 'No specific teacher details provided (TBD Mode).';
    teacherSectionContent = `
      <div class="value" style="background: #f9fafb; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb; font-style: italic; color: #4b5563;">
        ${escapeHtml(tbdDescription)}
      </div>`;
  }

  htmlContent += `
           <div class="section-title">${teacherSectionTitle}</div>
           ${teacherSectionContent}
        </div>

        <div style="margin-top: 30px; font-size: 0.8em; color: #999; text-align: center;">
          Last Updated: ${new Date().toLocaleString()} | ID: ${parentId}
        </div>
      </div>
    </body>
    </html>
  `;
  
  const blob = Utilities.newBlob(htmlContent, 'text/html', 'temp.html');
  const pdfBlob = blob.getAs('application/pdf');
  pdfBlob.setName(`${schoolData.schoolName} - Updated Submission - ${parentId}.pdf`);
  
  const pdfFile = dateFolder.createFile(pdfBlob);
  inheritFilePermissions(pdfFile, mainFolder);
  return pdfFile.getUrl();
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ========================================================================
// SECTION 6: NEW CONTRACT / RENEWAL SUBITEM SYNC
// ========================================================================
//
// The PIF parent is linked to a Lead; the Lead in turn corresponds to an
// item on either the *New Contracts board or the Renewal board. This
// section lets the user pick one of those items and push the PIF's teacher
// subitems into it.
//
// The two boards are deliberately asymmetric:
//
//   New Contract - the subject/grade/modality columns are real dropdowns,
//                  so their values must be copied across explicitly.
//   Renewal      - the equivalent columns are mirrors that read *through*
//                  the board relation, so setting the relation is enough
//                  and there is nothing else to copy.
//
// Nothing is ever deleted on the target board.
// ========================================================================

// Version pinned for Connect Boards reads. `text`/`value` are unreliable
// (often null) on relation columns; linked_item_ids is the source of truth.
const CONTRACT_API_VERSION = '2024-10';

// PIF parent column holding the Lead item ID.
const PIF_LEAD_ID_COLUMN = 'text_mkzk3t3r';

const CONTRACT_TARGET_DEFAULTS = {
  new_contract: {
    key: 'new_contract',
    label: 'New Contract',
    // Overridden by NEW_CONTRACT_BOARD_ID / NEW_CONTRACT_SUBITEM_BOARD_ID.
    boardId: '9746564033',
    subitemBoardId: '9746564389',
    // Found by exact match of this column against the PIF's Lead ID.
    leadCatcherColumn: 'text_mkth2f46',
    // Both link columns are written; either satisfies a match.
    linkTextColumn: 'text_mm03m3sd',
    linkRelationColumn: 'board_relation_mm3y1h5m',
    copiesFields: true
  },
  renewal: {
    key: 'renewal',
    label: 'Renewal',
    // Overridden by RENEWAL_BOARD_ID / RENEWAL_SUBITEM_BOARD_ID.
    boardId: '18417033017',
    subitemBoardId: '18417033021',
    // Found by this relation pointing back at the PIF parent item...
    pifParentRelationColumn: 'board_relation_mm452jwf',
    // ...or, when that column is empty, via the Lead - the same hop New
    // Contract uses. Renewal items are not always linked straight to the PIF.
    leadRelationColumn: 'board_relation_mkpt3ya2',
    linkRelationColumn: 'board_relation_mm456sv',
    copiesFields: false
  }
};

// Script Property overrides for the board IDs above, so the same code can be
// pointed at a test board without an edit-and-push. Column IDs stay in the
// source: they are structural, and a mismatch there is a code change, not a
// configuration one.
const CONTRACT_BOARD_PROPERTIES = {
  new_contract: { boardId: 'NEW_CONTRACT_BOARD_ID', subitemBoardId: 'NEW_CONTRACT_SUBITEM_BOARD_ID' },
  renewal: { boardId: 'RENEWAL_BOARD_ID', subitemBoardId: 'RENEWAL_SUBITEM_BOARD_ID' }
};

let contractTargetsCache_ = null;

/**
 * The contract targets with any Script Property overrides applied.
 *
 * Falls back to the values in CONTRACT_TARGET_DEFAULTS, so the portal keeps
 * working if the properties are never set. Cached for the execution because
 * every sync step asks for it.
 */
function getContractTargets() {
  if (contractTargetsCache_) return contractTargetsCache_;

  const props = PropertiesService.getScriptProperties();
  const resolved = {};

  Object.keys(CONTRACT_TARGET_DEFAULTS).forEach(function (key) {
    const target = {};
    const defaults = CONTRACT_TARGET_DEFAULTS[key];
    Object.keys(defaults).forEach(function (field) { target[field] = defaults[field]; });

    const overrides = CONTRACT_BOARD_PROPERTIES[key] || {};
    Object.keys(overrides).forEach(function (field) {
      const value = props.getProperty(overrides[field]);
      if (value && String(value).trim()) {
        target[field] = String(value).trim();
      }
    });

    resolved[key] = target;
  });

  contractTargetsCache_ = resolved;
  return resolved;
}

/**
 * Items in a closed-out group are not valid sync targets - that work is
 * finished and must not be reopened by a later inquiry edit.
 */
// Word-bounded so a group like "Abandoned" is not caught by "done".
const EXCLUDED_GROUP_PATTERN = /\bdone\b|\bnot\s*needed\b/i;

function isExcludedGroup(groupTitle) {
  return EXCLUDED_GROUP_PATTERN.test(String(groupTitle || ''));
}

/**
 * PIF teacher field -> New Contract subitem column.
 * Applied on both create and refresh.
 *
 * CTE is intentionally absent: New Contract has no CTE column yet.
 */
const NEW_CONTRACT_FIELD_MAP = [
  { pifField: 'modality',            columnId: 'color_mkzmfhff',      type: 'status' },
  { pifField: 'gradeLevels',         columnId: 'dropdown_mkztz3vk',   type: 'dropdown' },
  { pifField: 'languageAcquisition', columnId: 'dropdown_mkztba57',   type: 'dropdown' },
  { pifField: 'languages',           columnId: 'dropdown_mkzt9c5y',   type: 'dropdown' },
  { pifField: 'humanities',          columnId: 'dropdown_mm039knb',   type: 'dropdown' },
  { pifField: 'stem',                columnId: 'dropdown_mm034g',     type: 'dropdown' },
  { pifField: 'sped',                columnId: 'dropdown_mm032ybs',   type: 'dropdown' },
  { pifField: 'paraprofessional',    columnId: 'dropdown_mm03fsx6',   type: 'dropdown' }
];

// Written when a New Contract subitem is created, but not refreshed
// afterwards - Talent edits the description on the contract side.
const NEW_CONTRACT_DESCRIPTION_COLUMN = 'long_text_mkzzxb21';

/**
 * Title case, used for the parent-name segment of a subitem name.
 */
function toProperCase(text) {
  if (!text) return '';
  return String(text).toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

/**
 * Builds a target subitem name using the same convention as the existing
 * "Notify Talent" Zap, so portal-created and Zap-created subitems look
 * identical on the board:
 *
 *   [Grade] - [Language Acq] - [Languages] - [Parent Name]
 *
 * Each segment is capped at 50 characters and the whole name at 200.
 * Commas become bullets because Monday.com treats a comma in an item name
 * as a separator and would otherwise create several subitems.
 */
function buildContractSubitemName(teacher, pifParentName) {
  const cap50 = function (value) { return String(value || '').slice(0, 50); };
  const joinList = function (list) { return (list && list.length) ? list.join(', ') : ''; };

  const segments = [
    cap50(joinList(teacher.gradeLevels)),
    cap50(joinList(teacher.languageAcquisition)),
    cap50(joinList(teacher.languages)),
    toProperCase(pifParentName)
  ].filter(function (segment) { return segment !== ''; });

  let name = segments.join(' - ').replace(/,/g, '•');

  if (name.length > 200) {
    name = name.slice(0, 197) + '...';
  }

  // Never hand Monday an empty item name.
  return name || toProperCase(teacher.name) || 'Teacher Position';
}

/**
 * Reads the PIF parent's name and Lead ID.
 */
function getPifLinkInfo(pifItemId) {
  const query = `
    query {
      items (ids: [${assertNumericId_(pifItemId, 'item')}]) {
        id
        name
        column_values (ids: ["${PIF_LEAD_ID_COLUMN}"]) {
          id
          text
        }
      }
    }
  `;

  const response = callMondayAPI(query);
  const item = response.data && response.data.items && response.data.items[0];
  if (!item) {
    throw new Error(`PIF item ${pifItemId} not found.`);
  }

  let leadId = '';
  (item.column_values || []).forEach(function (cv) {
    if (cv.id === PIF_LEAD_ID_COLUMN) leadId = (cv.text || '').trim();
  });

  return { name: item.name || '', leadId: leadId };
}

/**
 * Finds items on a board whose column matches a value, using server-side
 * filtering. Works for both plain text columns and Connect Boards columns
 * (where the compare value is the linked item ID).
 *
 * Returns null - not [] - when the query itself fails, so the caller can
 * tell "no matches" apart from "filtering unavailable" and fall back.
 */
function queryBoardItemsByColumn(boardId, columnId, compareValue) {
  const query = `
    query {
      boards (ids: ${boardId}) {
        items_page (
          limit: 50,
          query_params: {
            rules: [{
              column_id: "${columnId}",
              compare_value: ["${escapeGql(compareValue)}"],
              operator: any_of
            }]
          }
        ) {
          items {
            id
            name
            group { id title }
          }
        }
      }
    }
  `;

  const response = callMondayAPI(query, CONTRACT_API_VERSION);
  if (response.errors) {
    Logger.log(`Column filter failed on board ${boardId}/${columnId}: ${JSON.stringify(response.errors)}`);
    return null;
  }

  try {
    return response.data.boards[0].items_page.items || [];
  } catch (e) {
    Logger.log(`Could not read filtered items for board ${boardId}: ${e}`);
    return null;
  }
}

/**
 * Fallback for Connect Boards columns when server-side filtering is
 * unavailable: page through the board and inspect linked_item_ids.
 *
 * Takes several {columnId, value} probes so one pass can test every way a
 * target might be linked back. Capped so a large board cannot exhaust the
 * Apps Script runtime.
 */
function scanBoardForRelations(boardId, probes) {
  const active = (probes || []).filter(function (probe) {
    return probe.columnId && probe.value;
  });
  if (active.length === 0) return [];

  const columnIds = active.map(function (probe) { return probe.columnId; });
  const matches = [];
  let cursor = null;
  let pages = 0;

  do {
    const pageArgs = cursor ? `limit: 100, cursor: "${cursor}"` : 'limit: 100';
    const query = `
      query {
        boards (ids: ${boardId}) {
          items_page (${pageArgs}) {
            cursor
            items {
              id
              name
              group { id title }
              column_values (ids: ${JSON.stringify(columnIds)}) {
                id
                ... on BoardRelationValue { linked_item_ids }
              }
            }
          }
        }
      }
    `;

    const response = callMondayAPI(query, CONTRACT_API_VERSION);
    if (response.errors) {
      Logger.log(`Relation scan failed on board ${boardId}: ${JSON.stringify(response.errors)}`);
      break;
    }

    let page;
    try {
      page = response.data.boards[0].items_page;
    } catch (e) {
      break;
    }

    (page.items || []).forEach(function (item) {
      const hit = active.some(function (probe) {
        return extractLinkedItemIds(item.column_values, probe.columnId).indexOf(String(probe.value)) !== -1;
      });
      if (hit) {
        matches.push({ id: item.id, name: item.name, group: item.group });
      }
    });

    cursor = page.cursor;
    pages++;
  } while (cursor && pages < 20);

  return matches;
}

/**
 * Pulls linked item IDs out of a column_values array for a relation column.
 */
function extractLinkedItemIds(columnValues, columnId) {
  let ids = [];
  (columnValues || []).forEach(function (cv) {
    if (cv.id !== columnId) return;
    if (cv.linked_item_ids && cv.linked_item_ids.length) {
      ids = cv.linked_item_ids.map(String);
    }
  });
  return ids;
}

/**
 * STEP 1 - Lists every New Contract / Renewal item connected to this PIF,
 * annotated with the group it sits in so the user can tell Pending from
 * Won/Closed.
 */
function findContractTargets(pifItemId) {
  try {
    if (!pifItemId) {
      return { success: false, message: "No PIF item ID provided." };
    }

    // Same untrusted-ID rules as the save path: numeric, and on the inquiry
    // board. Otherwise the sync could be aimed at an arbitrary item.
    const scope = loadItemScope_(pifItemId);
    pifItemId = scope.itemId;

    const info = getPifLinkInfo(pifItemId);
    const diagnostics = [];
    const found = [];

    // --- New Contract: matched through the Lead ID catcher column ---
    const nc = getContractTargets().new_contract;
    if (info.leadId) {
      const ncItems = queryBoardItemsByColumn(nc.boardId, nc.leadCatcherColumn, info.leadId);
      if (ncItems === null) {
        diagnostics.push(`New Contract: lookup on ${nc.leadCatcherColumn} was rejected by the API.`);
      } else {
        diagnostics.push(`New Contract: ${ncItems.length} item(s) matched Lead ${info.leadId}.`);
        ncItems.forEach(function (item) { found.push(decorateCandidate(nc, item)); });
      }
    } else {
      diagnostics.push('New Contract: skipped, this inquiry has no Lead ID.');
    }

    // --- Renewal: several link shapes are possible, so try each ---
    findRenewalCandidates(pifItemId, info.leadId, diagnostics)
      .forEach(function (item) { found.push(decorateCandidate(getContractTargets().renewal, item)); });

    // Drop closed-out items, but report that they existed so an empty list
    // is not mistaken for a broken lookup.
    const candidates = [];
    const excluded = [];
    found.forEach(function (candidate) {
      if (isExcludedGroup(candidate.groupTitle)) {
        excluded.push(candidate);
      } else {
        candidates.push(candidate);
      }
    });

    return {
      success: true,
      pifItemId: String(pifItemId),
      pifName: info.name,
      leadId: info.leadId,
      leadMissing: !info.leadId,
      candidates: candidates,
      excluded: excluded,
      diagnostics: diagnostics
    };

  } catch (error) {
    Logger.log("Error in findContractTargets: " + error.toString());
    return { success: false, message: error.toString() };
  }
}

/**
 * Groups offered when the user picks a target by hand. Only open work
 * qualifies - closed-out groups stay excluded.
 */
const MANUAL_GROUP_PATTERN = /won|pending/i;

/**
 * Lists selectable items on one board for manual designation, used when
 * automatic discovery finds nothing (or finds the wrong thing).
 *
 * Only Won / Pending groups are returned, and closed-out groups are
 * filtered even if their title happens to contain one of those words.
 */
function listManualTargets(targetKey) {
  try {
    const target = getContractTargets()[targetKey];
    if (!target) return { success: false, message: `Unknown target type "${targetKey}".` };

    const query = `
      query {
        boards (ids: ${target.boardId}) {
          groups {
            id
            title
            items_page (limit: 200) {
              items {
                id
                name
              }
            }
          }
        }
      }
    `;

    const response = callMondayAPI(query, CONTRACT_API_VERSION);
    if (response.errors) {
      throw new Error(JSON.stringify(response.errors));
    }

    const rawGroups = (response.data.boards[0].groups) || [];
    const groups = [];

    rawGroups.forEach(function (group) {
      const title = group.title || '';
      if (isExcludedGroup(title)) return;
      if (!MANUAL_GROUP_PATTERN.test(title)) return;

      const items = ((group.items_page && group.items_page.items) || []).map(function (item) {
        return { itemId: String(item.id), name: item.name || '' };
      });

      groups.push({
        groupId: group.id,
        groupTitle: title,
        items: items,
        truncated: items.length >= 200
      });
    });

    return {
      success: true,
      targetKey: target.key,
      targetLabel: target.label,
      groups: groups
    };

  } catch (error) {
    Logger.log("Error in listManualTargets: " + error.toString());
    return { success: false, message: error.toString() };
  }
}

function decorateCandidate(target, item) {
  return {
    targetKey: target.key,
    targetLabel: target.label,
    itemId: String(item.id),
    name: item.name || '',
    groupId: item.group ? item.group.id : '',
    groupTitle: item.group ? item.group.title : ''
  };
}

/**
 * Renewal items are not reliably linked straight back to the PIF, so try
 * each known route before giving up:
 *
 *   1. board_relation_mm452jwf -> this PIF parent
 *   2. board_relation_mkpt3ya2 -> the Lead (same hop New Contract uses)
 *   3. a paged scan of the board testing both columns
 *
 * Results are de-duplicated by item ID.
 */
function findRenewalCandidates(pifItemId, leadId, diagnostics) {
  const rn = getContractTargets().renewal;
  const byId = {};

  const absorb = function (items) {
    (items || []).forEach(function (item) { byId[String(item.id)] = item; });
  };

  // Route 1 - direct relation to the PIF parent.
  const direct = queryBoardItemsByColumn(rn.boardId, rn.pifParentRelationColumn, pifItemId);
  if (direct === null) {
    diagnostics.push(`Renewal: lookup on ${rn.pifParentRelationColumn} was rejected by the API.`);
  } else {
    diagnostics.push(`Renewal: ${direct.length} item(s) linked directly to this inquiry.`);
    absorb(direct);
  }

  // Route 2 - via the Lead.
  if (leadId) {
    const viaLead = queryBoardItemsByColumn(rn.boardId, rn.leadRelationColumn, leadId);
    if (viaLead === null) {
      diagnostics.push(`Renewal: lookup on ${rn.leadRelationColumn} was rejected by the API.`);
    } else {
      diagnostics.push(`Renewal: ${viaLead.length} item(s) linked to Lead ${leadId}.`);
      absorb(viaLead);
    }
  }

  // Route 3 - paged scan, only if the filtered lookups found nothing.
  if (Object.keys(byId).length === 0) {
    const scanned = scanBoardForRelations(rn.boardId, [
      { columnId: rn.pifParentRelationColumn, value: pifItemId },
      { columnId: rn.leadRelationColumn, value: leadId }
    ]);
    diagnostics.push(`Renewal: board scan found ${scanned.length} item(s).`);
    absorb(scanned);
  }

  return Object.keys(byId).map(function (id) { return byId[id]; });
}

/**
 * Reads a target item's subitems along with whichever link columns that
 * board uses, and resolves each to the PIF subitem it already points at.
 */
function getTargetSubitems(target, targetItemId) {
  const columnIds = [target.linkRelationColumn];
  if (target.linkTextColumn) columnIds.push(target.linkTextColumn);

  const query = `
    query {
      items (ids: [${assertNumericId_(targetItemId, 'target item')}]) {
        id
        name
        group { id title }
        subitems {
          id
          name
          column_values (ids: ${JSON.stringify(columnIds)}) {
            id
            text
            ... on BoardRelationValue { linked_item_ids }
          }
        }
      }
    }
  `;

  const response = callMondayAPI(query, CONTRACT_API_VERSION);
  if (response.errors) {
    throw new Error("Could not read target subitems: " + JSON.stringify(response.errors));
  }

  const item = response.data && response.data.items && response.data.items[0];
  if (!item) {
    throw new Error(`Target item ${targetItemId} not found.`);
  }

  const subitems = (item.subitems || []).map(function (sub) {
    const relationIds = extractLinkedItemIds(sub.column_values, target.linkRelationColumn);

    let textId = '';
    if (target.linkTextColumn) {
      (sub.column_values || []).forEach(function (cv) {
        if (cv.id === target.linkTextColumn && cv.text) textId = String(cv.text).trim();
      });
    }

    // The relation wins when both are present and disagree.
    const linkedPifSubitemId = relationIds.length ? relationIds[0] : textId;

    return {
      id: String(sub.id),
      name: sub.name || '',
      linkedPifSubitemId: linkedPifSubitemId || '',
      linkSource: relationIds.length ? 'relation' : (textId ? 'text' : '')
    };
  });

  return {
    itemId: String(item.id),
    name: item.name || '',
    groupTitle: item.group ? item.group.title : '',
    subitems: subitems
  };
}

/**
 * STEP 2 - Pairs each PIF teacher with a target subitem where the link
 * columns already say so, and reports what still needs a decision.
 */
function getContractSyncPlan(pifItemId, targetKey, targetItemId) {
  try {
    const target = getContractTargets()[targetKey];
    if (!target) return { success: false, message: `Unknown target type "${targetKey}".` };
    if (!targetItemId) return { success: false, message: "No target item selected." };

    const pif = fetchInquiryData(pifItemId);
    if (!pif.success) return { success: false, message: pif.message };

    const targetInfo = getTargetSubitems(target, targetItemId);

    // PIF subitem ID -> target subitem, from the existing link columns.
    const claimed = {};
    targetInfo.subitems.forEach(function (sub) {
      if (sub.linkedPifSubitemId) claimed[sub.linkedPifSubitemId] = sub;
    });

    const rows = (pif.teachers || []).map(function (teacher) {
      const match = claimed[String(teacher.subitemId)];
      return {
        pifSubitemId: String(teacher.subitemId),
        pifName: teacher.name || '',
        proposedName: buildContractSubitemName(teacher, pif.schoolData.schoolName),
        matchedSubitemId: match ? match.id : '',
        matchedSubitemName: match ? match.name : '',
        matchSource: match ? match.linkSource : '',
        status: match ? 'matched' : 'unmatched'
      };
    });

    return {
      success: true,
      targetKey: target.key,
      targetLabel: target.label,
      copiesFields: target.copiesFields,
      target: {
        itemId: targetInfo.itemId,
        name: targetInfo.name,
        groupTitle: targetInfo.groupTitle
      },
      rows: rows,
      targetSubitems: targetInfo.subitems
    };

  } catch (error) {
    Logger.log("Error in getContractSyncPlan: " + error.toString());
    return { success: false, message: error.toString() };
  }
}

/**
 * Builds the link-column payload tying a target subitem to a PIF subitem.
 * New Contract carries both a legacy text column and a relation column;
 * writing both keeps the two in step and backfills the relation ahead of
 * the planned migration.
 */
function buildLinkColumnValues(target, pifSubitemId) {
  const values = {};

  if (target.linkRelationColumn) {
    values[target.linkRelationColumn] = { item_ids: [Number(pifSubitemId)] };
  }
  if (target.linkTextColumn) {
    values[target.linkTextColumn] = String(pifSubitemId);
  }

  return values;
}

/**
 * Copies the PIF teacher's option fields into New Contract columns.
 * Returns {} for Renewal, whose equivalents are mirrors.
 */
function buildContractFieldValues(target, teacher) {
  if (!target.copiesFields) return {};

  const values = {};
  NEW_CONTRACT_FIELD_MAP.forEach(function (mapping) {
    const raw = teacher[mapping.pifField];

    if (mapping.type === 'dropdown') {
      values[mapping.columnId] = { labels: (raw && raw.length) ? raw : [] };
    } else if (mapping.type === 'status') {
      values[mapping.columnId] = raw ? { label: raw } : "";
    }
  });

  return values;
}

/**
 * STEP 3 - Applies the user's mapping.
 *
 * Each row either updates an existing target subitem or creates a new one.
 * Target subitems with no PIF counterpart are left completely alone.
 */
function applyContractSync(payload) {
  const startedAt = new Date().getTime();
  try {
    const target = getContractTargets()[payload.targetKey];
    if (!target) return { success: false, message: `Unknown target type "${payload.targetKey}".` };
    if (!payload.targetItemId) return { success: false, message: "No target item selected." };

    const rows = payload.rows || [];
    if (rows.length === 0) {
      return { success: false, message: "Nothing selected to sync." };
    }

    // Reject a mapping that would point two PIF teachers at one subitem.
    const seen = {};
    for (let i = 0; i < rows.length; i++) {
      const chosen = rows[i].targetSubitemId;
      if (!chosen) continue;
      if (seen[chosen]) {
        return {
          success: false,
          message: `Two teachers are mapped to the same target subitem (#${chosen}). Each target subitem can only be matched once.`
        };
      }
      seen[chosen] = true;
    }

    const pif = fetchInquiryData(payload.pifItemId);
    if (!pif.success) return { success: false, message: pif.message };

    const teacherById = {};
    (pif.teachers || []).forEach(function (teacher) {
      teacherById[String(teacher.subitemId)] = teacher;
    });

    const results = [];
    let created = 0;
    let updated = 0;

    rows.forEach(function (row) {
      const teacher = teacherById[String(row.pifSubitemId)];
      if (!teacher) {
        results.push({ pifSubitemId: row.pifSubitemId, status: 'error', message: 'Teacher no longer on the PIF.' });
        return;
      }

      try {
        const columnValues = buildContractFieldValues(target, teacher);
        const linkValues = buildLinkColumnValues(target, teacher.subitemId);
        Object.keys(linkValues).forEach(function (key) { columnValues[key] = linkValues[key]; });

        if (row.targetSubitemId) {
          updateContractSubitem(target, row.targetSubitemId, columnValues);
          updated++;
          results.push({
            pifSubitemId: row.pifSubitemId,
            pifName: teacher.name,
            status: 'updated',
            targetSubitemId: String(row.targetSubitemId)
          });
        } else {
          if (target.copiesFields && teacher.description) {
            columnValues[NEW_CONTRACT_DESCRIPTION_COLUMN] = teacher.description;
          }
          const name = buildContractSubitemName(teacher, pif.schoolData.schoolName);
          const newId = createContractSubitem(payload.targetItemId, name, columnValues);
          created++;
          results.push({
            pifSubitemId: row.pifSubitemId,
            pifName: teacher.name,
            status: 'created',
            targetSubitemId: String(newId),
            targetSubitemName: name
          });
        }
      } catch (rowError) {
        Logger.log(`Contract sync row error (PIF subitem ${row.pifSubitemId}): ${rowError}`);
        results.push({
          pifSubitemId: row.pifSubitemId,
          pifName: teacher.name,
          status: 'error',
          message: rowError.toString()
        });
      }
    });

    const failed = results.filter(function (r) { return r.status === 'error'; }).length;

    logEvent_('CONTRACT_SYNC', {
      status: failed === 0 ? 'success' : 'partial',
      itemId: payload.pifItemId,
      itemName: pif.schoolData.schoolName,
      mondayUser: clientUser_(payload.clientMeta),
      summary: `${target.label} #${payload.targetItemId}: ${created} created, ${updated} updated, ${failed} failed`,
      details: {
        target: target.label,
        targetItemId: String(payload.targetItemId),
        rows: results.map(function (r) {
          return {
            pif: r.pifSubitemId,
            name: r.pifName,
            status: r.status,
            target: r.targetSubitemId || '',
            error: r.message || ''
          };
        })
      },
      startedAt: startedAt
    });

    return {
      success: failed === 0,
      message: failed === 0
        ? `${target.label} updated: ${created} subitem(s) created, ${updated} updated.`
        : `${target.label} partially updated: ${created} created, ${updated} updated, ${failed} failed.`,
      created: created,
      updated: updated,
      failed: failed,
      results: results
    };

  } catch (error) {
    Logger.log("Error in applyContractSync: " + error.toString());
    logEvent_('CONTRACT_SYNC', {
      status: 'error',
      itemId: payload ? payload.pifItemId : '',
      mondayUser: clientUser_(payload ? payload.clientMeta : null),
      summary: 'Contract sync failed',
      details: error.toString(),
      startedAt: startedAt
    });
    return { success: false, message: "Contract sync error: " + error.toString() };
  }
}

function updateContractSubitem(target, subitemId, columnValues) {
  const query = `
    mutation {
      change_multiple_column_values (
        board_id: ${target.subitemBoardId},
        item_id: ${assertNumericId_(subitemId, 'target subitem')},
        column_values: ${JSON.stringify(JSON.stringify(columnValues))},
        create_labels_if_missing: true
      ) {
        id
      }
    }
  `;

  const response = callMondayAPI(query, CONTRACT_API_VERSION);
  if (response.errors) {
    throw new Error("Update failed: " + JSON.stringify(response.errors));
  }
  return response.data.change_multiple_column_values.id;
}

function createContractSubitem(parentItemId, name, columnValues) {
  const safeParentId = assertNumericId_(parentItemId, 'target item');
  const query = `
    mutation {
      create_subitem (
        parent_item_id: ${safeParentId},
        item_name: "${escapeGql(name)}",
        column_values: ${JSON.stringify(JSON.stringify(columnValues))},
        create_labels_if_missing: true
      ) {
        id
      }
    }
  `;

  const response = callMondayAPI(query, CONTRACT_API_VERSION);
  if (response.errors) {
    throw new Error("Create failed: " + JSON.stringify(response.errors));
  }
  return response.data.create_subitem.id;
}
