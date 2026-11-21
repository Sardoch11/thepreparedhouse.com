

/* ===== Survey v2 (2026-11-21): whole-home plan, concerns and $349 check ===== */
var FAMILY_V2 = [{"id": "zip", "type": "text", "required": true, "pattern": "^\\d{5}$", "patternHelp": "Please enter a 5-digit ZIP code.", "title": "What is your ZIP code?", "help": "We use this only to see which neighborhoods respond."}, {"id": "household", "type": "checkbox", "required": true, "title": "Who lives in your home? Select all that apply.", "options": ["Children under 5", "Children 5 to 17", "Adults 65 or older", "Someone who relies on medical equipment or medication that needs power or refrigeration", "Someone with a disability or mobility need", "Pets", "None of these"]}, {"id": "tenure", "type": "mc", "required": true, "title": "Do you own or rent your home?", "options": ["Own", "Rent", "Other living arrangement"]}, {"id": "stage", "type": "mc", "required": true, "title": "Which statement best describes your household's emergency planning today?", "options": ["We haven't really thought about it", "We've talked about it but haven't started", "We've started a plan or gathered some supplies, but haven't finished", "We have a written plan and supplies for a few days", "We have a written plan and supplies for two weeks or more"]}, {"id": "lived", "type": "checkbox", "required": true, "title": "In the past five years, which of these has your household lived through? Select all that apply.", "options": ["A power outage of 24 hours or longer", "An ice or snow storm that kept us home", "Wildfire smoke that kept us indoors", "Extreme heat", "Feeling an earthquake", "Leaving home because of an emergency", "None of these"]}, {"id": "worries", "type": "checkbox", "required": true, "max": 3, "shuffle": true, "fixedLast": 1, "title": "Which emergencies worry you most for your household? Select up to three.", "options": ["A major earthquake", "A winter power outage lasting days", "Extreme heat", "Wildfire smoke", "Wildfire evacuation", "Flooding or landslides", "A house fire", "Being apart from family when something happens", "None of these"]}, {"id": "homeconf", "type": "scale", "required": true, "low": 1, "high": 5, "lowLabel": "Not at all confident", "highLabel": "Completely confident", "title": "If your home had no power or running water for two weeks, how confident are you that your household could stay there safely?"}, {"id": "confidence", "type": "scale", "required": true, "low": 1, "high": 5, "lowLabel": "Not at all confident", "highLabel": "Completely confident", "title": "If an earthquake struck on a school or work day, how confident are you that everyone in your household would know where to meet and how to reach each other?"}, {"id": "helpwith", "type": "checkbox", "required": true, "max": 3, "shuffle": true, "fixedLast": 1, "title": "Which parts of getting ready at home would you most want help with? Select up to three.", "options": ["Storing enough water", "Food for two weeks", "Backup power and phone charging", "Staying warm or cool without power", "Clean air during wildfire smoke", "Medications and medical equipment", "Making the home safer (gas shutoff, water heater strap, securing furniture)", "Toilets and hygiene without running water", "Caring for pets", "Finding and reaching each other", "Important documents and insurance", "Knowing what to do and when", "None of these"]}, {"id": "barriers", "type": "checkbox", "required": true, "max": 3, "shuffle": true, "fixedLast": 1, "optionsRef": "barrierOptions", "title": "What, if anything, has kept your household from doing more to prepare? Select up to three."}, {"id": "interest", "type": "mc", "required": true, "title": "Some services offer a personalized home plan. A planner walks through your home with you (or meets online) and plans what your household needs to stay safe at home for two weeks without power or water: water, food, backup power, heat and cooling, clean air, medications and simple home safety fixes. The planner also sets meeting places and safe routes to reach each other, gives you a supply list (or brings the supplies), and updates the plan each year. How interested would your household be in a service like this?", "options": ["Not at all interested", "Slightly interested", "Moderately interested", "Very interested", "Extremely interested"]}, {"id": "format", "type": "mc", "required": true, "title": "If you used a service like this, which would you prefer?", "options": ["A planner visits our home", "An online video session", "A do-it-yourself guide with supplies delivered", "Any of these", "None of these"]}, {"id": "price", "type": "mc", "required": true, "title": "For a one-time plan like the one described above, what price would feel reasonable to you?", "options": ["I would only use a free option", "Under $100", "$100 to $199", "$200 to $299", "$300 to $399", "$400 to $499", "$500 or more", "Not sure"]}, {"id": "book349", "type": "mc", "required": true, "title": "If the in-home plan cost $349, how likely would your household be to book it?", "options": ["Not at all likely", "Slightly likely", "Moderately likely", "Very likely", "Extremely likely"]}, {"id": "refresh", "type": "mc", "required": true, "title": "Would your household pay a yearly fee to keep a plan current as life changes (new school, job or home)?", "options": ["Yes", "Maybe", "No"]}, {"id": "trust", "type": "checkbox", "required": true, "title": "Where would you trust information about preparing your household? Select all that apply.", "options": ["My child's school or school district", "City or county emergency management", "A neighborhood association or NET team", "My insurance agent", "My real estate agent or property manager", "My doctor or healthcare provider", "Friends, family or neighbors", "Social media", "Local news"]}, {"id": "channel", "type": "mc", "required": true, "websiteValue": "The Prepared House website", "title": "How did you hear about this survey?", "options": ["The Prepared House website", "A school or parent group", "A neighborhood group or NET team", "Social media", "A friend or family member", "Somewhere else"]}, {"id": "comment", "type": "paragraph", "required": false, "title": "Anything else you'd like to share? (optional)"}];
var FAMILY_V2_DESC = "This 4-minute survey helps a Portland-area startup understand how families prepare for earthquakes, storms, heat, smoke and power outages. It's anonymous, and there are no right answers. \"Not interested\" helps us just as much as \"interested.\"\n\nRun by Paul Sardoch, University of Oregon MBA student, as research for The Prepared House.";
var FAMILY_V2_OLD = {"help": "Which of these, if any, would your household be likely to use? Select up to two.", "interest": "Some services offer a personalized household plan. A planner meets with you at home or online, sets meeting places and routes around your home, schools and workplaces, lists the supplies your household needs, and updates the plan each year. How interested would your household be in a service like this?"};

