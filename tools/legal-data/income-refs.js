/*
 * tools/legal-data/income-refs.js - national income reference figures
 * ---------------------------------------------------------------------------
 * The two reference values nearly every Spanish visa threshold is defined
 * against: the IPREM (Indicador Público de Renta de Efectos Múltiples) and
 * the SMI (Salario Mínimo Interprofesional, the minimum wage).
 *
 * Visa criteria in visas.js never hardcode a euro threshold. They reference
 * one of these figures by id plus a multiplier (e.g. "400% of the monthly
 * IPREM"), so the annual IPREM/SMI update propagates to every visa at once:
 * update the figure here, rebuild, done.
 *
 * Same field shape and validation as every other figures domain (see the
 * header of itp.js). Same rule: draft until Olivia has seen the number on
 * the official source herself.
 * ---------------------------------------------------------------------------
 */

'use strict';

module.exports = {
  domain: 'income-refs',
  domainLabel: 'National income reference values (IPREM and SMI)',
  figures: [
    {
      id: 'income-refs.iprem-monthly',
      label: 'IPREM, monthly value',
      region: 'national',
      unit: 'eur-per-month',
      value: 600,
      effectiveFrom: '2023-01-01',
      source: {
        url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2022-22128',
        title: 'Ley 31/2022, de 23 de diciembre, de Presupuestos Generales del Estado para 2023 (disp. adic. 82.ª)',
        accessed: '2026-07-06',
      },
      reviewBy: '2027-01-31',
      note:
        'EUR 600/month, set by the 2023 state budget and carried forward unchanged into 2026 because no new budget law has updated it (frozen since 2023). The annual value is EUR 7,200 in 12 payments or EUR 8,400 in 14; consulates quote non-lucrative visa means as multiples of the MONTHLY value, which is why the monthly figure is the one in the spine. Re-check every January: a new Presupuestos Generales law can move it.',
      status: 'draft',
    },
    {
      id: 'income-refs.smi-monthly',
      label: 'SMI (minimum wage), monthly value in 14 payments',
      region: 'national',
      unit: 'eur-per-month',
      value: 1221,
      effectiveFrom: '2026-01-01',
      source: {
        url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2026-3815',
        title: 'Real Decreto 126/2026, de 18 de febrero, por el que se fija el salario mínimo interprofesional para 2026',
        accessed: '2026-07-06',
      },
      reviewBy: '2027-02-28',
      note:
        'EUR 1,221/month in 14 payments (EUR 40.70/day, EUR 17,094/year), fixed by RD 126/2026 with effect for all of 2026. OPEN QUESTION for verification: the digital nomad visa income floor is 200% of the SMI, and UGE practice has varied between 200% of this 14-payment monthly figure and 200% of the annualised monthly average (17,094 / 12 = EUR 1,424.50, a higher bar). The spine carries the 14-payment monthly figure; the DNV criterion note flags the ambiguity and its userNote warns the applicant the higher reading may be applied. Settle against the current UGE FAQ when verifying. Re-check every January/February: the SMI is revised annually by Real Decreto.',
      status: 'draft',
    },
  ],
};
