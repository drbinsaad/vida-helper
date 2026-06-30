// ==UserScript==
// @name         VIDA Dashboard Helper
// @namespace    https://vida.hmg.com/
// @version      1.10.2
// @description  Workflow helper for VIDA dashboard and OPD details. Quick code text expansion. Safe: no automatic patient action clicks.
// @match        *://vida.hmg.com/*
// @match        *://*.vida.hmg.com/*
// @run-at       document-idle
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "1.10.2";
  const RED = "#d02127";
  const PANEL_ID = "vida-dash-helper";
  const NETWORK_LOG_KEY = "__vidaHelperNetworkLog";
  const NETWORK_INSTALLED_KEY = "__vidaHelperNetworkRecorderInstalled";
  const KEYBOARD_INSTALLED_KEY = "__vidaHelperKeyboardInstalled";
  const PANEL_POSITION_KEY = "__vidaHelperPanelPosition";
  const PANEL_COLLAPSED_KEY = "__vidaHelperPanelCollapsed";
  const QUICK_TEXT_KEY = "__vidaHelperQuickTexts";
  const MODULE_DEFAULT_KEY = "__vidaHelperModuleDefaults";
  const EXPANSION_INSTALLED_KEY = "__vidaHelperExpansionInstalled";
  const QUICK_TEXT_TRIGGER_SIGIL = "/";
  const MAX_TRIGGER_LENGTH = 24;
  let quickTextTriggerIndex = new Map();
  let lastSyncedModule = "";
  let lastExpansion = null;
  let expansionInProgress = false;
  let lastQuickTextField = null;
  const userChosenModules = new Set();
  const QUICK_TEXT_FIELD_NAMES = [
    "hopi",
    "currentMedication",
    "chiefComplaintRemarks",
    "remarks",
    "prescriptionInstruction",
  ];
  const QUICK_TEXT_MODULE_SCOPES = [
    "History / HOPI",
    "Current Medication",
    "Chief Complaint",
    "Orders / Prescriptions",
    "Assessment / Diagnosis",
    "Sick Leave",
  ];
  const RICH_EDITOR_SELECTORS = [
    "iframe",
    "[contenteditable='true']",
    ".tox-edit-area iframe",
    ".mce-edit-area iframe",
    ".tox-tinymce",
    ".mce-tinymce",
    ".e-richtexteditor",
    ".e-rte-content",
    ".note-editor",
    ".note-editable",
    ".ql-editor",
    ".ck-editor__editable",
    ".fr-element",
  ];
  const PRESCRIPTION_FIELD_NAMES = [
    "item",
    "dose",
    "strength",
    "route",
    "frequency",
    "doseTime",
    "indications",
    "startDateTime",
    "duration",
    "prescriptionInstruction",
  ];
  const SICK_LEAVE_FIELD_NAMES = [
    "noOfDays",
    "startDate",
    "remarks",
  ];
  const VITALS_FIELD_NAMES = [
    "isVitalsRequired",
    "weightKg",
    "weightLbs",
    "weightoz",
    "heightCm",
    "heightInch",
    "headCircumCm",
    "leanBodyWeightLbs",
    "idealBodyWeightLbs",
    "bodyMassIndex",
    "indicator",
    "temperatureCelcius",
    "temperatureF",
    "temperatureCelciusMethod",
    "pulseBeatPerMinute",
    "pulseRhythm",
    "respirationBeatPerMinute",
    "respirationPattern",
    "sao2",
    "fio2",
    "bloodPressureHigher",
    "bloodPressureLower",
    "bloodPressureCuffLocation",
    "bloodPressurePatientPosition",
    "bloodPressureCuffSize",
    "painScore",
    "painLocation",
    "painCharacter",
    "painDuration",
    "painFrequency",
    "isPainManagementDone",
    "painScale",
  ];
  const HISTORY_FIELD_NAMES = [
    "hopi",
    "drug",
    "dose",
    "strength",
    "route",
    "frequency",
    "currentMedication",
    "numberOfWeeks",
  ];
  const ASSESSMENT_FIELD_NAMES = [
    "icdCode10ID",
    "ascii_Desc",
    "conditionID",
    "diagnosisTypeID",
    "complexDiagnosis",
    "remarks",
  ];
  const PATIENT_LIST_FIELD_NAMES = [
    "patientMRN",
    "dateFrom",
    "dateTo",
    "clinic",
  ];
  const SAFE_NAV_LABELS = [
    "Review",
    "Health Summary",
    "Assessment",
    "Vitals",
    "Chief Complaint",
    "History",
    "Orders",
    "Prescriptions",
    "Sick Leave",
    "Extend Sick Leave",
  ];

  function redact(value) {
    return String(value || "")
      .replace(/\b05\d{8}\b/g, "[phone]")
      .replace(/\b\d{6,}\b/g, "[number]")
      .replace(/[A-Z][A-Z'\-]+(?:\s+[A-Z][A-Z'\-]+){1,}/g, "[name]")
      .slice(0, 500);
  }

  function norm(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function visible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function uniqueElements(elements) {
    return Array.from(new Set(elements.filter(Boolean)));
  }

  function textOf(el) {
    return norm(el && (el.innerText || el.textContent || el.value || ""));
  }

  function findButtonsByText(text) {
    const needle = text.toLowerCase();
    return Array.from(document.querySelectorAll("button,a,[role='button']"))
      .filter(visible)
      .filter((el) => textOf(el).toLowerCase().includes(needle));
  }

  function findFirstButtonByText(text) {
    return findButtonsByText(text)[0] || null;
  }

  function findExactElementsByText(text) {
    const needle = text.toLowerCase();
    return Array.from(document.querySelectorAll("button,a,[role='button'],[role='tab'],div,span"))
      .filter(visible)
      .filter((el) => textOf(el).toLowerCase() === needle);
  }

  function getDeleteControls() {
    return uniqueElements(Array.from(document.querySelectorAll("delete-icon,.delete-icon,[class*='delete']"))).filter(visible);
  }

  function getPlaceholderControls(text) {
    const needle = text.toLowerCase();
    return Array.from(document.querySelectorAll("input,textarea"))
      .filter(visible)
      .filter((el) => String(el.getAttribute("placeholder") || "").toLowerCase().includes(needle));
  }

  function getFieldsByName(name) {
    return Array.from(document.querySelectorAll(`[formcontrolname="${name}"]`)).filter(visible);
  }

  function fieldHasContent(field) {
    if (!field) return false;
    const directValue = norm(field.value || field.getAttribute("value") || "");
    if (directValue && !/^select$/i.test(directValue)) return true;
    const text = norm(field.innerText || field.textContent || "");
    return Boolean(text && !/^select$/i.test(text));
  }

  function hasVisibleClinicalFields() {
    return VITALS_FIELD_NAMES.concat(HISTORY_FIELD_NAMES, ASSESSMENT_FIELD_NAMES, PRESCRIPTION_FIELD_NAMES, SICK_LEAVE_FIELD_NAMES)
      .some((name) => getFieldsByName(name).length);
  }

  function recordNetwork(type, method, url, startedAt) {
    if (!url || !/vida\.hmg\.com(?::8081)?\/api/i.test(String(url))) return;
    window[NETWORK_LOG_KEY] = Array.isArray(window[NETWORK_LOG_KEY]) ? window[NETWORK_LOG_KEY] : [];
    window[NETWORK_LOG_KEY].push({
      time: new Date(startedAt || Date.now()).toISOString(),
      type,
      method: String(method || "GET").toUpperCase(),
      url: scrubNetworkUrl(url),
    });
    if (window[NETWORK_LOG_KEY].length > 80) {
      window[NETWORK_LOG_KEY] = window[NETWORK_LOG_KEY].slice(-80);
    }
  }

  function installNetworkRecorder() {
    if (window[NETWORK_INSTALLED_KEY]) return;
    window[NETWORK_INSTALLED_KEY] = true;
    window[NETWORK_LOG_KEY] = Array.isArray(window[NETWORK_LOG_KEY]) ? window[NETWORK_LOG_KEY] : [];

    if (typeof window.fetch === "function") {
      const originalFetch = window.fetch;
      window.fetch = function vidaFetchRecorder(input, init) {
        const url = input && input.url ? input.url : input;
        const method = init && init.method ? init.method : input && input.method ? input.method : "GET";
        const startedAt = Date.now();
        try {
          const result = originalFetch.apply(this, arguments);
          Promise.resolve(result).then(
            () => recordNetwork("fetch", method, url, startedAt),
            () => recordNetwork("fetch", method, url, startedAt)
          );
          return result;
        } catch (error) {
          recordNetwork("fetch", method, url, startedAt);
          throw error;
        }
      };
    }

    if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
      const originalOpen = window.XMLHttpRequest.prototype.open;
      const originalSend = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.open = function vidaXhrOpen(method, url) {
        this.__vidaHelperMethod = method || "GET";
        this.__vidaHelperUrl = url || "";
        return originalOpen.apply(this, arguments);
      };
      window.XMLHttpRequest.prototype.send = function vidaXhrSend() {
        const startedAt = Date.now();
        this.addEventListener("loadend", () => {
          recordNetwork("xhr", this.__vidaHelperMethod, this.__vidaHelperUrl, startedAt);
        });
        return originalSend.apply(this, arguments);
      };
    }
  }

  function scrubNetworkUrl(rawUrl) {
    try {
      const url = new URL(String(rawUrl), location.href);
      if (url.search) url.search = "?[query]";
      url.pathname = url.pathname.replace(/\/\d+(?=\/|$)/g, "/[id]");
      return url.toString();
    } catch (_error) {
      return String(rawUrl || "")
        .replace(/\?.*$/, "?[query]")
        .replace(/\/\d+(?=\/|$)/g, "/[id]");
    }
  }

  function getRecentNetwork() {
    const observed = Array.isArray(window[NETWORK_LOG_KEY]) ? window[NETWORK_LOG_KEY] : [];
    if (observed.length) return observed.slice(-30).reverse();

    return performance.getEntriesByType("resource")
      .filter((entry) => /fetch|xmlhttprequest/i.test(entry.initiatorType || ""))
      .filter((entry) => /vida\.hmg\.com(?::8081)?\/api/i.test(entry.name || ""))
      .slice(-30)
      .reverse()
      .map((entry) => ({
        time: "",
        type: entry.initiatorType || "resource",
        method: "",
        url: scrubNetworkUrl(entry.name),
      }));
  }

  function getVisibleControls() {
    return Array.from(document.querySelectorAll("button,a,input,select,textarea,ng-select,delete-icon,[role='button'],[role='tab'],[formcontrolname]"))
      .filter(visible)
      .slice(0, 250)
      .map((control) => ({
        tag: control.tagName.toLowerCase(),
        type: control.getAttribute("type") || "",
        name: control.getAttribute("name") || "",
        formControlName: control.getAttribute("formcontrolname") || "",
        placeholder: redact(control.getAttribute("placeholder") || ""),
        text: redact(textOf(control)),
      }));
  }

  function getPatientRows() {
    const tables = Array.from(document.querySelectorAll("table"));
    let rows = [];
    for (const table of tables) {
      const headers = Array.from(table.querySelectorAll("thead th, th")).map(textOf);
      const hasPatientHeaders = headers.some((h) => /patient\s*mrn/i.test(h)) || headers.some((h) => /^app\.?\s*info/i.test(h));
      if (!hasPatientHeaders) continue;
      rows = Array.from(table.querySelectorAll("tbody tr")).filter(visible);
      if (rows.length) break;
    }

    if (!rows.length) {
      rows = Array.from(document.querySelectorAll("tr"))
        .filter(visible)
        .filter((row) => /New Episode|Modify Episode|Return Visit/i.test(textOf(row)));
    }

    return rows.map((row, index) => {
      const cells = Array.from(row.querySelectorAll("td")).map((cell) => norm(cell.innerText || cell.textContent));
      const buttons = Array.from(row.querySelectorAll("button,a,[role='button']")).filter(visible).map(textOf).filter(Boolean);
      return {
        index: index + 1,
        mrn: redact(cells[0] || ""),
        name: redact(cells[1] || ""),
        genderAge: redact(cells[2] || ""),
        phone: redact(cells[3] || ""),
        appointmentInfo: redact(cells[4] || ""),
        actions: buttons,
      };
    });
  }

  function getDashboardSnapshot() {
    const rows = getPatientRows();
    return {
      helper: "VIDA Workflow Helper",
      version: VERSION,
      capturedAt: new Date().toISOString(),
      url: location.href.replace(/\d{6,}/g, "[number]"),
      title: redact(document.title),
      auth: getAuthSessionSummary(),
      recentNetwork: getRecentNetwork(),
      visibleControls: getVisibleControls(),
      page: {
        isDashboard: /\/dashboard/i.test(location.pathname),
        visibleRows: rows.length,
        newEpisodeButtons: findButtonsByText("New Episode").length,
        modifyEpisodeButtons: findButtonsByText("Modify Episode").length,
        returnVisitButtons: findButtonsByText("Return Visit").length,
        patientList: getPatientListSummary(),
      },
      rows,
    };
  }

  function getAuthSessionSummary() {
    const recentNetwork = getRecentNetwork();
    return {
      hasAccessToken: Boolean(localStorage.getItem("access_token")),
      hasRefreshToken: Boolean(localStorage.getItem("refresh_token")),
      hasMemberInfo: Boolean(localStorage.getItem("memberinfo")),
      refreshTokenRequests: recentNetwork.filter((item) => item.method === "POST" && /accounts\/refreshtoken/i.test(item.url)).length,
      modulePrivilegeChecks: recentNetwork.filter((item) => /accounts\/getmembermoduleprivilege/i.test(item.url)).length,
      accountApiCalls: recentNetwork.filter((item) => /\/api\/accounts\//i.test(item.url)).length,
    };
  }

  function getEncounterControls() {
    const labels = [
      "Review",
      "Health Summary",
      "Assessment",
      "Medical File",
      "Vitals",
      "Laboratory",
      "Diagnostic Result",
      "Lab Result",
      "Health Summary Report",
      "View more",
      "Subjective",
      "Chief Complaint",
      "Allergies",
      "Problem List",
      "History",
      "Objective",
      "Vital Signs",
      "Physical Examination",
      "Ophthalmic Examination",
      "Growth Chart",
      "Special Needs",
      "Pregnancy Progress Details",
      "Local Exam",
      "Specialized Assessment",
      "Genetic Screening",
      "VTE Antenatal",
      "VTE Postnatal",
      "Plan",
      "Orders",
      "Prescriptions",
      "Previous Prescriptions",
      "Progress Note",
      "Order Sheet",
      "Sick Leave",
      "Extend Sick Leave",
      "Companion Sick Leave",
      "Admission Request",
      "Patient Referral",
      "Care Plan",
      "Glasses Prescription",
      "Nursing Records",
      "Visual triage",
      "Pending Orders",
      "POC Result",
      "Refill",
      "GCS",
      "Fall Risk Assessment",
      "Task List",
      "MAR",
      "Patient Family Education",
    ];

    return labels.map((label) => ({
      label,
      count: findButtonsByText(label).length,
      present: findButtonsByText(label).length > 0,
    }));
  }

  function getFormControlMap() {
    return Array.from(document.querySelectorAll("input,select,textarea,[formcontrolname]"))
      .filter(visible)
      .map((control) => {
        const options = control.tagName.toLowerCase() === "select"
          ? Array.from(control.options || []).map((option) => norm(option.textContent)).filter(Boolean).slice(0, 20)
          : [];
        return {
          tag: control.tagName.toLowerCase(),
          type: control.getAttribute("type") || "",
          formControlName: control.getAttribute("formcontrolname") || "",
          placeholder: redact(control.getAttribute("placeholder") || ""),
          hasValue: Boolean(control.value),
          options,
        };
      })
      .filter((item) => item.formControlName || item.placeholder || item.options.length);
  }

  function getActiveModuleName() {
    const fields = new Set(getFormControlMap().map((item) => item.formControlName));
    const recentNetwork = getRecentNetwork();
    const hasEncounterShell = findButtonsByText("Review").length || findButtonsByText("Health Summary").length || findButtonsByText("Assessment").length;
    if (findButtonsByText("Continue to View Patient").length) return "Patient Access Prompt";
    if (
      /\/opd-details/i.test(location.pathname) &&
      !fields.size &&
      hasEncounterShell &&
      recentNetwork.some((item) => /medicalrecord\/EpisodeForRegularVisit|EncounterHealthRecord\/GetOPDEncounterDetails|EncounterHealthRecord\/GetRadiologyReportDetail/i.test(item.url))
    ) {
      return "Encounter Review / Loading";
    }
    if (fields.has("weightKg") || fields.has("temperatureCelcius") || fields.has("pulseBeatPerMinute")) return "Vitals";
    if (getChiefComplaintEditor()) return "Chief Complaint";
    if (fields.has("hopi")) return "History / HOPI";
    if (
      (fields.has("noOfDays") || fields.has("startDate")) &&
      (findExactElementsByText("Sick Leave").length || findExactElementsByText("Extend Sick Leave").length)
    ) {
      return "Sick Leave";
    }
    if (
      PRESCRIPTION_FIELD_NAMES.some((name) => fields.has(name)) &&
      (findExactElementsByText("Prescriptions").length ||
        findExactElementsByText("Orders").length ||
        findExactElementsByText("Prescription Instruction").length)
    ) {
      return "Orders / Prescriptions";
    }
    if (fields.has("currentMedication") || fields.has("drug") || fields.has("dose") || fields.has("frequency")) return "Current Medication";
    if (fields.has("icdCode10ID") || fields.has("diagnosisTypeID") || fields.has("conditionID") || fields.has("complexDiagnosis")) return "Assessment / Diagnosis";
    if (fields.has("chiefComplaint") || fields.has("chiefComplaintRemarks")) return "Chief Complaint";
    if (fields.has("painScore") || fields.has("bloodPressureHigher")) return "Vitals";
    if (
      fields.has("patientMRN") &&
      (fields.has("dateFrom") || fields.has("dateTo") || fields.has("clinic")) &&
      (findButtonsByText("Modify Episode").length || findButtonsByText("New Episode").length || findButtonsByText("Return Visit").length || getFieldsByName("clinic").length)
    ) {
      return "Patient List";
    }
    return /\/opd-details/i.test(location.pathname) ? "OPD Details" : "Dashboard";
  }

  function getPatientListSummary() {
    const recentNetwork = getRecentNetwork();
    return {
      patientListFields: PATIENT_LIST_FIELD_NAMES.filter((name) => getFieldsByName(name).length).length,
      patientMRNFields: getFieldsByName("patientMRN").length,
      dateFromFields: getFieldsByName("dateFrom").length,
      dateToFields: getFieldsByName("dateTo").length,
      clinicFields: getFieldsByName("clinic").length,
      visibleWithClinicalFields: hasVisibleClinicalFields(),
      visibleRows: getPatientRows().length,
      newEpisodeButtons: findButtonsByText("New Episode").length,
      modifyEpisodeButtons: findButtonsByText("Modify Episode").length,
      returnVisitButtons: findButtonsByText("Return Visit").length,
      okButtons: findExactElementsByText("Ok").length,
      continueToViewPatientButtons: findButtonsByText("Continue to View Patient").length,
      promptOverClinicalFields: Boolean(findButtonsByText("Continue to View Patient").length && hasVisibleClinicalFields()),
      patientArrivalQueries: recentNetwork.filter((item) => /medicalrecord\/patientarrivallist/i.test(item.url)).length,
      patientBannerQueries: recentNetwork.filter((item) => /patient\/patientbanner/i.test(item.url)).length,
      covidStatusQueries: recentNetwork.filter((item) => /patient\/GetIsPatientCovidPositive/i.test(item.url)).length,
      opdEncounterDetailQueries: recentNetwork.filter((item) => /EncounterHealthRecord\/GetOPDEncounterDetails/i.test(item.url)).length,
      encounterListQueries: recentNetwork.filter((item) => /EncounterHealthRecord\/GetEncounterList/i.test(item.url)).length,
      healthSummaryQueries: recentNetwork.filter((item) => /patient\/healthsummary/i.test(item.url)).length,
      vitalHistoryQueries: recentNetwork.filter((item) => /EncounterHealthRecord\/GetVitalHistory/i.test(item.url)).length,
      vitalSignQueries: recentNetwork.filter((item) => /medicalrecord\/vitalsign/i.test(item.url)).length,
      labResultQueries: recentNetwork.filter((item) => /EncounterHealthRecord\/GetEncounterLabResults|patient\/labresults/i.test(item.url)).length,
      radiologyHistoryQueries: recentNetwork.filter((item) => /EncounterHealthRecord\/GetRadHistory/i.test(item.url)).length,
    };
  }

  function getEncounterLoadSummary() {
    const recentNetwork = getRecentNetwork();
    return {
      regularVisitCreates: recentNetwork.filter((item) => item.method === "POST" && /medicalrecord\/EpisodeForRegularVisit/i.test(item.url)).length,
      opdEncounterDetailQueries: recentNetwork.filter((item) => /EncounterHealthRecord\/GetOPDEncounterDetails/i.test(item.url)).length,
      encounterListQueries: recentNetwork.filter((item) => /EncounterHealthRecord\/GetEncounterList/i.test(item.url)).length,
      episodeQueries: recentNetwork.filter((item) => item.method === "GET" && /medicalrecord\/episode/i.test(item.url)).length,
      dischargeSummaryQueries: recentNetwork.filter((item) => /medicalrecord\/DischargeSummary/i.test(item.url)).length,
      doctorCustomizationQueries: recentNetwork.filter((item) => /Master\/DoctorCustomization/i.test(item.url)).length,
      patientBannerQueries: recentNetwork.filter((item) => /patient\/patientbanner/i.test(item.url)).length,
      healthSummaryQueries: recentNetwork.filter((item) => /patient\/healthsummary/i.test(item.url)).length,
      vitalHistoryQueries: recentNetwork.filter((item) => /EncounterHealthRecord\/GetVitalHistory/i.test(item.url)).length,
      vitalSignQueries: recentNetwork.filter((item) => /medicalrecord\/vitalsign/i.test(item.url)).length,
      labResultQueries: recentNetwork.filter((item) => /EncounterHealthRecord\/GetEncounterLabResults|patient\/labresults/i.test(item.url)).length,
      radiologyHistoryQueries: recentNetwork.filter((item) => /EncounterHealthRecord\/GetRadHistory/i.test(item.url)).length,
      radiologyReportDetailQueries: recentNetwork.filter((item) => /EncounterHealthRecord\/GetRadiologyReportDetail/i.test(item.url)).length,
    };
  }

  function getVitalsSummary() {
    const recentNetwork = getRecentNetwork();
    return {
      vitalsFields: VITALS_FIELD_NAMES.filter((name) => getFieldsByName(name).length).length,
      requiredToggleFields: getFieldsByName("isVitalsRequired").length,
      weightFields: getFieldsByName("weightKg").length + getFieldsByName("weightLbs").length + getFieldsByName("weightoz").length,
      heightFields: getFieldsByName("heightCm").length + getFieldsByName("heightInch").length,
      temperatureFields: getFieldsByName("temperatureCelcius").length + getFieldsByName("temperatureF").length,
      pulseFields: getFieldsByName("pulseBeatPerMinute").length,
      respirationFields: getFieldsByName("respirationBeatPerMinute").length,
      oxygenFields: getFieldsByName("sao2").length + getFieldsByName("fio2").length,
      bloodPressureFields: getFieldsByName("bloodPressureHigher").length + getFieldsByName("bloodPressureLower").length,
      painFields: getFieldsByName("painScore").length + getFieldsByName("painScale").length,
      vitalSignQueries: recentNetwork.filter((item) => /medicalrecord\/vitalsign/i.test(item.url)).length,
      vitalHistoryQueries: recentNetwork.filter((item) => /EncounterHealthRecord\/GetVitalHistory/i.test(item.url)).length,
      modulePrivilegeChecks: recentNetwork.filter((item) => /accounts\/getmembermoduleprivilege/i.test(item.url)).length,
      patientFamilyQueries: recentNetwork.filter((item) => /medicalrecord\/Patientfamily/i.test(item.url)).length,
      masterDataQueries: recentNetwork.filter((item) => /master\/data/i.test(item.url)).length,
      saveButtons: findButtonsByText("Save").length,
    };
  }

  function getChiefComplaintSummary() {
    const recentNetwork = getRecentNetwork();
    return {
      historyFields: HISTORY_FIELD_NAMES.filter((name) => getFieldsByName(name).length).length,
      hopiFields: getFieldsByName("hopi").length,
      currentMedicationFields: ["drug", "dose", "strength", "route", "frequency", "currentMedication"].filter((name) => getFieldsByName(name).length).length,
      numberOfWeeksFields: getFieldsByName("numberOfWeeks").length,
      currentMedicationSections: findExactElementsByText("Current Medication").length,
      previousChiefComplaintControls: findButtonsByText("Previous Chief Complaint").length,
      templateControls: findButtonsByText("Template").length,
      auditTrailButtons: findButtonsByText("Audit Trail").length,
      addButtons: findExactElementsByText("Add").length,
      cancelButtons: findExactElementsByText("Cancel").length,
      saveButtons: findButtonsByText("Save").length,
      chiefComplaintQueries: recentNetwork.filter((item) => item.method === "GET" && /medicalrecord\/chiefcomplaint/i.test(item.url)).length,
      chiefComplaintCreates: recentNetwork.filter((item) => item.method === "POST" && /medicalrecord\/chiefcomplaint$/i.test(item.url)).length,
      chiefComplaintUpdates: recentNetwork.filter((item) => item.method === "PUT" && /medicalrecord\/chiefcomplaint$/i.test(item.url)).length,
      templateQueries: recentNetwork.filter((item) => /medicalrecord\/ChiefComplaintTemplate/i.test(item.url)).length,
      favoriteTemplateQueries: recentNetwork.filter((item) => /medicalrecord\/ChiefComplaintFavTemplate/i.test(item.url)).length,
      addendumQueries: recentNetwork.filter((item) => /medicalrecord\/addendum/i.test(item.url)).length,
      carePlanQueries: recentNetwork.filter((item) => /medicalrecord\/CarePlan/i.test(item.url)).length,
      referralClinicQueries: recentNetwork.filter((item) => /medicalrecord\/referralclinics/i.test(item.url)).length,
      geneticScreeningQueries: recentNetwork.filter((item) => /medicalrecord\/geneticscreening/i.test(item.url)).length,
      vteAntenatalQueries: recentNetwork.filter((item) => /VTEAntenatal\//i.test(item.url)).length,
    };
  }

  function getAssessmentDiagnosisSummary() {
    const recentNetwork = getRecentNetwork();
    return {
      assessmentFields: ASSESSMENT_FIELD_NAMES.filter((name) => getFieldsByName(name).length).length,
      icdFields: getFieldsByName("icdCode10ID").length,
      descriptionFields: getFieldsByName("ascii_Desc").length,
      conditionFields: getFieldsByName("conditionID").length,
      diagnosisTypeFields: getFieldsByName("diagnosisTypeID").length,
      complexDiagnosisFields: getFieldsByName("complexDiagnosis").length,
      remarksFields: getFieldsByName("remarks").length,
      icdControls: findButtonsByText("ICD").length,
      resetButtons: findExactElementsByText("Reset").length,
      addButtons: findExactElementsByText("Add").length,
      saveButtons: findButtonsByText("Save").length,
      assessmentQueries: recentNetwork.filter((item) => item.method === "GET" && /medicalrecord\/Assessment/i.test(item.url)).length,
      assessmentCreates: recentNetwork.filter((item) => item.method === "POST" && /medicalrecord\/Assessment$/i.test(item.url)).length,
      principalDiagnosisCoverageChecks: recentNetwork.filter((item) => /medicalrecord\/isprincipaldiagnosiscovered/i.test(item.url)).length,
      morphologyChecks: recentNetwork.filter((item) => /medicalrecord\/checkismorphology/i.test(item.url)).length,
    };
  }

  function getOrdersPrescriptionSummary() {
    const recentNetwork = getRecentNetwork();
    return {
      ordersTabs: findExactElementsByText("Orders").length,
      prescriptionTabs: findExactElementsByText("Prescriptions").length,
      itemFields: Array.from(document.querySelectorAll('[formcontrolname="item"]')).filter(visible).length,
      searchFavoriteFields: getPlaceholderControls("Search Favorite").length,
      searchPrescriptionFields: getPlaceholderControls("Search for Prescriptions").length,
      searchFields: getPlaceholderControls("Search").length,
      previousPrescriptionControls: uniqueElements([
        ...findButtonsByText("Previous Prescriptions"),
        ...findExactElementsByText("Previous Prescriptions"),
      ]).length,
      refillButtons: findButtonsByText("Refill").length,
      deleteControls: getDeleteControls().length,
      prescriptionEntryFields: PRESCRIPTION_FIELD_NAMES.filter((name) => getFieldsByName(name).length).length,
      addButtons: findExactElementsByText("Add").length,
      closeButtons: findExactElementsByText("Close").length,
      continueButtons: findExactElementsByText("Continue").length,
      cancelButtons: findExactElementsByText("Cancel").length,
      medispanChecks: recentNetwork.filter((item) => /medicalrecord\/medispan/i.test(item.url)).length,
      medicationQueries: recentNetwork.filter((item) => /medicalrecord\/medications/i.test(item.url)).length,
      itemDetailQueries: recentNetwork.filter((item) => /medicalrecord\/GetItemsById/i.test(item.url)).length,
      itemDiseaseQueries: recentNetwork.filter((item) => /inpatient\/prescription\/geticd10diseaseforitemid/i.test(item.url)).length,
      orderCreatedChecks: recentNetwork.filter((item) => /medicalrecord\/ispresecriptionorordercreated/i.test(item.url)).length,
      prescriptionCreates: recentNetwork.filter((item) => item.method === "POST" && /medicalrecord\/prescription$/i.test(item.url)).length,
      prescriptionQueries: recentNetwork.filter((item) => item.method === "GET" && /medicalrecord\/Prescription/i.test(item.url)).length,
      approvalStatusQueries: recentNetwork.filter((item) => /medicalrecord\/ProceduresApprovalStatus/i.test(item.url)).length,
      managerRequestChecks: recentNetwork.filter((item) => /medicalrecord\/isenablemanagerxrequest/i.test(item.url)).length,
      procedureCategoryQueries: recentNetwork.filter((item) => /medicalrecord\/procedurescategories/i.test(item.url)).length,
      keywordQueries: recentNetwork.filter((item) => /medicalrecord\/keyword/i.test(item.url)).length,
      saveButtons: findButtonsByText("Save").length,
      uppercaseSaveButtons: findExactElementsByText("SAVE").length,
      refreshButtons: findButtonsByText("Refresh").length,
    };
  }

  function getSickLeaveSummary() {
    const recentNetwork = getRecentNetwork();
    return {
      sickLeaveControls: findExactElementsByText("Sick Leave").length,
      extendSickLeaveControls: findExactElementsByText("Extend Sick Leave").length,
      sickLeaveFields: SICK_LEAVE_FIELD_NAMES.filter((name) => getFieldsByName(name).length).length,
      noOfDaysFields: getFieldsByName("noOfDays").length,
      startDateFields: getFieldsByName("startDate").length,
      remarksFields: getFieldsByName("remarks").length,
      sickLeaveCreates: recentNetwork.filter((item) => item.method === "POST" && /medicalrecord\/sickleave$/i.test(item.url)).length,
      sickLeaveQueries: recentNetwork.filter((item) => item.method === "GET" && /medicalrecord\/GetAllSickLeaves/i.test(item.url)).length,
      sickLeaveStatistics: recentNetwork.filter((item) => /medicalrecord\/presickleavestatistics/i.test(item.url)).length,
      saveButtons: findButtonsByText("Save").length,
    };
  }

  function getPageSnapshot() {
    if (/\/opd-details/i.test(location.pathname)) {
      return {
        helper: "VIDA Workflow Helper",
        version: VERSION,
        capturedAt: new Date().toISOString(),
        url: location.href.replace(/\d{6,}/g, "[number]"),
        title: redact(document.title),
        auth: getAuthSessionSummary(),
        recentNetwork: getRecentNetwork(),
        visibleControls: getVisibleControls(),
        page: {
          type: "opd-details",
          activeModule: getActiveModuleName(),
          controls: getEncounterControls(),
          formControls: getFormControlMap(),
          patientList: getPatientListSummary(),
          encounterLoad: getEncounterLoadSummary(),
          vitals: getVitalsSummary(),
          chiefComplaint: getChiefComplaintSummary(),
          assessmentDiagnosis: getAssessmentDiagnosisSummary(),
          ordersPrescription: getOrdersPrescriptionSummary(),
          sickLeave: getSickLeaveSummary(),
        },
      };
    }

    return getDashboardSnapshot();
  }

  function copy(text) {
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text, "text");
      return Promise.resolve();
    }
    return navigator.clipboard.writeText(text);
  }

  function setStatus(message) {
    const el = document.querySelector(`#${PANEL_ID} .vida-status`);
    if (el) el.textContent = message;
  }

  function copySnapshot() {
    const snapshot = getPageSnapshot();
    copy(JSON.stringify(snapshot, null, 2))
      .then(() => setStatus(/\/opd-details/i.test(location.pathname) ? "Copied OPD details snapshot" : `Copied ${snapshot.page.visibleRows} rows`))
      .catch((error) => {
        console.log("VIDA Workflow Snapshot", snapshot);
        setStatus(`Copy failed: ${error && error.message || error}`);
      });
  }

  function clickRefresh() {
    const refresh = findFirstButtonByText("Refresh") || Array.from(document.querySelectorAll("a,button")).find((el) => /refresh/i.test(textOf(el)));
    if (refresh) {
      refresh.click();
      setStatus("Refresh clicked");
    } else {
      setStatus("Refresh button not found");
    }
  }

  function setPageSize100() {
    const selects = Array.from(document.querySelectorAll("select")).filter(visible);
    const pageSize = selects.find((select) => Array.from(select.options || []).some((option) => option.value === "100" || textOf(option) === "100"));
    if (!pageSize) {
      setStatus("Page size select not found");
      return;
    }
    pageSize.value = Array.from(pageSize.options).find((option) => option.value === "100" || textOf(option) === "100").value;
    pageSize.dispatchEvent(new Event("change", { bubbles: true }));
    setStatus("Page size set to 100");
  }

  function focusElement(el, label) {
    if (!el) {
      setStatus(`${label} not found`);
      return false;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    if (typeof el.focus === "function") el.focus({ preventScroll: true });
    el.style.outline = "4px solid #2563eb";
    el.style.outlineOffset = "3px";
    el.title = `VIDA helper focus: ${label}`;
    setStatus(`Focused ${label}`);
    return true;
  }

  function getFirstFieldByNames(names) {
    for (const name of names) {
      const field = getFieldsByName(name)[0];
      if (field) return field;
    }
    return null;
  }

  function getQuickTexts() {
    let parsed = [];
    try {
      parsed = JSON.parse(getQuickTextStorageRaw());
    } catch (_error) {
      parsed = [];
    }

    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item && item.id || ""),
        name: norm(item && item.name || "").slice(0, 60),
        text: String(item && item.text || "").slice(0, 4000),
        trigger: normalizeTrigger(item && item.trigger),
        scope: normalizeQuickTextScope(item && item.scope),
      }))
      .filter((item) => item.id && item.name && item.text);
  }

  function setQuickTexts(items) {
    setQuickTextStorageRaw(JSON.stringify(items.slice(0, 40)));
    buildTriggerIndex();
    refreshQuickTextSelect();
  }

  function getQuickTextStorageRaw() {
    if (typeof GM_getValue === "function") return GM_getValue(QUICK_TEXT_KEY, "[]");
    return localStorage.getItem(QUICK_TEXT_KEY) || "[]";
  }

  function setQuickTextStorageRaw(value) {
    if (typeof GM_setValue === "function") {
      GM_setValue(QUICK_TEXT_KEY, value);
      return;
    }
    localStorage.setItem(QUICK_TEXT_KEY, value);
  }

  function getFieldName(el) {
    if (isChiefComplaintEditor(el)) return "chiefComplaintRichText";
    return String(el && (el.getAttribute("formcontrolname") || el.getAttribute("name") || "") || "");
  }

  function getFrameDocument(frame) {
    try {
      return frame && frame.contentDocument && frame.contentDocument.body ? frame.contentDocument : null;
    } catch (_error) {
      return null;
    }
  }

  function getRichEditorBody(el) {
    if (!el) return null;
    const tag = String(el.tagName || "").toLowerCase();
    if (tag === "iframe") {
      const doc = getFrameDocument(el);
      return doc && doc.body ? doc.body : null;
    }
    const iframe = el.querySelector && el.querySelector("iframe");
    if (iframe) {
      const doc = getFrameDocument(iframe);
      if (doc && doc.body) return doc.body;
    }
    if (el.isContentEditable) return el;
    const editable = el.querySelector && el.querySelector("[contenteditable='true'], .note-editable, .ql-editor, .ck-editor__editable, .fr-element");
    return editable || null;
  }

  function isSameOriginFrame(frame) {
    if (!frame || String(frame.tagName || "").toLowerCase() !== "iframe") return false;
    const src = frame.getAttribute("src") || "";
    if (src) {
      try {
        const url = new URL(src, location.href);
        if (url.origin !== location.origin && url.protocol !== "about:") return false;
      } catch (_error) {
        return false;
      }
    }
    return Boolean(getFrameDocument(frame));
  }

  function isRichEditorElement(el) {
    if (!el || !visible(el)) return false;
    if (el.isContentEditable) return true;
    const tag = String(el.tagName || "").toLowerCase();
    if (tag === "iframe") return isSameOriginFrame(el);
    if (el.matches && el.matches(".tox-tinymce,.mce-tinymce,.e-richtexteditor,.e-rte-content,.note-editor,.note-editable,.ql-editor,.ck-editor__editable,.fr-element")) {
      return Boolean(getRichEditorBody(el));
    }
    return false;
  }

  function getRichTextEditors() {
    return uniqueElements(
      RICH_EDITOR_SELECTORS.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    ).filter(isRichEditorElement);
  }

  function getChiefComplaintEditor() {
    const editors = getRichTextEditors();
    if (!editors.length) return null;

    const labelled = editors.find((editor) => {
      let current = editor;
      for (let depth = 0; current && depth < 5; depth += 1) {
        if (/chief\s*complaints?/i.test(textOf(current))) return true;
        current = current.parentElement;
      }
      return false;
    });
    return labelled || editors[0] || null;
  }

  function isChiefComplaintEditor(el) {
    if (!el) return false;
    const editor = getChiefComplaintEditor();
    return Boolean(editor && (editor === el || editor.contains(el) || el.contains(editor)));
  }

  function normalizeQuickTextScope(raw) {
    const value = norm(raw);
    return QUICK_TEXT_MODULE_SCOPES.includes(value) ? value : "";
  }

  function getPreferredQuickTextFieldsForModule(module) {
    if (module === "Chief Complaint") return ["chiefComplaintRichText", "chiefComplaintRemarks", "hopi"];
    if (module === "History / HOPI") return ["hopi", "currentMedication", "chiefComplaintRemarks"];
    if (module === "Current Medication") return ["currentMedication", "hopi"];
    if (module === "Orders / Prescriptions") return ["prescriptionInstruction"];
    if (module === "Assessment / Diagnosis") return ["remarks"];
    if (module === "Sick Leave") return ["remarks"];
    return [];
  }

  function getQuickTextScopeForTarget(el) {
    const activeModule = getActiveModuleName();
    const name = getFieldName(el);
    if (isChiefComplaintEditor(el) || name === "chiefComplaintRichText") return "Chief Complaint";
    if (name === "hopi") return "History / HOPI";
    if (name === "currentMedication") return "Current Medication";
    if (name === "chiefComplaintRemarks") return "Chief Complaint";
    if (name === "prescriptionInstruction") return "Orders / Prescriptions";
    if (name === "remarks" && (activeModule === "Assessment / Diagnosis" || activeModule === "Sick Leave")) return activeModule;
    return normalizeQuickTextScope(activeModule);
  }

  function describeQuickTextTarget(el) {
    if (isChiefComplaintEditor(el)) return "Chief Complaints editor";
    return getFieldName(el) || getQuickTextScopeForTarget(el) || "free-text field";
  }

  function isForegroundElement(el) {
    if (!el || typeof document.elementsFromPoint !== "function") return true;
    const rect = el.getBoundingClientRect();
    const points = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + Math.min(8, Math.max(1, rect.width / 3)), rect.top + Math.min(8, Math.max(1, rect.height / 3))],
      [rect.right - Math.min(8, Math.max(1, rect.width / 3)), rect.bottom - Math.min(8, Math.max(1, rect.height / 3))],
    ];

    return points.some(([x, y]) => {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
      return document.elementsFromPoint(x, y).some((node) => node === el || el.contains(node));
    });
  }

  function isQuickTextTarget(el) {
    if (!el || !visible(el)) return false;
    if (isRichEditorElement(el)) return true;
    if (el.disabled || el.readOnly) return false;
    if (el.isContentEditable) return true;
    const tag = String(el.tagName || "").toLowerCase();
    const type = String(el.getAttribute("type") || "text").toLowerCase();
    const name = getFieldName(el);
    if (tag === "textarea") return !name || QUICK_TEXT_FIELD_NAMES.includes(name);
    if (tag !== "input") return false;
    if (!["", "text", "search"].includes(type)) return false;
    if (QUICK_TEXT_FIELD_NAMES.includes(name)) return true;
    const label = `${el.getAttribute("placeholder") || ""} ${name}`.toLowerCase();
    return /\b(remark|instruction|complaint|history|note)\b/i.test(label);
  }

  function getQuickTextTarget() {
    const activeModule = getActiveModuleName();
    const activeScope = normalizeQuickTextScope(activeModule);
    if (isQuickTextTarget(document.activeElement) && isForegroundElement(document.activeElement)) return document.activeElement;

    const preferred = getPreferredQuickTextFieldsForModule(activeModule);
    const namedTarget = preferred.includes("chiefComplaintRichText")
      ? getChiefComplaintEditor() || getFirstFieldByNames(preferred.filter((name) => name !== "chiefComplaintRichText"))
      : getFirstFieldByNames(preferred);
    if (isQuickTextTarget(namedTarget) && isForegroundElement(namedTarget)) return namedTarget;

    if (
      lastQuickTextField &&
      document.contains(lastQuickTextField) &&
      isQuickTextTarget(lastQuickTextField) &&
      isForegroundElement(lastQuickTextField) &&
      (!activeScope || getQuickTextScopeForTarget(lastQuickTextField) === activeScope)
    ) {
      return lastQuickTextField;
    }

    return Array.from(document.querySelectorAll("textarea,input,[contenteditable='true']"))
      .filter((field) => isQuickTextTarget(field) && isForegroundElement(field))[0] || null;
  }

  function getEditableText(el) {
    if (!el) return "";
    const richBody = getRichEditorBody(el);
    if (richBody && richBody !== el) return richBody.innerText || richBody.textContent || "";
    if (el.isContentEditable) return el.innerText || el.textContent || "";
    return String(el.value || "");
  }

  function setNativeValue(el, value) {
    const tag = String(el && el.tagName || "").toLowerCase();
    if (tag !== "input" && tag !== "textarea") {
      el.textContent = value;
      return;
    }

    const prototype = tag === "textarea" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) descriptor.set.call(el, value);
    else el.value = value;
  }

  function dispatchTextEvents(el, text) {
    try {
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text,
      }));
    } catch (_error) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function appendTextToRichEditorBody(body, text) {
    const doc = body.ownerDocument || document;
    if (norm(body.innerText || body.textContent)) body.appendChild(doc.createElement("br"));
    String(text || "").split(/\r?\n/).forEach((line, index) => {
      if (index > 0) body.appendChild(doc.createElement("br"));
      body.appendChild(doc.createTextNode(line));
    });
  }

  function insertTextIntoRichEditor(el, text) {
    const body = getRichEditorBody(el);
    if (!body) return false;
    const doc = body.ownerDocument || document;
    const win = doc.defaultView || window;
    if (typeof el.focus === "function") el.focus({ preventScroll: true });
    if (typeof win.focus === "function") win.focus();
    if (typeof body.focus === "function") body.focus({ preventScroll: true });

    const selection = win.getSelection && win.getSelection();
    const hasEditorSelection = selection && selection.rangeCount && body.contains(selection.anchorNode);
    if (hasEditorSelection && typeof doc.execCommand === "function") {
      doc.execCommand("insertText", false, text);
    } else {
      appendTextToRichEditorBody(body, text);
    }

    dispatchTextEvents(body, text);
    if (body !== el) dispatchTextEvents(el, text);
    return true;
  }

  function insertTextIntoField(el, text) {
    if (!el || !text) return false;
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    if (typeof el.focus === "function") el.focus({ preventScroll: true });

    if (isRichEditorElement(el)) return insertTextIntoRichEditor(el, text);

    if (el.isContentEditable) {
      const selection = window.getSelection && window.getSelection();
      if (selection && selection.rangeCount && el.contains(selection.anchorNode)) {
        document.execCommand("insertText", false, text);
      } else {
        const current = getEditableText(el).trim();
        el.textContent = current ? `${current}\n${text}` : text;
      }
      dispatchTextEvents(el, text);
      return true;
    }

    const current = getEditableText(el);
    const start = typeof el.selectionStart === "number" ? el.selectionStart : current.length;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : current.length;
    const separator = start === current.length && current.trim() ? "\n" : "";
    const next = `${current.slice(0, start)}${separator}${text}${current.slice(end)}`;
    setNativeValue(el, next);
    const cursor = start + separator.length + text.length;
    if (typeof el.setSelectionRange === "function") el.setSelectionRange(cursor, cursor);
    dispatchTextEvents(el, text);
    return true;
  }

  function refreshQuickTextSelect(panel) {
    const root = panel || document.getElementById(PANEL_ID);
    if (!root) return;
    const select = root.querySelector(".vida-template-select");
    if (!select) return;

    const selected = select.value;
    select.innerHTML = "";
    const items = getQuickTexts();
    if (!items.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No saved text";
      select.appendChild(option);
      select.disabled = true;
      refreshQuickTextPickList(root);
      return;
    }

    select.disabled = false;
    for (const item of items) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.trigger ? `${item.name}  ${item.trigger}` : item.name;
      select.appendChild(option);
    }
    if (items.some((item) => item.id === selected)) select.value = selected;
    refreshQuickTextPickList(root);
  }

  function refreshQuickTextPickList(panel) {
    const root = panel || document.getElementById(PANEL_ID);
    if (!root) return;
    const list = root.querySelector(".vida-pick-list");
    if (!list) return;

    list.innerHTML = "";
    const items = getQuickTexts();
    if (!items.length) {
      const hint = document.createElement("div");
      hint.className = "vida-pick-empty";
      hint.textContent = "No saved text yet. Use Save Field to add one.";
      list.appendChild(hint);
      return;
    }

    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vida-pick-item";
      button.textContent = item.trigger ? `${item.name}  (${item.trigger})` : item.name;
      // Keep focus in the clinical field when tapping (toolbar trick), so insert lands at the caret.
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("click", () => insertQuickTextById(item.id));
      list.appendChild(button);
    }
  }

  function getSelectedQuickText() {
    const select = document.querySelector(`#${PANEL_ID} .vida-template-select`);
    const id = select && select.value;
    return getQuickTexts().find((item) => item.id === id) || null;
  }

  function focusQuickTextTarget() {
    const target = getQuickTextTarget();
    if (!target) {
      setStatus("No safe free-text field found");
      return false;
    }
    return focusElement(target, getFieldName(target) || "free-text field");
  }

  function insertQuickTextItem(item) {
    if (!item) {
      setStatus("Save a text template first");
      return;
    }

    const target = getQuickTextTarget();
    if (!target) {
      setStatus("Tap a free-text field first");
      return;
    }

    insertTextIntoField(target, item.text);
    flashFieldOutline(target);
    setStatus(`Inserted "${item.name}" into ${describeQuickTextTarget(target)}; review before saving`);
  }

  function insertQuickText() {
    insertQuickTextItem(getSelectedQuickText());
  }

  function insertQuickTextById(id) {
    insertQuickTextItem(getQuickTexts().find((item) => item.id === String(id)) || null);
  }

  function saveCurrentFieldAsQuickText() {
    const target = getQuickTextTarget();
    if (!target) {
      setStatus("Click a free-text field with text first");
      return;
    }

    const text = getEditableText(target).trim();
    if (!text) {
      setStatus("Current field is empty");
      return;
    }

    if (redact(text) !== text) {
      const ok = window.confirm("This text may contain patient identifiers. Save it as a reusable template anyway?");
      if (!ok) {
        setStatus("Template not saved");
        return;
      }
    }

    const defaultName = getFieldName(target) || "Quick text";
    const name = norm(window.prompt("Template name. Do not include patient identifiers.", defaultName) || "").slice(0, 60);
    if (!name) {
      setStatus("Template name cancelled");
      return;
    }

    const trigger = normalizeTrigger(window.prompt(
      `Optional quick code to expand this text while typing (start with "${QUICK_TEXT_TRIGGER_SIGIL}", e.g. ${QUICK_TEXT_TRIGGER_SIGIL}htn). Leave blank for none.`,
      ""
    ));

    const scope = getQuickTextScopeForTarget(target);
    const existingItems = getQuickTexts();
    const existing = existingItems.find((item) => item.name.toLowerCase() === name.toLowerCase());
    let items = existingItems.filter((item) => item.name.toLowerCase() !== name.toLowerCase());
    let reassigned = "";
    if (trigger) {
      items = items.map((item) => {
        if (item.trigger === trigger && item.scope === scope) {
          reassigned = item.name;
          return Object.assign({}, item, { trigger: "" });
        }
        return item;
      });
    }
    const savedItem = {
      id: existing ? existing.id : String(Date.now()),
      name,
      text: text.slice(0, 4000),
      trigger,
      scope,
    };
    items.unshift(savedItem);
    setQuickTexts(items);

    const select = document.querySelector(`#${PANEL_ID} .vida-template-select`);
    if (select) select.value = savedItem.id;
    const scopeText = scope ? ` for ${scope}` : "";
    if (trigger && reassigned) setStatus(`Saved "${name}"${scopeText}; code ${trigger} moved here from "${reassigned}"`);
    else if (trigger) setStatus(`Saved "${name}" with code ${trigger}${scopeText}`);
    else setStatus(`Saved "${name}"${scopeText}`);
  }

  function deleteSelectedQuickText() {
    const item = getSelectedQuickText();
    if (!item) {
      setStatus("No saved text selected");
      return;
    }

    const ok = window.confirm(`Delete "${item.name}"?`);
    if (!ok) return;
    setQuickTexts(getQuickTexts().filter((current) => current.id !== item.id));
    removeModuleDefaultsForQuickTextId(item.id);
    setStatus(`Deleted "${item.name}"`);
  }

  function normalizeTrigger(raw) {
    const value = String(raw || "").trim().toLowerCase();
    if (!value) return "";
    const body = value.replace(/^\/+/, "").replace(/[^a-z0-9]/g, "");
    if (!body) return "";
    return `${QUICK_TEXT_TRIGGER_SIGIL}${body}`.slice(0, MAX_TRIGGER_LENGTH);
  }

  function buildTriggerIndex() {
    quickTextTriggerIndex = new Map();
    for (const item of getQuickTexts()) {
      if (item.trigger) {
        const matches = quickTextTriggerIndex.get(item.trigger) || [];
        matches.push(item);
        quickTextTriggerIndex.set(item.trigger, matches);
      }
    }
  }

  function getQuickTextForTrigger(trigger, scope) {
    const matches = quickTextTriggerIndex.get(trigger) || [];
    return matches.find((item) => item.scope && item.scope === scope) || matches.find((item) => !item.scope) || null;
  }

  function expansionPhraseFor(el, text) {
    const tag = String(el && el.tagName || "").toLowerCase();
    if (tag === "input") return String(text || "").replace(/[\r\n]+/g, " ");
    return String(text || "");
  }

  function handleExpansionInput(event) {
    if (expansionInProgress) return;
    if (!quickTextTriggerIndex.size) return;
    if (event.isComposing) return;

    const data = event.data;
    const isTerminatorInput =
      (typeof data === "string" && data.length === 1 && /[\s.,;:!?]/.test(data)) ||
      event.inputType === "insertLineBreak" ||
      event.inputType === "insertParagraph";
    if (!isTerminatorInput) return;

    const el = event.target;
    if (!el || el.isContentEditable) return;
    if (!isQuickTextTarget(el)) return;
    if (typeof el.selectionStart !== "number") return;

    const caret = el.selectionStart;
    const value = getEditableText(el);
    const beforeCaret = value.slice(0, caret);
    if (!/[\s.,;:!?]$/.test(beforeCaret)) return;

    const beforeTerminator = beforeCaret.slice(0, -1);
    const slashIndex = beforeTerminator.lastIndexOf(QUICK_TEXT_TRIGGER_SIGIL);
    if (slashIndex < 0) return;
    if (slashIndex > 0 && !/[\s.,;:!?(){}\[\]]/.test(beforeTerminator[slashIndex - 1])) return;

    const token = beforeTerminator.slice(slashIndex).toLowerCase();
    if (token.length < 2 || token.length > MAX_TRIGGER_LENGTH) return;
    const scope = getQuickTextScopeForTarget(el);
    const item = getQuickTextForTrigger(token, scope);
    if (!item) return;

    const phrase = expansionPhraseFor(el, item.text);
    const terminatorAndRest = value.slice(caret - 1);
    const nextValue = `${value.slice(0, slashIndex)}${phrase}${terminatorAndRest}`;
    const nextCaret = slashIndex + phrase.length + 1;

    expansionInProgress = true;
    try {
      setNativeValue(el, nextValue);
      if (typeof el.setSelectionRange === "function") el.setSelectionRange(nextCaret, nextCaret);
      dispatchTextEvents(el, phrase);
    } finally {
      expansionInProgress = false;
    }

    lastExpansion = {
      el,
      previousValue: value,
      previousCaret: caret,
      resultValue: nextValue,
      trigger: token,
    };
    flashFieldOutline(el);
    setStatus(`Expanded "${token}" into ${describeQuickTextTarget(el)}; Alt+Shift+Z to undo`);
  }

  function flashFieldOutline(el) {
    if (!el || !el.style) return;
    if (el.__vidaOutlineTimer) clearTimeout(el.__vidaOutlineTimer);
    el.style.outline = "3px solid #2563eb";
    el.style.outlineOffset = "2px";
    el.__vidaOutlineTimer = setTimeout(() => {
      el.__vidaOutlineTimer = null;
      if (!el || !el.style) return;
      el.style.outline = "";
      el.style.outlineOffset = "";
    }, 1500);
  }

  function undoLastExpansion() {
    const last = lastExpansion;
    if (!last || !last.el || !document.contains(last.el)) {
      setStatus("Nothing to undo");
      return;
    }
    const el = last.el;
    if (getEditableText(el) !== last.resultValue) {
      lastExpansion = null;
      setStatus("Cannot undo: text changed since expansion");
      return;
    }
    if (typeof el.focus === "function") el.focus({ preventScroll: true });
    expansionInProgress = true;
    try {
      setNativeValue(el, last.previousValue);
      if (typeof el.setSelectionRange === "function") el.setSelectionRange(last.previousCaret, last.previousCaret);
      dispatchTextEvents(el, last.trigger);
    } finally {
      expansionInProgress = false;
    }
    lastExpansion = null;
    setStatus("Expansion undone");
  }

  function trackQuickTextFocus(event) {
    const el = event && event.target;
    if (isQuickTextTarget(el)) lastQuickTextField = el;
  }

  function installExpansion() {
    if (window[EXPANSION_INSTALLED_KEY]) return;
    window[EXPANSION_INSTALLED_KEY] = true;
    buildTriggerIndex();
    document.addEventListener("input", handleExpansionInput, true);
    document.addEventListener("focusin", trackQuickTextFocus, true);
  }

  function getModuleDefaultsRaw() {
    if (typeof GM_getValue === "function") return GM_getValue(MODULE_DEFAULT_KEY, "{}");
    return localStorage.getItem(MODULE_DEFAULT_KEY) || "{}";
  }

  function setModuleDefaultsRaw(value) {
    if (typeof GM_setValue === "function") {
      GM_setValue(MODULE_DEFAULT_KEY, value);
      return;
    }
    localStorage.setItem(MODULE_DEFAULT_KEY, value);
  }

  function getModuleDefaults() {
    let parsed = {};
    try {
      parsed = JSON.parse(getModuleDefaultsRaw());
    } catch (_error) {
      parsed = {};
    }
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }

  function getModuleDefaultId(module) {
    return String(getModuleDefaults()[module] || "");
  }

  function setModuleDefault(module, id) {
    const map = getModuleDefaults();
    if (id) map[module] = id;
    else delete map[module];
    setModuleDefaultsRaw(JSON.stringify(map));
  }

  function removeModuleDefaultsForQuickTextId(id) {
    const map = getModuleDefaults();
    let changed = false;
    for (const module of Object.keys(map)) {
      if (String(map[module]) === String(id)) {
        delete map[module];
        changed = true;
      }
    }
    if (changed) setModuleDefaultsRaw(JSON.stringify(map));
  }

  function setCurrentAsModuleDefault() {
    const item = getSelectedQuickText();
    if (!item) {
      setStatus("Select a saved text first");
      return;
    }
    const module = getActiveModuleName();
    setModuleDefault(module, item.id);
    lastSyncedModule = module;
    setStatus(`"${item.name}" is now default for ${module}`);
  }

  function syncModuleDefaultSelection() {
    const select = document.querySelector(`#${PANEL_ID} .vida-template-select`);
    if (!select || select.disabled) return;
    const module = getActiveModuleName();
    if (module === lastSyncedModule) return;
    lastSyncedModule = module;
    if (userChosenModules.has(module)) return;
    const defaultId = getModuleDefaultId(module);
    if (defaultId && Array.from(select.options).some((option) => option.value === defaultId)) {
      select.value = defaultId;
    } else if (defaultId) {
      setModuleDefault(module, "");
    }
  }

  function focusPatientSearch() {
    return focusElement(getFieldsByName("patientMRN")[0] || getPlaceholderControls("Patient MRN")[0], "patient MRN search");
  }

  function focusCurrentModuleField() {
    const activeModule = getActiveModuleName();
    if (activeModule === "Patient List") return focusPatientSearch();
    if (activeModule === "Vitals") return focusElement(getFirstFieldByNames(["weightKg", "temperatureCelcius", "pulseBeatPerMinute", "bloodPressureHigher", "painScore"]), "vitals field");
    if (activeModule === "Chief Complaint") return focusElement(getChiefComplaintEditor() || getFirstFieldByNames(["chiefComplaintRemarks", "hopi"]), "chief complaint editor");
    if (activeModule === "History / HOPI" || activeModule === "Current Medication") return focusElement(getFirstFieldByNames(["hopi", "drug", "dose", "currentMedication"]), "history field");
    if (activeModule === "Assessment / Diagnosis") return focusElement(getFirstFieldByNames(["icdCode10ID", "conditionID", "diagnosisTypeID", "remarks"]), "assessment field");
    if (activeModule === "Orders / Prescriptions") return focusElement(getFirstFieldByNames(["item", "dose", "strength", "route", "frequency", "duration"]), "prescription field");
    if (activeModule === "Sick Leave") return focusElement(getFirstFieldByNames(["noOfDays", "startDate", "remarks"]), "sick leave field");

    const firstControl = Array.from(document.querySelectorAll("input,select,textarea,[formcontrolname]")).filter(visible)[0];
    return focusElement(firstControl, "first visible field");
  }

  function clickSafeNav(label) {
    if (!SAFE_NAV_LABELS.includes(label)) {
      setStatus(`Not a safe navigation target: ${label}`);
      return false;
    }
    const control = findExactElementsByText(label)[0] || findFirstButtonByText(label);
    if (!control) {
      setStatus(`${label} tab not found`);
      return false;
    }
    control.click();
    setStatus(`Opened ${label}`);
    return true;
  }

  function nextSafeStep() {
    const activeModule = getActiveModuleName();
    if (activeModule === "Patient List") {
      setPageSize100();
      markPatientListFields();
      focusPatientSearch();
      return;
    }
    if (activeModule === "Patient Access Prompt") {
      markPatientListFields();
      setStatus("Prompt marked; Continue remains manual");
      return;
    }
    if (activeModule === "Encounter Review / Loading" || activeModule === "OPD Details") {
      markEncounterControls();
      setStatus("Review controls marked; choose the module manually");
      return;
    }
    if (activeModule === "Vitals") {
      markVitalsFields();
      focusCurrentModuleField();
      return;
    }
    if (activeModule === "History / HOPI" || activeModule === "Current Medication") {
      markHistoryFields();
      focusCurrentModuleField();
      return;
    }
    if (activeModule === "Assessment / Diagnosis") {
      markAssessmentFields();
      focusCurrentModuleField();
      return;
    }
    if (activeModule === "Orders / Prescriptions") {
      markOrdersFields();
      focusCurrentModuleField();
      return;
    }
    if (activeModule === "Sick Leave") {
      markSickLeaveFields();
      focusCurrentModuleField();
      return;
    }
    markActiveFormFields();
    focusCurrentModuleField();
  }

  function checkPrescriptionFields() {
    const requiredFields = [
      "item",
      "dose",
      "strength",
      "route",
      "frequency",
      "doseTime",
      "indications",
      "startDateTime",
      "duration",
    ];
    const missing = [];
    let count = 0;

    for (const name of requiredFields) {
      const fields = getFieldsByName(name);
      const filled = fields.some(fieldHasContent);
      if (!fields.length || !filled) missing.push(name);
      for (const field of fields) {
        field.style.outline = filled ? "3px solid #0f766e" : "4px solid #dc2626";
        field.style.outlineOffset = "2px";
        field.title = filled ? `VIDA helper checked: ${name}` : `VIDA helper check needed: ${name}`;
        count += 1;
      }
    }

    for (const name of ["prescriptionInstruction"]) {
      for (const field of getFieldsByName(name)) {
        field.style.outline = fieldHasContent(field) ? "3px solid #0f766e" : "3px solid #64748b";
        field.style.outlineOffset = "2px";
        field.title = `VIDA helper optional field: ${name}`;
        count += 1;
      }
    }

    for (const label of ["Add", "Continue", "Save", "SAVE"]) {
      for (const control of uniqueElements([...findButtonsByText(label), ...findExactElementsByText(label)])) {
        control.style.outline = "4px solid #dc2626";
        control.style.outlineOffset = "2px";
        control.title = `VIDA helper: ${label} changes the patient record; click manually after review`;
        count += 1;
      }
    }

    if (missing.length) {
      setStatus(`Check Rx: ${missing.join(", ")}`);
    } else {
      setStatus(`Rx fields look filled; review then save manually (${count} marked)`);
    }
  }

  function markActionButtons() {
    const actions = [
      ["New Episode", "#047857"],
      ["Modify Episode", RED],
      ["Return Visit", "#111827"],
    ];
    let count = 0;
    for (const [label, color] of actions) {
      for (const button of findButtonsByText(label)) {
        button.style.outline = `3px solid ${color}`;
        button.style.outlineOffset = "2px";
        button.title = `VIDA helper detected: ${label}`;
        count += 1;
      }
    }
    setStatus(`Marked ${count} action buttons`);
  }

  function markPatientListFields() {
    let count = 0;

    for (const name of PATIENT_LIST_FIELD_NAMES) {
      for (const field of getFieldsByName(name)) {
        const color = name === "patientMRN" ? "#2563eb" : "#0f766e";
        field.style.outline = `3px solid ${color}`;
        field.style.outlineOffset = "2px";
        field.title = `VIDA helper patient-list field: ${name}`;
        count += 1;
      }
    }

    const patientListForms = uniqueElements(
      PATIENT_LIST_FIELD_NAMES.flatMap((name) => getFieldsByName(name).map((field) => field.closest("form")))
    ).filter(Boolean);

    const searchControls = uniqueElements([
      ...findButtonsByText("Search"),
      ...findButtonsByText("Search Patient by MRN"),
      ...patientListForms.flatMap((form) => Array.from(form.querySelectorAll("button[type='submit'],button")).filter(visible)),
    ]);

    for (const control of searchControls) {
      control.style.outline = "3px solid #2563eb";
      control.style.outlineOffset = "2px";
      control.title = "VIDA helper detected: patient list search";
      count += 1;
    }

    const episodeActions = [
      ["New Episode", "#047857"],
      ["Modify Episode", RED],
      ["Return Visit", "#111827"],
    ];

    for (const [label, color] of episodeActions) {
      for (const control of findButtonsByText(label)) {
        control.style.outline = `3px solid ${color}`;
        control.style.outlineOffset = "2px";
        control.title = `VIDA helper detected: ${label}`;
        count += 1;
      }
    }

    for (const control of findExactElementsByText("Ok")) {
      control.style.outline = "3px solid #64748b";
      control.style.outlineOffset = "2px";
      control.title = "VIDA helper detected: modal acknowledge button";
      count += 1;
    }

    for (const control of findButtonsByText("Continue to View Patient")) {
      control.style.outline = "3px solid #ea580c";
      control.style.outlineOffset = "2px";
      control.title = "VIDA helper caution: opens or continues viewing this patient";
      count += 1;
    }

    setStatus(`Marked ${count} patient-list controls`);
  }

  function markEncounterControls() {
    const actions = [
      ["Review", "#7c3aed"],
      ["Health Summary", "#0369a1"],
      ["Assessment", "#047857"],
      ["Medical File", "#9333ea"],
      ["Vitals", "#ea580c"],
      ["Laboratory", "#be123c"],
      ["Diagnostic Result", "#334155"],
      ["Lab Result", "#0f766e"],
      ["Health Summary Report", "#4338ca"],
      ["View more", RED],
    ];
    let count = 0;
    for (const [label, color] of actions) {
      for (const control of findButtonsByText(label)) {
        control.style.outline = `3px solid ${color}`;
        control.style.outlineOffset = "2px";
        control.title = `VIDA helper detected: ${label}`;
        count += 1;
      }
    }
    setStatus(`Marked ${count} OPD controls`);
  }

  function markVitalsFields() {
    let count = 0;
    for (const name of VITALS_FIELD_NAMES) {
      for (const field of getFieldsByName(name)) {
        field.style.outline = "3px solid #0f766e";
        field.style.outlineOffset = "2px";
        field.title = `VIDA helper vitals field: ${name}`;
        count += 1;
      }
    }

    for (const save of findButtonsByText("Save")) {
      save.style.outline = "3px solid #dc2626";
      save.style.outlineOffset = "2px";
      save.title = "VIDA helper warning: Save writes to the patient record";
    }

    setStatus(`Marked ${count} vitals fields`);
  }

  function markActiveFormFields() {
    const controls = Array.from(document.querySelectorAll("input,select,textarea,[formcontrolname]")).filter(visible);
    let count = 0;
    for (const control of controls) {
      const name = control.getAttribute("formcontrolname") || control.getAttribute("placeholder") || control.tagName.toLowerCase();
      control.style.outline = "3px solid #2563eb";
      control.style.outlineOffset = "2px";
      control.title = `VIDA helper field: ${name}`;
      count += 1;
    }

    for (const editor of document.querySelectorAll(".tox-tinymce, .mce-tinymce, [contenteditable='true'], iframe")) {
      if (!visible(editor)) continue;
      editor.style.outline = "3px solid #7c3aed";
      editor.style.outlineOffset = "2px";
      editor.title = "VIDA helper detected editor area";
      count += 1;
    }

    for (const save of findButtonsByText("Save")) {
      save.style.outline = "3px solid #dc2626";
      save.style.outlineOffset = "2px";
      save.title = "VIDA helper warning: Save writes to the patient record";
    }

    setStatus(`Marked ${count} fields in ${getActiveModuleName()}`);
  }

  function markHistoryFields() {
    let count = 0;
    for (const name of HISTORY_FIELD_NAMES) {
      for (const field of getFieldsByName(name)) {
        field.style.outline = "3px solid #7c3aed";
        field.style.outlineOffset = "2px";
        field.title = `VIDA helper history field: ${name}`;
        count += 1;
      }
    }

    for (const label of ["Audit Trail", "Cancel", "Save", "History", "Add", "Previous Chief Complaint", "Template", "Current Medication"]) {
      for (const control of uniqueElements([...findButtonsByText(label), ...findExactElementsByText(label)])) {
        control.style.outline = label === "Save" ? "3px solid #dc2626" : "3px solid #64748b";
        control.style.outlineOffset = "2px";
        control.title = label === "Save" ? "VIDA helper warning: Save writes to the patient record" : `VIDA helper detected: ${label}`;
        count += 1;
      }
    }

    setStatus(`Marked ${count} history/current-med fields`);
  }

  function markAssessmentFields() {
    let count = 0;
    for (const name of ASSESSMENT_FIELD_NAMES) {
      for (const field of getFieldsByName(name)) {
        field.style.outline = "3px solid #0891b2";
        field.style.outlineOffset = "2px";
        field.title = `VIDA helper assessment field: ${name}`;
        count += 1;
      }
    }

    for (const label of ["ICD", "Reset", "Add", "History"]) {
      for (const control of uniqueElements([...findButtonsByText(label), ...findExactElementsByText(label)])) {
        control.style.outline = "3px solid #64748b";
        control.style.outlineOffset = "2px";
        control.title = `VIDA helper detected: ${label}`;
        count += 1;
      }
    }

    for (const save of findButtonsByText("Save")) {
      save.style.outline = "3px solid #dc2626";
      save.style.outlineOffset = "2px";
      save.title = "VIDA helper warning: Save writes to the patient record";
      count += 1;
    }

    setStatus(`Marked ${count} assessment fields`);
  }

  function markOrdersFields() {
    let count = 0;

    for (const name of PRESCRIPTION_FIELD_NAMES) {
      for (const field of getFieldsByName(name)) {
        field.style.outline = name === "item" ? "3px solid #0891b2" : "3px solid #0f766e";
        field.style.outlineOffset = "2px";
        field.title = `VIDA helper prescription field: ${name}`;
        count += 1;
      }
    }

    for (const field of uniqueElements([...getPlaceholderControls("Search Favorite"), ...getPlaceholderControls("Search")])) {
      field.style.outline = "3px solid #2563eb";
      field.style.outlineOffset = "2px";
      field.title = "VIDA helper search field";
      count += 1;
    }

    const navigationControls = [
      ["Orders", "#0369a1"],
      ["Prescriptions", "#0369a1"],
      ["Previous Prescriptions", "#4338ca"],
      ["Strength", "#64748b"],
      ["Route", "#64748b"],
      ["Frequency", "#64748b"],
      ["Dose Timing", "#64748b"],
      ["Indications", "#64748b"],
      ["Start Date Time", "#64748b"],
      ["Duration", "#64748b"],
      ["Prescription Instruction", "#64748b"],
      ["Refresh", "#64748b"],
    ];
    for (const [label, color] of navigationControls) {
      const exactLabels = ["Orders", "Prescriptions", "Previous Prescriptions"];
      const controls = exactLabels.includes(label)
        ? findExactElementsByText(label)
        : uniqueElements([...findButtonsByText(label), ...findExactElementsByText(label)]);
      for (const control of controls) {
        control.style.outline = `3px solid ${color}`;
        control.style.outlineOffset = "2px";
        control.title = `VIDA helper detected: ${label}`;
        count += 1;
      }
    }

    for (const refill of findButtonsByText("Refill")) {
      refill.style.outline = "3px solid #ea580c";
      refill.style.outlineOffset = "2px";
      refill.title = "VIDA helper caution: Refill may copy or create a prescription entry";
      count += 1;
    }

    for (const deleteControl of getDeleteControls()) {
      deleteControl.style.outline = "3px solid #dc2626";
      deleteControl.style.outlineOffset = "2px";
      deleteControl.title = "VIDA helper warning: delete/remove control";
      count += 1;
    }

    for (const label of ["Add", "Close", "Continue", "Cancel"]) {
      for (const control of findExactElementsByText(label)) {
        const caution = label === "Add" || label === "Continue";
        control.style.outline = caution ? "3px solid #ea580c" : "3px solid #64748b";
        control.style.outlineOffset = "2px";
        control.title = caution
          ? `VIDA helper caution: ${label} may continue a prescription/order workflow`
          : `VIDA helper detected: ${label}`;
        count += 1;
      }
    }

    for (const save of findButtonsByText("Save")) {
      save.style.outline = "3px solid #dc2626";
      save.style.outlineOffset = "2px";
      save.title = "VIDA helper warning: Save writes to the patient record";
      count += 1;
    }

    setStatus(`Marked ${count} orders/prescription controls`);
  }

  function markSickLeaveFields() {
    let count = 0;

    for (const name of SICK_LEAVE_FIELD_NAMES) {
      for (const field of getFieldsByName(name)) {
        field.style.outline = "3px solid #0f766e";
        field.style.outlineOffset = "2px";
        field.title = `VIDA helper sick leave field: ${name}`;
        count += 1;
      }
    }

    for (const label of ["Sick Leave", "Extend Sick Leave"]) {
      for (const control of findExactElementsByText(label)) {
        control.style.outline = "3px solid #0369a1";
        control.style.outlineOffset = "2px";
        control.title = `VIDA helper detected: ${label}`;
        count += 1;
      }
    }

    for (const save of findButtonsByText("Save")) {
      save.style.outline = "3px solid #dc2626";
      save.style.outlineOffset = "2px";
      save.title = "VIDA helper warning: Save writes sick leave to the patient record";
      count += 1;
    }

    setStatus(`Marked ${count} sick leave controls`);
  }

  function copyFormMap() {
    const payload = {
      helper: "VIDA Workflow Helper",
      version: VERSION,
      capturedAt: new Date().toISOString(),
      url: location.href.replace(/\d{6,}/g, "[number]"),
      activeModule: getActiveModuleName(),
      formControls: getFormControlMap(),
      saveButtons: findButtonsByText("Save").length,
    };

    copy(JSON.stringify(payload, null, 2))
      .then(() => setStatus(`Copied ${payload.formControls.length} form controls`))
      .catch((error) => {
        console.log("VIDA Form Map", payload);
        setStatus(`Copy failed: ${error && error.message || error}`);
      });
  }

  function goDashboard() {
    if (location.pathname !== "/dashboard") {
      history.pushState({}, "", "/dashboard");
      window.dispatchEvent(new PopStateEvent("popstate"));
      setStatus("Navigated to dashboard");
    } else {
      setStatus("Already on dashboard");
    }
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = String(target.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
  }

  function installKeyboardShortcuts() {
    if (window[KEYBOARD_INSTALLED_KEY]) return;
    window[KEYBOARD_INSTALLED_KEY] = true;
    document.addEventListener("keydown", (event) => {
      if (!event.altKey || !event.shiftKey) return;
      const key = String(event.key || "").toLowerCase();
      if (isTypingTarget(event.target) && key !== "t" && key !== "z") return;
      if (key === "n") {
        event.preventDefault();
        nextSafeStep();
      } else if (key === "f") {
        event.preventDefault();
        focusCurrentModuleField();
      } else if (key === "c") {
        event.preventDefault();
        copySnapshot();
      } else if (key === "r") {
        event.preventDefault();
        checkPrescriptionFields();
      } else if (key === "t") {
        event.preventDefault();
        insertQuickText();
      } else if (key === "z") {
        event.preventDefault();
        undoLastExpansion();
      } else if (key === "d") {
        event.preventDefault();
        goDashboard();
      }
    });
  }

  function savePanelPosition(panel) {
    const rect = panel.getBoundingClientRect();
    localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify({
      left: Math.round(rect.left),
      top: Math.round(rect.top),
    }));
  }

  function applyPanelPosition(panel) {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(PANEL_POSITION_KEY) || "null");
    } catch (_error) {
      saved = null;
    }

    panel.style.right = "auto";
    panel.style.bottom = "auto";
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      panel.style.left = `${Math.max(8, Math.min(saved.left, window.innerWidth - 80))}px`;
      panel.style.top = `${Math.max(8, Math.min(saved.top, window.innerHeight - 48))}px`;
      return;
    }

    panel.style.left = "18px";
    panel.style.top = "80px";
  }

  function dockPanelLeft(panel) {
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.left = "18px";
    panel.style.top = `${Math.max(18, window.innerHeight - panel.offsetHeight - 18)}px`;
    savePanelPosition(panel);
    setStatus("Panel docked left");
  }

  function togglePanelCollapsed(panel) {
    const collapsed = !panel.classList.contains("vida-mini");
    panel.classList.toggle("vida-mini", collapsed);
    localStorage.setItem(PANEL_COLLAPSED_KEY, collapsed ? "1" : "0");
    const button = panel.querySelector('[data-action="toggle-panel"]');
    if (button) button.textContent = collapsed ? "Show" : "Hide";
    savePanelPosition(panel);
  }

  function applyPanelCollapsed(panel) {
    const collapsed = localStorage.getItem(PANEL_COLLAPSED_KEY) === "1";
    panel.classList.toggle("vida-mini", collapsed);
    const button = panel.querySelector('[data-action="toggle-panel"]');
    if (button) button.textContent = collapsed ? "Show" : "Hide";
  }

  function makePanelDraggable(panel) {
    const handle = panel.querySelector(".vida-title");
    if (!handle) return;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let dragging = false;

    handle.style.touchAction = "none";
    handle.addEventListener("pointerdown", (event) => {
      dragging = true;
      const rect = panel.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      if (typeof handle.setPointerCapture === "function") {
        try { handle.setPointerCapture(event.pointerId); } catch (_error) { /* ignore */ }
      }
      event.preventDefault();
    });

    const onMove = (event) => {
      if (!dragging) return;
      const nextLeft = Math.max(8, Math.min(startLeft + event.clientX - startX, window.innerWidth - panel.offsetWidth - 8));
      const nextTop = Math.max(8, Math.min(startTop + event.clientY - startY, window.innerHeight - 48));
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
    };
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      savePanelPosition(panel);
    };
    // Bind on document so the drag tracks even when setPointerCapture is unavailable
    // (e.g. old Android WebViews); captured pointer events still bubble here too.
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", endDrag);
    document.addEventListener("pointercancel", endDrag);
  }

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const style = document.createElement("style");
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        left: 18px;
        bottom: auto;
        z-index: 2147483647;
        width: 260px;
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 14px 36px rgba(0,0,0,.24);
        font-family: Arial, sans-serif;
        color: #222;
        overflow: hidden;
      }
      #${PANEL_ID} .vida-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: ${RED};
        color: #fff;
        font-weight: 700;
      }
      #${PANEL_ID} .vida-title {
        flex: 1;
        cursor: move;
        user-select: none;
      }
      #${PANEL_ID} .vida-version {
        font-size: 11px;
        white-space: nowrap;
      }
      #${PANEL_ID} .vida-body {
        padding: 10px;
        display: grid;
        gap: 8px;
        max-height: min(72vh, 640px);
        overflow: auto;
      }
      #${PANEL_ID}.vida-mini .vida-body {
        display: none;
      }
      #${PANEL_ID} .vida-quick {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      #${PANEL_ID} button {
        min-height: 34px;
        border: 1px solid #ccc;
        border-radius: 7px;
        background: #f8f8f8;
        color: #222;
        font-weight: 700;
        cursor: pointer;
      }
      #${PANEL_ID} .vida-head button {
        min-height: 24px;
        border-color: rgba(255,255,255,.5);
        background: rgba(255,255,255,.15);
        color: #fff;
        border-radius: 5px;
        padding: 2px 6px;
        font-size: 11px;
      }
      #${PANEL_ID} .vida-quick button {
        min-height: 30px;
        font-size: 12px;
      }
      #${PANEL_ID} .vida-template-select {
        width: 100%;
        min-height: 32px;
        border: 1px solid #ccc;
        border-radius: 7px;
        background: #fff;
        color: #222;
        padding: 4px 6px;
        font-size: 12px;
      }
      #${PANEL_ID} .vida-pick-toggle {
        width: 100%;
        min-height: 34px;
        margin-top: 2px;
        background: #2563eb;
        color: #fff;
        border: none;
        border-radius: 7px;
        font-size: 13px;
        font-weight: 700;
      }
      #${PANEL_ID} .vida-pick-list {
        display: none;
        flex-direction: column;
        gap: 6px;
        max-height: 240px;
        overflow-y: auto;
        margin-top: 4px;
        -webkit-overflow-scrolling: touch;
      }
      #${PANEL_ID} .vida-pick-list.open {
        display: flex;
      }
      #${PANEL_ID} .vida-pick-item {
        width: 100%;
        min-height: 44px;
        text-align: left;
        padding: 8px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: #f8fafc;
        color: #0f172a;
        font-size: 14px;
        white-space: normal;
        line-height: 1.25;
      }
      #${PANEL_ID} .vida-pick-item:active {
        background: #dbeafe;
      }
      #${PANEL_ID} .vida-pick-empty {
        font-size: 12px;
        color: #64748b;
        padding: 6px 2px;
      }
      @media (pointer: coarse) {
        #${PANEL_ID} { max-width: 92vw; }
        #${PANEL_ID} .vida-body button { min-height: 44px; font-size: 14px; }
        #${PANEL_ID} .vida-template-select { min-height: 44px; font-size: 14px; }
      }
      #${PANEL_ID} .vida-status {
        min-height: 18px;
        font-size: 12px;
        color: #047857;
      }
      #${PANEL_ID} .vida-counts {
        font-size: 12px;
        color: #555;
      }
    `;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="vida-head">
        <span class="vida-title">VIDA Helper</span>
        <span class="vida-version">v${VERSION}</span>
        <button type="button" data-action="dock-left">Left</button>
        <button type="button" data-action="toggle-panel">Hide</button>
      </div>
      <div class="vida-body">
        <div class="vida-counts">Reading dashboard...</div>
        <button type="button" data-action="next-safe">Next Safe Step</button>
        <button type="button" data-action="focus-current">Focus Current Field</button>
        <button type="button" data-action="check-rx">Check Rx Fields</button>
        <select class="vida-template-select" aria-label="Saved quick text"></select>
        <div class="vida-quick">
          <button type="button" data-action="insert-text">Insert Text</button>
          <button type="button" data-action="save-text">Save Field</button>
          <button type="button" data-action="focus-text">Find Text</button>
          <button type="button" data-action="delete-text">Delete Text</button>
          <button type="button" data-action="default-text">Default Here</button>
        </div>
        <button type="button" data-action="toggle-pick" class="vida-pick-toggle">Tap to Insert</button>
        <div class="vida-pick-list" aria-label="Tap a saved text to insert"></div>
        <div class="vida-quick">
          <button type="button" data-nav="Vitals">Vitals</button>
          <button type="button" data-nav="Chief Complaint">Chief</button>
          <button type="button" data-nav="Assessment">Dx</button>
          <button type="button" data-nav="Orders">Orders</button>
          <button type="button" data-nav="Prescriptions">Rx</button>
          <button type="button" data-nav="Sick Leave">Sick</button>
        </div>
        <button type="button" data-action="copy">Copy Page Snapshot</button>
        <button type="button" data-action="mark-dashboard">Mark Episode Buttons</button>
        <button type="button" data-action="mark-patient-list">Mark Patient List</button>
        <button type="button" data-action="mark-opd">Mark OPD Controls</button>
        <button type="button" data-action="mark-active-form">Mark Active Form Fields</button>
        <button type="button" data-action="mark-vitals">Mark Vitals Fields</button>
        <button type="button" data-action="mark-history">Mark History Fields</button>
        <button type="button" data-action="mark-assessment">Mark Assessment Fields</button>
        <button type="button" data-action="mark-orders">Mark Orders Fields</button>
        <button type="button" data-action="mark-sick-leave">Mark Sick Leave Fields</button>
        <button type="button" data-action="form-map">Copy Form Map</button>
        <button type="button" data-action="size">Show 100 Rows</button>
        <button type="button" data-action="refresh">Refresh List</button>
        <button type="button" data-action="dashboard">Go Dashboard</button>
        <div class="vida-status">Loaded</div>
      </div>
    `;

    document.documentElement.appendChild(style);
    document.body.appendChild(panel);

    applyPanelPosition(panel);
    applyPanelCollapsed(panel);
    makePanelDraggable(panel);
    panel.querySelector('[data-action="dock-left"]').addEventListener("click", () => dockPanelLeft(panel));
    panel.querySelector('[data-action="toggle-panel"]').addEventListener("click", () => togglePanelCollapsed(panel));
    panel.querySelector('[data-action="next-safe"]').addEventListener("click", nextSafeStep);
    panel.querySelector('[data-action="focus-current"]').addEventListener("click", focusCurrentModuleField);
    panel.querySelector('[data-action="check-rx"]').addEventListener("click", checkPrescriptionFields);
    const insertButton = panel.querySelector('[data-action="insert-text"]');
    insertButton.addEventListener("pointerdown", (event) => event.preventDefault());
    insertButton.addEventListener("click", insertQuickText);
    panel.querySelector('[data-action="save-text"]').addEventListener("click", saveCurrentFieldAsQuickText);
    panel.querySelector('[data-action="focus-text"]').addEventListener("click", focusQuickTextTarget);
    panel.querySelector('[data-action="delete-text"]').addEventListener("click", deleteSelectedQuickText);
    panel.querySelector('[data-action="default-text"]').addEventListener("click", setCurrentAsModuleDefault);
    const pickList = panel.querySelector(".vida-pick-list");
    const pickToggle = panel.querySelector('[data-action="toggle-pick"]');
    pickToggle.addEventListener("pointerdown", (event) => event.preventDefault());
    pickToggle.addEventListener("click", () => {
      if (pickList) pickList.classList.toggle("open");
    });
    const templateSelect = panel.querySelector(".vida-template-select");
    if (templateSelect) {
      templateSelect.addEventListener("change", () => userChosenModules.add(getActiveModuleName()));
    }
    for (const button of panel.querySelectorAll("[data-nav]")) {
      button.addEventListener("click", () => clickSafeNav(button.getAttribute("data-nav")));
    }
    panel.querySelector('[data-action="copy"]').addEventListener("click", copySnapshot);
    panel.querySelector('[data-action="mark-dashboard"]').addEventListener("click", markActionButtons);
    panel.querySelector('[data-action="mark-patient-list"]').addEventListener("click", markPatientListFields);
    panel.querySelector('[data-action="mark-opd"]').addEventListener("click", markEncounterControls);
    panel.querySelector('[data-action="mark-active-form"]').addEventListener("click", markActiveFormFields);
    panel.querySelector('[data-action="mark-vitals"]').addEventListener("click", markVitalsFields);
    panel.querySelector('[data-action="mark-history"]').addEventListener("click", markHistoryFields);
    panel.querySelector('[data-action="mark-assessment"]').addEventListener("click", markAssessmentFields);
    panel.querySelector('[data-action="mark-orders"]').addEventListener("click", markOrdersFields);
    panel.querySelector('[data-action="mark-sick-leave"]').addEventListener("click", markSickLeaveFields);
    panel.querySelector('[data-action="form-map"]').addEventListener("click", copyFormMap);
    panel.querySelector('[data-action="size"]').addEventListener("click", setPageSize100);
    panel.querySelector('[data-action="refresh"]').addEventListener("click", clickRefresh);
    panel.querySelector('[data-action="dashboard"]').addEventListener("click", goDashboard);
    refreshQuickTextSelect(panel);
  }

  function updateCounts() {
    const el = document.querySelector(`#${PANEL_ID} .vida-counts`);
    if (!el) return;
    if (/\/opd-details/i.test(location.pathname)) {
      const controls = getEncounterControls().filter((item) => item.present).map((item) => item.label);
      const fields = getFormControlMap();
      el.textContent = `${getActiveModuleName()} | ${controls.length} controls | ${fields.length} fields`;
      return;
    }

    const rows = getPatientRows();
    el.textContent = `Dashboard | Rows: ${rows.length} | New: ${findButtonsByText("New Episode").length} | Modify: ${findButtonsByText("Modify Episode").length}`;
  }

  function install() {
    if (!document.body) return;
    installNetworkRecorder();
    installKeyboardShortcuts();
    installExpansion();
    buildPanel();
    updateCounts();
    syncModuleDefaultSelection();
  }

  installNetworkRecorder();
  install();
  setInterval(install, 1500);
})();