function updateFamilySurveyV2() {
  var form = FormApp.openById('1RjiZO79LPlI4zqHyOPWIB_M0b9JN-Pk3hDM298msnv0');
  form.setDescription(FAMILY_V2_DESC);
  var interestNew = FAMILY_V2.filter(function (s) { return s.id === 'interest'; })[0].title;
  form.getItems().forEach(function (x) {
    if (x.getTitle() === FAMILY_V2_OLD.help) form.deleteItem(x);
  });
  form.getItems().forEach(function (x) {
    if (x.getTitle() === FAMILY_V2_OLD.interest) x.setTitle(interestNew);
  });
  var have = {};
  form.getItems().forEach(function (x) { have[x.getTitle()] = true; });
  var scratch = {};
  FAMILY_V2.forEach(function (it) { if (!have[it.title]) addItem(form, it, scratch); });
  FAMILY_V2.forEach(function (it, idx) {
    var all = form.getItems();
    for (var i = 0; i < all.length; i++) {
      if (all[i].getTitle() === it.title) { if (i !== idx) form.moveItem(i, idx); break; }
    }
  });
  var out = {}, order = [];
  form.getItems().forEach(function (x) {
    var it = FAMILY_V2.filter(function (s) { return s.title === x.getTitle(); })[0];
    if (!it) { order.push('UNMATCHED: ' + x.getTitle()); return; }
    order.push(it.id);
    out[it.id] = familyEntryFor(form, x, it);
  });
  Logger.log('P2S_RESULT ' + JSON.stringify({ count: form.getItems().length, order: order, entries: out }));
}

function familyEntryFor(form, x, it) {
  var t = x.getType(), s;
  if (t === FormApp.ItemType.TEXT) s = x.asTextItem().createResponse(it.pattern ? '97201' : 'x');
  else if (t === FormApp.ItemType.PARAGRAPH_TEXT) s = x.asParagraphTextItem().createResponse('x');
  else if (t === FormApp.ItemType.MULTIPLE_CHOICE) s = x.asMultipleChoiceItem().createResponse(opts(it)[0]);
  else if (t === FormApp.ItemType.CHECKBOX) s = x.asCheckboxItem().createResponse([opts(it)[0]]);
  else if (t === FormApp.ItemType.SCALE) s = x.asScaleItem().createResponse(it.low);
  else return null;
  var m = form.createResponse().withItemResponse(s).toPrefilledUrl().match(/entry\.(\d+)=/);
  return m ? m[1] : null;
}
