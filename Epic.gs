function Epic(data, childIssues){
  this.key = data.key;
  this.link = '=HYPERLINK("https://project.schoologize.com/browse/' + data.key + '", "' + data.key + '")';
  this.summary = data.fields.summary;
  this.updated = '--';
  if(typeof data.fields.updated != 'undefined'){   
    this.updated = data.fields.updated.split('T')[0];
  }
  this.scrumTeam = this.addCustomField(data, 13671);
  this.progressUpdateNotes = this.addCustomField(data, 13672);
  this.project = data.fields.project.name;
  this.projectStatus = this.addCustomField(data, 13870);
  this.status = data.fields.status.name;

  // Parse Changelog
  var statusChanges = this.getStatusChanges(data);
  this.goalDate = this.addCustomField(data, 13670);
  this.goalDateHistory = this.parseGoalDateChanges(data);
  this.implementationStartDate = this.addCustomField(data, 13770);
  this.addChildIssueData(childIssues);
  this.percentStoryComplete = this.EMPTY_TEXT;
  if(this.totalStoryPoints > 0){
    this.percentStoryComplete = Math.round((this.totalClosedStoryPoints / this.totalStoryPoints) * 100);
  }
  
  // Calculate additional fields based on data
  this.statusColor = this.calculateStatusColor();
  this.defectColor = this.calculateDefectCountStatusColor();
  this.isOutOfDate = this.calculateIsOutOfDate();
  this.projectStatusColor = this.calculateProjectStatusColor();
}

Epic.prototype.STATUS_DANGER = '#FA9BA4';
Epic.prototype.STATUS_WARN = '#FAF89B';
Epic.prototype.STATUS_GOOD = '#83BF78';
Epic.prototype.STATUS_NA = "#909596";
Epic.prototype.EMPTY_TEXT = '--';
Epic.prototype.TOLERABLE_PROGRESS_DIFFERENCE_THRESHOLD = 10;
Epic.prototype.MAX_OPEN_DEFECTS = 7; // 7 Because Why not
Epic.prototype.UPDATE_INTERVAL = 7; // 7 days

Epic.prototype.calculateIsOutOfDate = function(){
  var now = new Date().getTime();
  var lastUpdate = this.makeDateFromStr(this.updated).getTime();
  Logger.log(((now-lastUpdate) / 1000 / 60 / 60 / 24 ));
  var isOutdated = ((now-lastUpdate) / 1000 / 60 / 60 / 24 ) > this.UPDATE_INTERVAL;
  return isOutdated;
}

Epic.prototype.calculateProjectStatusColor = function(){
  switch(this.projectStatus){
    case 'At Risk':
      return this.STATUS_WARN;
      break;
    case 'On Schedule':
      return this.STATUS_GOOD;
      break;
    case 'Major Concerns':
      return this.STATUS_DANGER;
      break;
    default:
      return this.STATUS_NA;
  }
}
      

Epic.prototype.calculateDefectCountStatusColor = function(){
  if(this.openDefects > 7){
    return this.STATUS_DANGER;
  }
  else if(this.openDefects > 3){
    return this.STATUS_WARN;
  }
  return this.STATUS_GOOD;
}

Epic.prototype.calculateStatusColor = function(){
  // If there is no goal date that isn't good
  if(this.goalDate == this.EMPTY_TEXT){
    return this.STATUS_DANGER;
  }
  
  var now = new Date().getTime();
  var start = this.makeDateFromStr(this.implementationStartDate).getTime();
  var end = this.makeDateFromStr(this.goalDate).getTime();
  var totalTime = end - start;
  var elapsedTime = now - start;
  var elapsedTimePercent = Math.round((elapsedTime / totalTime) * 100);
  if(elapsedTimePercent > this.percentStoryComplete){
    var diff = elapsedTimePercent - this.percentStoryComplete;
    if( diff > this.TOLERABLE_PROGRESS_DIFFERENCE_THRESHOLD){      
      return this.STATUS_DANGER;
    }
    else{
      return this.STATUS_WARN;
    }
  }
  else if(this.percentStoryComplete > elapsedTimePercent){
    return this.STATUS_GOOD;
  }
  return this.STATUS_WARN;
}
Epic.prototype.addChildIssueData = function(childIssues){
  this.openDefects = 0;
  this.totalStories = 0;
  this.totalClosedStories = 0;
  this.totalStoryPoints = 0;
  this.totalClosedStoryPoints = 0;
  if(typeof childIssues == 'object'){
    for(var i = 0; i < childIssues.length; i++){
      var childIssue = childIssues[i];
      switch(childIssue.issueType){
        case 'Story':
        case 'Spike':
          this.totalStories += 1;
          this.totalStoryPoints += childIssue.storyPoints;
          if(childIssue.status == 'Closed'){
            this.totalClosedStories += 1;
            this.totalClosedStoryPoints += childIssue.storyPoints;
          }
          break;
        case 'Defect':
          if(childIssue.status != 'Closed'){
            this.openDefects += 1;
          }
          break;
      }
    }
  }
}

Epic.prototype.addCustomField = function(data, fieldId){
  var fieldKey = 'customfield_' + fieldId;
  if(typeof data.fields[fieldKey] != 'undefined' && data.fields[fieldKey] != null){
    var val = data.fields[fieldKey];
    switch(typeof val){
      case 'object':
        return val.value;
      default:
      case 'string':
        return val;
    }
  }
  return this.EMPTY_TEXT;
}

Epic.prototype.getStatusChanges = function(data){
  var statusChanges = {};
  for(var i = 0; i < data.changelog.histories.length; i++){
    var change = data.changelog.histories[i];
    var items = change.items;
    
    for(var j = 0; j < items.length; j++){
      if(items[j].field == "status"){
        statusChanges[items[j].toString] = change.created; 
      }
    }
  }
  return statusChanges;
}

Epic.prototype.parseGoalDateChanges = function(data){
  var goalDate = this.EMPTY_TEXT;
  var goalDateChanges = [];
  for(var i = 0; i < data.changelog.histories.length; i++){
    var change = data.changelog.histories[i];
    var author = change.author;
    var items = change.items;
    
    for(var j = 0; j < items.length; j++){
      if(items[j].field == "Goal Date"){
        var toDate = this.parseGoalDateString(items[j].to);
        goalDateChanges.push(toDate + ' - ' + author.name);
      }
    }
  }  
  
  if(goalDateChanges.length > 0){
    goalDateChanges.reverse();
    goalDate = goalDateChanges.join("\n");
  }

  return goalDate;
}

Epic.prototype.parseGoalDateString = function(date){
  var parts = date.split('-');
  if(parts.length != 3 || date == this.EMPTY_TEXT){
    return this.EMPTY_TEXT;
  }
  // Comes from API as YYYY-MM-DD
  var parsedDateParts = [parts[1], parts[2], parts[0]]
  return parsedDateParts.join('-');
}

// Passed to this function in the form that is displayed in sheet
// YYYY-MM-DD
Epic.prototype.makeDateFromStr = function(date){
  // Thanks! http://stackoverflow.com/questions/8616254/formatting-numbers-within-google-apps-script-javascript-code
  var parts = date.split('-');
  // Something is off - leave it empty
  if(parts.length != 3){
    return this.EMPTY_TEXT;
  }
  return new Date(parts[0], parts[1]-1, parts[2]); // Note: months are 0-based
}

Epic.prototype.toArray = function(headers){
  var epicRow = [];
  for(var i = 0; i < headers.length; i++){
    epicRow.push(this[headers[i].key]);
  }
  return epicRow;
}