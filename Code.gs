// URL for Jira's REST API for issues
var jiraApiBase = "https://project.schoologize.com/rest/";
var maxResults = 1000;
/** 
 * Add a nice menu option for the users.
 */
function onOpen() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var entries = [{
    name : "Rebuild Epics",
    functionName : "redrawEpics"
  }];
  sheet.addMenu("Jira", entries);
  redrawEpics();
};

function search(path, method, data){
  
  data.maxResults = maxResults;
  
  // Personally I prefer the script to handle request failures, hence muteHTTPExceptions = true
  var fetchArgs = {
    contentType: "application/json",
    headers: {"Authorization":"Basic FillInBase64Credentials"},
    muteHttpExceptions : true
  };
  if(method == 'post'){
    fetchArgs.payload = JSON.stringify(data);
  }
  else{
    method = 'get'
  }
  fetchArgs.method = method;
  var httpResponse = UrlFetchApp.fetch(jiraApiBase + path, fetchArgs);
  var statusCode = httpResponse.getResponseCode();
  if(statusCode > 299){
    Browser.msgBox("Failed fetching data from JIRA: " + path);
    return false;
  }
  var resp = JSON.parse(httpResponse.getContentText());
  // Make sure Max Results is aligning with what we expect. This could throw things off
  if(resp.total > maxResults || resp.maxResults != maxResults){
    Browser.msgBox("MAX RESULTS IS OFF! WARN!!!");
    return {};
  }
  return resp;
}
  

function getEpicHeaders(){
  return [
    {
      title: "Epic Link",
      key : "link"
    },
    {
      title: "Epic Summary",
      key: "summary"
    },
    {
      title: "Team",
      key: "scrumTeam"
    },
    {
      title: "Open Defects",
      key: "openDefects"
    },
    {
      title: "Number Closed Stories",
      key: "totalClosedStories"
    },    
    {
      title: "Number Stories",
      key: "totalStories"
    },
    {
      title: "Closed Story Points",
      key: "totalClosedStoryPoints"
    },    
    {
      title: "Story Points",
      key: "totalStoryPoints"
    },
    {
      title: "Percent Complete",
      key: "percentStoryComplete"
    },
    {
      title: "Project Status",
      key: "projectStatus"
    },
    {
      title: "Implementation Start Date",
      key: "implementationStartDate"
    },
    {
      title: "Goal Date",
      key: "goalDate"
    },
    {
      title: "Goal Date History",
      key: "goalDateHistory"
    },
    {
      title: "Last Updated",
      key: "updated"
    },
    {
      title: "Progress Notes",
      key: "progressUpdateNotes"
    },
    {
      title: "Status",
      key: "status"
    },
    {      
      title: "Epic Key",
      key : "key"
    },
    {
      title: "Project",
      key : "project"
    },
  ];
}

function getEpicHeaderRow(){
  var headerRow = [];
  var headers = getEpicHeaders();
  for(var i = 0; i < headers.length; i++){
    headerRow.push(headers[i].title);
  }
  return headerRow;
}

/**
 * Make a request to jira for all listed tickets, and update the spreadsheet 
 */
function redrawEpics(){
  // Pull the bits and pieces you need from the spreadsheet
  var spreadSheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'Epics';
  var sheet = spreadSheet.getSheetByName(sheetName);
  if(sheet == null){
    spreadSheet.insertSheet(sheetName);
    var sheet = spreadSheet.getSheetByName(sheetName);
  }

  // This query is document here https://collab.schoologize.com/display/~amontgomery/Epic+Status+Document. If you update please reflect in Confluence page.
  var jiraData = search('api/2/search', 'post', {
    "jql" : "type = Epic and (('Goal Date' > startOfYear(-100d) OR 'Implementation Start Date' > startOfYear(-100d)) and status in ('To Do', 'In Progress','Closed'))",
    "expand" : [
      "changelog"
    ],
    "fields" : [
      "updated",
      "summary",
      "key",
      "status",
      "project",
      "customfield_13671", // Scrum Team
      "customfield_13672", // Progress Update Notes
      "customfield_13670", // Goal Date
      "customfield_13770", // Implementation Start Date
      "customfield_13870"  // Project Status
    ]
  });
  
  if(jiraData === false){
    return;
  }

  var epics = [];
  for (var i = 0; i < jiraData.issues.length; i++ ) {
    epics.push(jiraData.issues[i].key);
  }
    
  var epicIssues = fetchEpicIssueData(epics);
  var headers = getEpicHeaders();
  var numCols = headers.length;
  
  var defectCountColumn = 1;
  var percentCompleteColumn = 1;
  var projectStatusColumn = 1;
  for (var i = 0; i < headers.length; i++) {
    if(headers[i].key == 'percentStoryComplete'){
      percentCompleteColumn = i + 1;
    }
    else if(headers[i].key == 'openDefects'){
      defectCountColumn = i + 1;
    }
    else if(headers[i].key == 'projectStatus'){
      projectStatusColumn = i + 1;
    }
    sheet.getRange(2, percentCompleteColumn,200,1).setBackground(null);
    sheet.getRange(2, defectCountColumn,200,1).setBackground(null);
    sheet.getRange(2, projectStatusColumn,200,1).setBackground(null);
  }
 
  var values = [];
  values.push(getEpicHeaderRow());
  
  for (var i = 0; i < jiraData.issues.length; i++ ) {
    var issueData = jiraData.issues[i];
    var epic = new Epic(issueData, epicIssues[issueData.key]);
    // Highlight red if out of date
    var row = sheet.getRange(i+2, 1, 1, numCols);
    if(epic.isOutOfDate){
      row.setBackground('red');      
    }
    else{
      row.setBackground(null);
    }
    sheet.getRange(i+2, defectCountColumn, 1, 1).setBackground(epic.defectColor);
    sheet.getRange(i+2, percentCompleteColumn, 1, 1).setBackground(epic.statusColor);
    sheet.getRange(i+2, projectStatusColumn, 1, 1).setBackground(epic.projectStatusColor);
    values.push(epic.toArray(headers));
  }
              
  // Get range
  var numRows = values.length;
  sheet.clearContents();
  var epicRange = sheet.getRange(1,1,numRows,numCols);            
  epicRange.setValues(values);
}

function fetchEpicIssueData(epics){
  var jiraData = search('api/2/search', 'post', {
    "jql" : "type IN(Story, Defect, Spike) AND 'Epic Link' IN(" + epics.join(',') + ")",
    "fields" : [
      "summary",
      "key",
      "status",
      "issuetype",
      "customfield_11371",
      "customfield_11070"
    ]
  });
  var issueData = {};
  for (var i = 0; i < jiraData.issues.length; i++ ) {
    var issue = new Issue(jiraData.issues[i]);
    if(typeof issueData[issue.epicKey] == 'undefined'){
      issueData[issue.epicKey] = [];
    }
    issueData[issue.epicKey].push(issue);
  }
  return issueData;
}
      
