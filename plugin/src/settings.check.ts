import { formValuesToSettings, servicesToText, parseServiceLine, authorCredentialsToText, parseAuthorCredentialLine } from "./settingsForm.ts";

const values = {
  org_name: "  Gulf Coast Heating & Air  ",
  org_type: "HVACBusiness",
  org_url: "https://example.com",
  org_telephone: "+1-813-555-0142",
  org_same_as: "https://facebook.com/x\n  \nnot-a-url\nhttps://yelp.com/y",
  services: "/pages/ac-repair | AC Repair | HVAC repair | Tampa, FL | Fast fixes\n/pages/duct | Duct Sealing\nmissing-slash | Nope\n| |\n/pages/x",
  author_credentials: "Alex Rivera | Master HVAC Certification | https://example.edu/cert/123\nGeneral Certification | https://example.edu/cert/456\nJust A Name",
  search_path: "search",
  search_param: "q",
  faq_fields: "faq, faqs  questions",
  audit_collections: "posts,pages",
};

const { settings, warnings } = formValuesToSettings(values);
console.log("SETTINGS:", JSON.stringify(settings, null, 1));
console.log("\nWARNINGS:");
warnings.forEach(w => console.log(" -", w));
console.log("\nROUND TRIP services text:");
console.log(servicesToText(settings.services));
console.log("\nROUND TRIP author_credentials text:");
console.log(authorCredentialsToText(settings.authorCredentials));
console.log("\nempty form ->", JSON.stringify(formValuesToSettings({}).settings));
console.log("bad line ->", parseServiceLine("no-leading-slash | Name"));
console.log("parsed cred line ->", parseAuthorCredentialLine("Author Name | Cert Title | https://cert.url"));
