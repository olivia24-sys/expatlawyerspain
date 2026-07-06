/*
 * eligibility-engine.js - the ELS eligibility/decision engine
 * ---------------------------------------------------------------------------
 * Pure, deterministic tri-state evaluation of eligibility rule sets from the
 * legal-data spine (tools/legal-data/, eligibility domains such as visas.js).
 * The engine is GENERAL: it knows condition kinds, not visas. Any future
 * eligibility tool (a process checklist, a regime checker) ships its own
 * domain file and reuses this engine unchanged.
 *
 * Distinct from js/calc-engine.js (the numeric tax engine) on purpose: no
 * money is calculated here beyond threshold comparisons. Same house rules:
 * no DOM, no fetch, no figure hardcoded - every threshold derives from a
 * spine figure passed IN as data. Runs in the browser (window.ELSEligibility)
 * and in Node (module.exports) alike.
 *
 * THE THREE IRON RULES (mirroring the relief evaluator, tightened for
 * eligibility, where a wrong "you qualify" is the worst possible output):
 *   1. Only status 'verified' rules are evaluated, and a rule counts as
 *      verified only when the rule itself, EVERY criterion and every
 *      referenced figure are verified. The build strips drafts; the engine
 *      filters again - belt and braces.
 *   2. Every criterion is tri-state: met / not met / UNKNOWN. A missing or
 *      unparseable answer can NEVER produce "eligible". Unknown withholds.
 *   3. A rule carrying a lawyer-route condition can never output 'eligible'
 *      however the askable criteria resolve - it tops out at
 *      'need-more-info' with lawyerRoute: true (the honest "a lawyer can
 *      confirm" moment).
 *
 * Result contract (checkEligibility):
 *   { ok: true,
 *     nationality,                    the gate answer (or null)
 *     results: [ per rule:
 *       { id, label, officialName, summary,
 *         applicability: 'applies'|'not-needed'|'not-applicable',
 *         applicabilityNote,          user-facing line when not 'applies'
 *         outcome: 'eligible'|'not-eligible'|'need-more-info'
 *                  |'not-needed'|'not-applicable',
 *         criteria: [ { id, label, state: 'met'|'not-met'|'unknown',
 *                       userNote, sourceRef, threshold } ],
 *         missingInputs: [answer keys],
 *         failed: [criterion ids],
 *         lawyerRoute: boolean,
 *         nextSteps, userNote } ],
 *     missingInputs,                  union across need-more-info rules
 *     figuresUsed }                   [{ id, label, source, ... }]
 *   Bad user input returns { ok: false, error: '...' } - it never throws.
 *   Malformed spine data DOES throw: a build bug must fail loudly.
 * ---------------------------------------------------------------------------
 */

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ELSEligibility = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function assertData(cond, msg) {
    if (!cond) throw new Error('eligibility-engine: bad spine data - ' + msg);
  }

  // --- the criterion registry ------------------------------------------------
  // Maps a condition type to how it is evaluated and which answer key feeds
  // it. Anything NOT in this registry (every lawyerRoute type, and any future
  // type this engine predates) evaluates as unknown forever, so a rule
  // carrying one can never auto-grant. Keep in sync with
  // eligibilityConditionTypes in tools/legal-data/index.js.
  var CRITERION_KINDS = {
    minIncomeMultiple: { kind: 'income', answerKey: 'monthlyIncome' },
    minSavingsMultiple: { kind: 'savings', answerKey: 'savings' },
    remoteEmployeeOfForeignCompany: { kind: 'boolean', answerKey: 'remoteEmployeeOfForeignCompany' },
    maxSpanishClientsSharePercent: { kind: 'maxNumber', answerKey: 'spanishClientsSharePercent' },
    employmentRelationshipMonths: { kind: 'minNumber', answerKey: 'employmentRelationshipMonths' },
    universityDegree: { kind: 'boolean', answerKey: 'universityDegree' },
    professionalExperienceYears: { kind: 'minNumber', answerKey: 'professionalExperienceYears' },
    healthInsurance: { kind: 'boolean', answerKey: 'healthInsurance' },
    cleanCriminalRecord: { kind: 'boolean', answerKey: 'cleanCriminalRecord' },
    noWorkInSpain: { kind: 'boolean', answerKey: 'noWorkInSpain' },
    medicalCertificate: { kind: 'boolean', answerKey: 'medicalCertificate' },
    admittedToStudies: { kind: 'boolean', answerKey: 'admittedToStudies' },
    jobOfferInSpain: { kind: 'boolean', answerKey: 'jobOfferInSpain' },
    familyMemberSpanishResident: { kind: 'boolean', answerKey: 'familyMemberSpanishResident' },
    yearsLivingInSpain: { kind: 'minNumber', answerKey: 'yearsLivingInSpain' },
    innovativeBusinessProject: { kind: 'boolean', answerKey: 'innovativeBusinessProject' },
  };

  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // --- draft gating ------------------------------------------------------------

  // A rule is shippable only when the rule, every criterion (anyOf leaves
  // included) and every figure it references are ALL verified. One draft
  // anywhere keeps the whole rule out: a half-checked checklist is worse
  // than none. The page build uses this to strip; the engine uses it again
  // at evaluation time.
  function leafCriteria(rule) {
    var out = [];
    (rule.criteria || []).forEach(function (c) {
      if (c && Array.isArray(c.anyOf)) c.anyOf.forEach(function (l) { out.push(l); });
      else out.push(c);
    });
    return out;
  }

  function isRuleShippable(rule, figuresById) {
    if (!rule || rule.status !== 'verified') return false;
    var leaves = leafCriteria(rule);
    for (var i = 0; i < leaves.length; i++) {
      var c = leaves[i];
      if (!c || c.status !== 'verified') return false;
      if (c.figureId) {
        var fig = figuresById[c.figureId];
        if (!fig || fig.status !== 'verified') return false;
      }
    }
    return true;
  }

  function shippableRules(data, opts) {
    var figuresById = indexFigures(data);
    var includeDrafts = !!(opts && opts.includeDrafts);
    return (data.rules || []).filter(function (r) {
      return includeDrafts ? true : isRuleShippable(r, figuresById);
    });
  }

  function indexFigures(data) {
    var byId = {};
    (data.figures || []).forEach(function (f) {
      byId[f.id] = f;
    });
    return byId;
  }

  // --- thresholds ----------------------------------------------------------------
  /*
   * Income/savings thresholds are never stored as euros. A criterion says
   * "multiple x of figure y (+ per-dependant multiples)" and the euros are
   * computed here, in integer cents, so the annual IPREM/SMI update flows
   * through automatically.
   *
   * computeThreshold(criterion, figuresById, dependants)
   *   dependants: number of accompanying family members, or null/undefined
   *               when not yet answered.
   * Returns {
   *   figureId, figureLabel,
   *   monthlyFloor,        euros/month for the applicant alone
   *   monthly,             euros/month at the answered dependant count
   *                        (null when dependants matter but are unanswered)
   *   months,              savings criteria only: months covered
   *   totalFloor, total,   savings criteria only: lump sums (floor / answered)
   *   dependantsMatter     true when the criterion carries dependant uplifts
   * }
   */
  function computeThreshold(criterion, figuresById, dependants) {
    var fig = figuresById[criterion.figureId];
    assertData(fig, 'criterion ' + criterion.id + ' references missing figure "' + criterion.figureId + '".');
    assertData(fig.unit === 'eur-per-month', 'figure ' + fig.id + ' must be eur-per-month to anchor a threshold.');
    assertData(isFiniteNumber(criterion.multiple) && criterion.multiple > 0, 'criterion ' + criterion.id + ' needs a positive multiple.');

    var figCents = Math.round(fig.value * 100);
    var dep = criterion.dependants;
    var dependantsMatter = !!dep;
    var floorCents = Math.round(figCents * criterion.multiple);

    var monthlyCents = null;
    if (!dependantsMatter) {
      monthlyCents = floorCents;
    } else if (isFiniteNumber(dependants) && dependants >= 0) {
      var extra = 0;
      if (dependants >= 1) extra += dep.first;
      if (dependants > 1) extra += dep.additional * (dependants - 1);
      monthlyCents = floorCents + Math.round(figCents * extra);
    }

    var months = criterion.months;
    var out = {
      figureId: fig.id,
      figureLabel: fig.label,
      monthlyFloor: floorCents / 100,
      monthly: monthlyCents === null ? null : monthlyCents / 100,
      dependantsMatter: dependantsMatter,
    };
    if (isFiniteNumber(months)) {
      assertData(months > 0, 'criterion ' + criterion.id + ' months must be positive.');
      out.months = months;
      out.totalFloor = (floorCents * months) / 100;
      out.total = monthlyCents === null ? null : (monthlyCents * months) / 100;
    }
    return out;
  }

  // --- criterion evaluation -------------------------------------------------------

  function triBool(v) {
    return v === true ? 'yes' : v === false ? 'no' : 'unknown';
  }

  // amount vs threshold with dependant-aware tri-state:
  //   - amount unknown                -> unknown (ask amount, and dependants
  //                                      when they change the bar)
  //   - amount below the floor        -> no (the bar only rises with
  //                                      dependants, so failing the floor is
  //                                      a safe, final no)
  //   - dependants unanswered but the bar depends on them
  //                                   -> unknown (assuming 0 dependants could
  //                                      grant wrongly - ask instead)
  //   - otherwise                     -> compare against the computed bar
  function evaluateThreshold(amountValue, threshold, answerKey, inclusive) {
    var missing = [];
    var barUnknown = ('totalFloor' in threshold ? threshold.total : threshold.monthly) === null;
    if (!isFiniteNumber(amountValue) || amountValue < 0) {
      missing.push(answerKey);
      // only ask for dependants when they genuinely have not been answered
      if (threshold.dependantsMatter && barUnknown) missing.push('dependants');
      return { state: 'unknown', missing: missing };
    }
    var floor = 'totalFloor' in threshold ? threshold.totalFloor : threshold.monthlyFloor;
    var bar = 'totalFloor' in threshold ? threshold.total : threshold.monthly;
    var meets = function (v, b) {
      return inclusive === false ? v > b : v >= b;
    };
    if (!meets(amountValue, floor)) return { state: 'no', missing: [] };
    if (bar === null) return { state: 'unknown', missing: ['dependants'] };
    return { state: meets(amountValue, bar) ? 'yes' : 'no', missing: [] };
  }

  // One criterion against the answers -> { state, missing: [answer keys] }.
  // Unknown-typed criteria (lawyer-route and anything future) return
  // 'unknown' with NO missing keys: there is nothing to ask, only a lawyer
  // to confirm.
  function evaluateCriterion(criterion, answers, figuresById) {
    var reg = CRITERION_KINDS[criterion.type];
    if (!reg) return { state: 'unknown', missing: [] };
    var v = answers ? answers[reg.answerKey] : undefined;

    switch (reg.kind) {
      case 'boolean': {
        var s = triBool(v);
        return { state: s, missing: s === 'unknown' ? [reg.answerKey] : [] };
      }
      case 'minNumber': {
        if (!isFiniteNumber(v) || v < 0) return { state: 'unknown', missing: [reg.answerKey] };
        var minOk = criterion.inclusive === false ? v > criterion.value : v >= criterion.value;
        return { state: minOk ? 'yes' : 'no', missing: [] };
      }
      case 'maxNumber': {
        if (!isFiniteNumber(v) || v < 0) return { state: 'unknown', missing: [reg.answerKey] };
        var maxOk = criterion.inclusive === false ? v < criterion.value : v <= criterion.value;
        return { state: maxOk ? 'yes' : 'no', missing: [] };
      }
      case 'income':
      case 'savings': {
        var threshold = computeThreshold(criterion, figuresById, answers ? answers.dependants : undefined);
        var r = evaluateThreshold(v, threshold, reg.answerKey, criterion.inclusive);
        r.threshold = threshold;
        return r;
      }
      default:
        return { state: 'unknown', missing: [] };
    }
  }

  // A criteria entry (plain criterion or anyOf group) -> { state, missing,
  // parts: [leaf results] }. anyOf: one yes is enough; all no fails; else
  // unknown, and the missing keys of every unknown leaf are worth asking.
  function evaluateEntry(entry, answers, figuresById) {
    if (entry && Array.isArray(entry.anyOf)) {
      var parts = [];
      var sawUnknown = false;
      var missing = [];
      for (var i = 0; i < entry.anyOf.length; i++) {
        var leaf = entry.anyOf[i];
        var r = evaluateCriterion(leaf, answers, figuresById);
        parts.push({ criterion: leaf, result: r });
        if (r.state === 'yes') return { state: 'yes', missing: [], parts: parts };
        if (r.state === 'unknown') {
          sawUnknown = true;
          r.missing.forEach(function (k) {
            if (missing.indexOf(k) === -1) missing.push(k);
          });
        }
      }
      return { state: sawUnknown ? 'unknown' : 'no', missing: missing, parts: parts };
    }
    var single = evaluateCriterion(entry, answers, figuresById);
    return { state: single.state, missing: single.missing, parts: [{ criterion: entry, result: single }], threshold: single.threshold };
  }

  // --- rule + set evaluation ---------------------------------------------------

  function sourceRef(x) {
    return {
      id: x.id,
      label: x.label,
      source: x.source,
      effectiveFrom: x.effectiveFrom,
      reviewBy: x.reviewBy,
    };
  }

  function isLawyerRouteType(type, data) {
    var listed =
      data.conditionTypes && Array.isArray(data.conditionTypes.lawyerRoute)
        ? data.conditionTypes.lawyerRoute.indexOf(type) !== -1
        : false;
    return listed || !CRITERION_KINDS[type];
  }

  function ruleHasLawyerRoute(rule, data) {
    return leafCriteria(rule).some(function (c) {
      return c && isLawyerRouteType(c.type, data);
    });
  }

  var STATE_LABELS = { yes: 'met', no: 'not-met', unknown: 'unknown' };

  function evaluateRule(rule, answers, figuresById, data) {
    var nationality = answers && answers.nationality ? answers.nationality : null;
    var applicability = nationality ? (rule.applicability || {})[nationality] : null;
    assertData(
      !nationality || applicability === 'applies' || applicability === 'not-needed' || applicability === 'not-applicable',
      'rule ' + rule.id + ' has no applicability entry for nationality group "' + nationality + '".'
    );

    var base = {
      id: rule.id,
      label: rule.label,
      officialName: rule.officialName,
      summary: rule.summary,
      applicability: applicability,
      applicabilityNote:
        applicability && applicability !== 'applies' && rule.applicabilityNotes
          ? rule.applicabilityNotes[nationality] || null
          : null,
      criteria: [],
      missingInputs: [],
      failed: [],
      lawyerRoute: ruleHasLawyerRoute(rule, data),
      nextSteps: rule.nextSteps || [],
      userNote: rule.userNote || null,
      sourceRef: sourceRef(rule),
    };

    // The nationality gate comes first, always. Until it is answered no
    // other question is asked and no eligibility is hinted at.
    if (!nationality) {
      base.outcome = 'need-more-info';
      base.missingInputs = ['nationality'];
      return base;
    }
    if (applicability === 'not-applicable' || applicability === 'not-needed') {
      base.outcome = applicability;
      return base;
    }

    var anyNo = false;
    var anyUnknown = false;
    var missing = [];

    (rule.criteria || []).forEach(function (entry) {
      var r = evaluateEntry(entry, answers, figuresById);
      if (r.state === 'no') anyNo = true;
      if (r.state === 'unknown') {
        anyUnknown = true;
        r.missing.forEach(function (k) {
          if (missing.indexOf(k) === -1) missing.push(k);
        });
      }
      r.parts.forEach(function (p) {
        var c = p.criterion;
        base.criteria.push({
          id: c.id,
          type: c.type,
          label: c.label,
          state: STATE_LABELS[p.result.state],
          groupState: STATE_LABELS[r.state],
          inAnyOf: r.parts.length > 1,
          threshold: p.result.threshold || null,
          userNote: c.userNote || null,
          sourceRef: sourceRef(c),
        });
        if (r.state === 'no' && p.result.state === 'no' && base.failed.indexOf(c.id) === -1) {
          base.failed.push(c.id);
        }
      });
    });

    // Outcome, in strict precedence:
    //   a hard no anywhere       -> not-eligible (final; a failed AND-criterion
    //                               cannot be argued back by more answers)
    //   a lawyer-route condition -> at best need-more-info, never eligible
    //   any unknown              -> need-more-info (+ what to ask)
    //   everything met           -> eligible
    if (anyNo) {
      base.outcome = 'not-eligible';
    } else if (base.lawyerRoute) {
      base.outcome = 'need-more-info';
      base.missingInputs = missing;
    } else if (anyUnknown) {
      base.outcome = 'need-more-info';
      base.missingInputs = missing;
    } else {
      base.outcome = 'eligible';
    }
    return base;
  }

  var NATIONALITY_KEYS = ['uk', 'us', 'eea-swiss', 'other'];

  function checkEligibility(data, answers, opts) {
    assertData(data && Array.isArray(data.rules), 'data.rules must be an array.');
    assertData(Array.isArray(data.figures), 'data.figures must be an array.');

    answers = answers || {};
    if (answers.nationality != null && NATIONALITY_KEYS.indexOf(answers.nationality) === -1) {
      return { ok: false, error: 'unknown-nationality' };
    }

    var figuresById = indexFigures(data);
    var rules = shippableRules(data, opts);

    var results = rules.map(function (rule) {
      return evaluateRule(rule, answers, figuresById, data);
    });

    var missingInputs = [];
    var figureIds = [];
    results.forEach(function (r) {
      if (r.outcome === 'need-more-info') {
        r.missingInputs.forEach(function (k) {
          if (missingInputs.indexOf(k) === -1) missingInputs.push(k);
        });
      }
      r.criteria.forEach(function (c) {
        if (c.threshold && figureIds.indexOf(c.threshold.figureId) === -1) figureIds.push(c.threshold.figureId);
      });
    });

    return {
      ok: true,
      nationality: answers.nationality || null,
      results: results,
      missingInputs: missingInputs,
      figuresUsed: figureIds.map(function (id) {
        return sourceRef(figuresById[id]);
      }),
    };
  }

  return {
    checkEligibility: checkEligibility,
    shippableRules: shippableRules,
    isRuleShippable: isRuleShippable,
    computeThreshold: computeThreshold,
    evaluateCriterion: evaluateCriterion,
    CRITERION_KINDS: CRITERION_KINDS,
    NATIONALITY_KEYS: NATIONALITY_KEYS,
  };
});
