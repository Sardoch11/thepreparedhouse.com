/* ===== Survey v5 (2026-11-26): required first name + interest opt-in =====
   Adds five questions to the family survey Google Form, updates its
   description, makes First name required on the interest-list form, and logs
   the entry IDs to paste into CONFIG.forms.family.entries in index.html.
   Self-contained: it doesn't need the addItem() helper from earlier versions.
   Run updateFamilySurveyV5() once, then copy the P2S_RESULT line from the log. */

var V5_FAMILY_FORM = '1RjiZO79LPlI4zqHyOPWIB_M0b9JN-Pk3hDM298msnv0';
var V5_DESC = "This 5-minute survey helps a Portland-area startup understand how families prepare for earthquakes, storms, heat, smoke and power outages. We ask only for your first name, plus contact details if you want to hear from us. We never sell or share your information, and there are no right answers. \"Not interested\" helps us just as much as \"interested.\"\n\nRun by Paul Sardoch, University of Oregon MBA student, as research for The Prepared House.";

var V5_NEW = [
  { id: 'first', type: 'text', required: true, position: 0,
    title: "What's your first name?",
    help: 'First name only. We never publish names or individual answers.' },
  { id: 'optin', type: 'mc', required: true, position: 'end',
    title: "We haven't launched yet. Would you like us to contact you if and when The Prepared House starts building plans in your area?",
    help: 'No payment or deposit. Just a heads-up, and you can opt out anytime.',
    options: ['Yes, contact me', 'No thanks'] },
  // Not required in Google Forms: the website requires email only after "Yes, contact me".
  { id: 'email', type: 'text', required: false, position: 'end', title: 'Best email to reach you' },
  { id: 'phone', type: 'text', required: false, position: 'end', title: 'Mobile number (optional)',
    help: "Only if you'd like a text when we launch." },
  { id: 'ref', type: 'text', required: false, position: 'end', title: 'Referral source',
    help: 'Filled in automatically from the link (for example ?ref=nextdoor). Leave blank.' }
];

function updateFamilySurveyV5() {
  var form = FormApp.openById(V5_FAMILY_FORM);
  form.setDescription(V5_DESC);
  var byTitle = {};
  form.getItems().forEach(function (x) { byTitle[x.getTitle()] = x; });

  V5_NEW.forEach(function (it) {
    if (byTitle[it.title]) return; // already added on an earlier run
    var item = it.type === 'mc' ? form.addMultipleChoiceItem() : form.addTextItem();
    item.setTitle(it.title).setRequired(it.required);
    if (it.help) item.setHelpText(it.help);
    if (it.type === 'mc') item.setChoiceValues(it.options);
    if (it.id === 'email') {
      item.setValidation(FormApp.createTextValidation().requireTextIsEmail()
        .setHelpText('Enter a valid email address.').build());
    }
    byTitle[it.title] = item;
  });

  // First name goes to the top; the rest stay at the end in the order above.
  var all = form.getItems();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getTitle() === V5_NEW[0].title) { if (i !== 0) form.moveItem(i, 0); break; }
  }

  // Re-read the items: newly added ones are typed items, without asTextItem().
  form.getItems().forEach(function (x) { byTitle[x.getTitle()] = x; });
  var entries = {};
  V5_NEW.forEach(function (it) {
    var x = byTitle[it.title], resp;
    if (it.type === 'mc') resp = x.asMultipleChoiceItem().createResponse(it.options[0]);
    else resp = x.asTextItem().createResponse(it.id === 'email' ? 'a@example.com' : 'x');
    var m = form.createResponse().withItemResponse(resp).toPrefilledUrl().match(/entry\.(\d+)=/);
    entries[it.id] = m ? m[1] : null;
  });
  Logger.log('P2S_RESULT ' + JSON.stringify({ count: form.getItems().length, entries: entries }));
}

/* Interest-list form: make First name required and update the wording.
   Pass the sign-up form's ID (from its edit URL). */
function updateSignupFormV5(signupFormId) {
  var form = FormApp.openById(signupFormId);
  form.setTitle('The Prepared House: Interest List');
  form.setDescription("Tell us you're interested in The Prepared House. We haven't launched yet. We'll contact you only about whether and when plan building opens, and you can opt out anytime. No payment or deposit. We never sell or share your information.");
  form.getItems().forEach(function (x) {
    if (x.getTitle() === 'First name') x.asTextItem().setRequired(true);
  });
  Logger.log('P2S_RESULT signup updated');
}
