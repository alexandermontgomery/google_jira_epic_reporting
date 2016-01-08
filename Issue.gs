function Issue(data){
  this.key = '=HYPERLINK("https://project.schoologize.com/browse/' + data.key + '", "' + data.key + '")';
  this.issueType = data.fields.issuetype.name;
  this.summary = data.fields.summary;
  this.epicKey = data.fields.customfield_11371;
  this.storyPoints = data.fields.customfield_11070;
  this.status = data.fields.status.name;
}