/* ===== Path2Safe family registration (2026-11-21) =====
   Creates the registration form and its response sheet in paul@sardoch.com,
   then logs the public formResponse URL and entry IDs for the Reunite app. */
var REG_FIELDS = [
  { id: 'name', title: 'Name', type: 'text', required: true },
  { id: 'email', title: 'Email', type: 'text', required: true },
  { id: 'phone', title: 'Phone', type: 'text', required: true },
  { id: 'address', title: 'Home address', type: 'paragraph', required: true },
  { id: 'household', title: 'People in household', type: 'text', required: false },
  { id: 'kids', title: 'Children in school or child care', type: 'mc', options: ['Yes', 'No', 'Not answered'], required: false },
  { id: 'contact', title: 'OK to contact about preparedness services', type: 'mc', options: ['Yes', 'No'], required: true },
  { id: 'sethome', title: 'Saved home address in the app', type: 'mc', options: ['Yes', 'No'], required: false },
  { id: 'setmeet', title: 'Reunite location', type: 'mc', options: ['Home', 'Another place', 'Not now'], required: false },
  { id: 'regid', title: 'Registration ID', type: 'text', required: false },
  { id: 'source', title: 'Source', type: 'text', required: false }
];
function createRegistrationForm() {
  var form = FormApp.create('Path2Safe family registration');
  form.setDescription('Family registrations from the Path2Safe Reunite app (thepreparedhouse.com/reunite). Each update from a family adds a new row with the same Registration ID.');
  form.setCollectEmail(false);
  try { form.setRequireLogin(false); } catch (e) { }
  var items = {};
  REG_FIELDS.forEach(function (f) {
    var it = f.type === 'paragraph' ? form.addParagraphTextItem() : f.type === 'mc' ? form.addMultipleChoiceItem() : form.addTextItem();
    it.setTitle(f.title).setRequired(f.required);
    if (f.type === 'mc') it.setChoiceValues(f.options);
    items[f.id] = it;
  });
  var ss = SpreadsheetApp.create('Path2Safe family registrations');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  var entries = {};
  REG_FIELDS.forEach(function (f) {
    var it = items[f.id], resp = f.type === 'paragraph' ? it.createResponse('x') : f.type === 'mc' ? it.createResponse(f.options[0]) : it.createResponse('x');
    var url = form.createResponse().withItemResponse(resp).toPrefilledUrl();
    var m = url.match(/entry\.(\d+)=/); entries[f.id] = m ? m[1] : null;
  });
  Logger.log('P2S_RESULT ' + JSON.stringify({ formId: form.getId(), action: form.getPublishedUrl().replace(/viewform.*$/, 'formResponse'), edit: form.getEditUrl(), sheet: ss.getUrl(), entries: entries }));
}
