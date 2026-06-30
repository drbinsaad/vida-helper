// ==UserScript==
// @name         VIDA Dashboard Helper
// @namespace    https://vida.hmg.com/
// @version      1.7.0
// @description  Workflow helper for VIDA dashboard and OPD details. Safe: no automatic patient action clicks.
// @match        *://vida.hmg.com/*
// @match        *://*.vida.hmg.com/*
// @run-at       document-idle
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "1.7.0";
  const RED = "#d02127";
  const PANEL_ID = "vida-dash-helper";
  const NETWORK_LOG_KEY = "__vidaHelperNetworkLog";
  const NETWORK_INSTALLED_KEY = "__vidaHelperNetworkRecorderInstalled";
  const KEYBOARD_INSTALLED_KEY = "__vidaHelperKeyboardInstalled";
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

  function focusPatientSearch() {
    return focusElement(getFieldsByName("patientMRN")[0] || getPlaceholderControls("Patient MRN")[0], "patient MRN search");
  }

  function focusCurrentModuleField() {
    const activeModule = getActiveModuleName();
    if (activeModule === "Patient List") return focusPatientSearch();
    if (activeModule === "Vitals") return focusElement(getFirstFieldByNames(["weightKg", "temperatureCelcius", "pulseBeatPerMinute", "bloodPressureHigher", "painScore"]), "vitals field");
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
      if (!event.altKey || !event.shiftKey || isTypingTarget(event.target)) return;
      const key = String(event.key || "").toLowerCase();
      if (key === "n") {
        event.preventDefault();
        nextSafeStep();
      } else if (key === "f") {
        event.preventDefault();
        focusCurrentModuleField();
      } else if (key === "c") {
        event.preventDefault();
        copySnapshot();
      } else if (key === "d") {
        event.preventDefault();
        goDashboard();
      }
    });
  }

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const style = document.createElement("style");
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        width: 280px;
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
        padding: 10px 12px;
        background: ${RED};
        color: #fff;
        font-weight: 700;
      }
      #${PANEL_ID} .vida-body {
        padding: 10px;
        display: grid;
        gap: 8px;
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
      #${PANEL_ID} .vida-quick button {
        min-height: 30px;
        font-size: 12px;
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
        <span>VIDA Helper</span>
        <span>v${VERSION}</span>
      </div>
      <div class="vida-body">
        <div class="vida-counts">Reading dashboard...</div>
        <button type="button" data-action="next-safe">Next Safe Step</button>
        <button type="button" data-action="focus-current">Focus Current Field</button>
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

    panel.querySelector('[data-action="next-safe"]').addEventListener("click", nextSafeStep);
    panel.querySelector('[data-action="focus-current"]').addEventListener("click", focusCurrentModuleField);
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
    buildPanel();
    updateCounts();
  }

  installNetworkRecorder();
  install();
  setInterval(install, 1500);
})();
