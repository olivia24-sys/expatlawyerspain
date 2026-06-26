// ExpatLawyerSpain - Main JS

// Town-name search aliases. La Zenia and Torrevieja sit inside the Alicante /
// Costa Blanca market, so searches for those towns resolve to the Alicante option.
const CITY_ALIASES = {
  'la-zenia': 'alicante',
  'torrevieja': 'alicante'
};

function resolveCity(city) {
  return CITY_ALIASES[city] || city;
}

function trackEvent(name, props = {}) {
  // Cloudflare Web Analytics is now the primary analytics layer.
  // Keep this wrapper as a no-op so existing CTA/search hooks remain safe.
}

function getSelectLabelByValue(selectId, fallbackValue) {
  const select = document.getElementById(selectId);
  if (!select) return fallbackValue || 'Any';
  const option = Array.from(select.options || []).find(opt => opt.value === fallbackValue);
  return option ? option.textContent.trim() : (fallbackValue || 'Any');
}

function getVisibleLawyerCount() {
  return Array.from(document.querySelectorAll('.lawyer-card')).filter(card => card.style.display !== 'none').length;
}

function searchLawyers() {
  const city = document.getElementById('city-select').value;
  const specialty = document.getElementById('specialty-select').value;
  const grid = document.getElementById('listings-grid');
  if (grid) {
    // On the /lawyers directory page: filter in place.
    const langEl = document.getElementById('language-select');
    filterListings(city, specialty, langEl ? langEl.value : '');
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  // On the homepage: send the search to the /lawyers directory.
  const params = new URLSearchParams();
  if (city) params.set('city', city);
  if (specialty) params.set('specialty', specialty);
  const qs = params.toString();
  window.location.href = '/lawyers' + (qs ? '?' + qs : '');
}

function startEnquiry(e) {
  e.preventDefault();
  const specialty = document.getElementById('hero-specialty');
  const region = document.getElementById('hero-region');
  const email = document.getElementById('hero-email');
  const form = document.querySelector('.contact-form');

  const specialtyTarget = document.getElementById('enquiry-specialty');
  const regionTarget = document.getElementById('enquiry-region');
  const emailTarget = document.querySelector('.contact-form input[name="email"]');

  if (specialty && specialtyTarget) setSelectValue(specialtyTarget, specialty.value);
  if (region && regionTarget) setSelectValue(regionTarget, region.value);
  if (email && emailTarget) emailTarget.value = email.value;

  clearPrefill();
  trackEvent('CTA Click', { cta: 'Hero enquiry form' });
  document.getElementById('contact-form').scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (form) {
    const nameField = form.querySelector('input[name="name"]');
    if (nameField) nameField.focus();
  }
}

function filterSpecialty(specialty) {
  document.getElementById('specialty-select').value = specialty;
  filterListings('', specialty);
  trackEvent('Specialty Click', {
    specialty: getSelectLabelByValue('specialty-select', specialty),
    results: getVisibleLawyerCount()
  });
  document.getElementById('listings-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function applyLawyersFilters() {
  const city = document.getElementById('city-select').value;
  const specialty = document.getElementById('specialty-select').value;
  const langEl = document.getElementById('language-select');
  const language = langEl ? langEl.value : '';
  filterListings(city, specialty, language);
  const params = new URLSearchParams();
  if (city) params.set('city', city);
  if (specialty) params.set('specialty', specialty);
  if (language) params.set('language', language);
  const qs = params.toString();
  history.replaceState(null, '', '/lawyers' + (qs ? '?' + qs : ''));
}

function initListingsPage() {
  const params = new URLSearchParams(window.location.search);
  const city = resolveCity(params.get('city') || '');
  const specialty = params.get('specialty') || '';
  const language = params.get('language') || '';

  const cs = document.getElementById('city-select');
  const ss = document.getElementById('specialty-select');
  const ls = document.getElementById('language-select');
  if (cs && city) cs.value = city;
  if (ss && specialty) ss.value = specialty;
  if (ls && language) ls.value = language;

  filterListings(city, specialty, language);

  [cs, ss, ls].forEach(sel => { if (sel) sel.addEventListener('change', applyLawyersFilters); });
  const reset = document.getElementById('filter-reset');
  if (reset) reset.addEventListener('click', () => {
    if (cs) cs.value = '';
    if (ss) ss.value = '';
    if (ls) ls.value = '';
    applyLawyersFilters();
  });
}

// Page router: /lawyers filters in place; the homepage handles ?firm= prefill
// and forwards legacy ?city=/?specialty= deep links to the directory.
function initPage() {
  if (document.getElementById('listings-grid')) { initListingsPage(); return; }
  const params = new URLSearchParams(window.location.search);
  const firm = params.get('firm');
  if (firm) {
    prefill(firm, resolveCity(params.get('city') || ''), params.get('specialty') || '');
    return;
  }
  const city = params.get('city');
  const specialty = params.get('specialty');
  if (city || specialty) {
    window.location.replace('/lawyers' + window.location.search);
  }
}

function getDataList(card, key) {
  const raw = card.dataset[key] || '';
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function filterListings(city, specialty, language) {
  city = resolveCity(city);
  language = (language || '').toLowerCase();
  const cards = document.querySelectorAll('.lawyer-card');
  const helper = document.getElementById('results-helper');
  let visible = 0;

  cards.forEach(card => {
    const cardCities = getDataList(card, 'city');
    const cardSpecialties = getDataList(card, 'specialty');
    const cardLangs = getDataList(card, 'lang');

    const cityMatch = !city || cardCities.includes(city) || cardCities.includes('nationwide');
    const specialtyMatch = !specialty || cardSpecialties.includes(specialty);
    const langMatch = !language || cardLangs.includes(language);

    if (cityMatch && specialtyMatch && langMatch) {
      card.style.display = 'flex';
      visible++;
    } else {
      card.style.display = 'none';
    }
  });

  sortVisibleListings(city, specialty);

  if (helper) {
    if (city || specialty) {
      helper.innerHTML = visible > 0
        ? `Showing ${visible} matching ${visible === 1 ? 'firm' : 'firms'}. Want the fastest route? <a href="#contact-form">Send one enquiry instead.</a>`
        : 'No exact lawyer match yet. <a href="#contact-form">Send a general enquiry</a> anyway and mention your province — we will route it as best we can.';
    } else {
      helper.innerHTML = 'Showing featured firms first. Want the fastest route? <a href="#contact-form">Send one enquiry instead.</a>';
    }
  }

  const noResults = document.getElementById('no-results');
  if (noResults) noResults.style.display = visible === 0 ? 'block' : 'none';

  const count = document.getElementById('firm-count');
  if (count) count.textContent = visible + (visible === 1 ? ' firm' : ' firms');
}

function getFirmName(card) {
  const heading = card.querySelector('h3');
  return heading ? heading.textContent.trim().toLowerCase() : '';
}

function getListingTier(card) {
  if (card.classList.contains('featured')) return 0;
  return 1;
}

function getLocationPriority(card, city, specialty) {
  const name = getFirmName(card);
  const cities = getDataList(card, 'city');
  const isNationwideOnly = cities.length === 1 && cities.includes('nationwide');
  const isInternational = name.includes('fragomen') || cities.includes('london');

  if (!city && !specialty) return 0;

  if (city === 'murcia' && name.includes('acc legal')) return -20;
  if (city && cities.includes(city)) return 0;
  if (city && (isNationwideOnly || isInternational)) return 30;
  if (city && cities.includes('nationwide')) return 20;
  return 10;
}

function sortVisibleListings(city, specialty) {
  const grid = document.getElementById('listings-grid');
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll('.lawyer-card'));
  const costaluz = cards.find(card => getFirmName(card).includes('costaluz lawyers'));
  const costaluzOrder = costaluz ? Number(costaluz.dataset.originalOrder || 0) : -1;

  cards
    .sort((a, b) => {
      const tierDiff = getListingTier(a) - getListingTier(b);
      if (tierDiff !== 0) return tierDiff;

      const aName = getFirmName(a);
      const bName = getFirmName(b);
      const aOrder = Number(a.dataset.originalOrder || 0);
      const bOrder = Number(b.dataset.originalOrder || 0);

      if (!city && !specialty && costaluzOrder >= 0) {
        if (aName.includes('acc legal')) return bOrder <= costaluzOrder ? 1 : -1;
        if (bName.includes('acc legal')) return aOrder <= costaluzOrder ? -1 : 1;
        return aOrder - bOrder;
      }

      const priorityDiff = getLocationPriority(a, city, specialty) - getLocationPriority(b, city, specialty);
      if (priorityDiff !== 0) return priorityDiff;

      return aOrder - bOrder;
    })
    .forEach(card => grid.appendChild(card));
}

function setSelectValue(selectEl, value) {
  if (!selectEl) return;

  const options = Array.from(selectEl.options || []);
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (!normalizedValue) return;

  let match = options.find(opt => String(opt.value || '').trim().toLowerCase() === normalizedValue);
  if (!match) {
    match = options.find(opt => String(opt.textContent || '').trim().toLowerCase() === normalizedValue);
  }

  if (match) {
    selectEl.value = match.value;
    selectEl.selectedIndex = options.indexOf(match);
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function prefill(lawyerName, city, specialty = '') {
  trackEvent('Lawyer Enquiry Click', {
    lawyer: lawyerName,
    city: city,
    specialty: getSelectLabelByValue('specialty-select', specialty)
  });

  const hiddenLawyer = document.getElementById('hidden-lawyer');
  const hiddenCity = document.getElementById('hidden-city');
  const regionSelect = document.getElementById('enquiry-region');
  const specialtySelect = document.getElementById('enquiry-specialty');

  if (hiddenLawyer) hiddenLawyer.value = lawyerName;
  if (hiddenCity) hiddenCity.value = city;

  const regionMap = {
    'barcelona': 'Barcelona',
    'madrid': 'Madrid',
    'malaga': 'Málaga',
    'murcia': 'Murcia',
    'la-zenia': 'Alicante (Costa Blanca)',
    'torrevieja': 'Alicante (Costa Blanca)',
    'valencia': 'Valencia',
    'alicante': 'Alicante (Costa Blanca)',
    'seville': 'Seville',
    'marbella': 'Marbella',
    'costa-del-sol': 'Costa del Sol',
    'palma': 'Palma de Mallorca',
    'nationwide': 'Other / Nationwide'
  };

  const specialtyMap = {
    'immigration': 'Immigration & Residency',
    'property': 'Property Law',
    'employment': 'Employment Law',
    'family': 'Family Law',
    'criminal': 'Criminal Law',
    'tax': 'Tax & Fiscal',
    'business': 'Business & Corporate',
    'wills': 'Wills & Inheritance'
  };

  if (regionSelect && regionMap[city]) {
    setSelectValue(regionSelect, regionMap[city]);
  }

  if (specialtySelect && specialtyMap[specialty]) {
    setSelectValue(specialtySelect, specialtyMap[specialty]);
  }

  const banner = document.getElementById('form-lawyer-banner');
  const nameSpan = document.getElementById('form-lawyer-name');
  const title = document.getElementById('form-title');
  const subtitle = document.getElementById('form-subtitle');
  if (banner && nameSpan) {
    nameSpan.textContent = lawyerName;
    banner.style.display = 'block';
    title.textContent = 'Send your enquiry to ' + lawyerName;
    subtitle.textContent = 'Fill in your details below and we will forward your message to this firm.';
  }

  document.getElementById('contact-form').scrollIntoView({ behavior: 'smooth' });
}

function clearPrefill() {
  document.getElementById('hidden-lawyer').value = '';
  document.getElementById('hidden-city').value = '';
  document.getElementById('form-lawyer-banner').style.display = 'none';
  document.getElementById('form-title').textContent = 'Send your enquiry';
  document.getElementById('form-subtitle').textContent = 'Tell us what you need and we\'ll connect you with the right English-speaking lawyer.';
}

function submitForm(e) {
  e.preventDefault();
  document.querySelector('.contact-form').style.display = 'none';
  document.getElementById('form-success').style.display = 'block';
  // TODO: wire up to Formspree or Netlify Forms on deployment
}

function hasLinkLikeText(value) {
  const text = String(value || '').toLowerCase();
  return /(https?:\/\/|www\.|\b[a-z0-9.-]+\.(com|net|org|io|es|co|uk|info|biz|ru|cn|xyz)\b)/i.test(text);
}

function setupFormSpamGuard() {
  const form = document.querySelector('.contact-form');
  if (!form) return;

  const error = document.getElementById('form-error');
  const message = form.querySelector('textarea[name="message"]');
  const honeypot = form.querySelector('input[name="_gotcha"]');
  const loadedAt = Date.now();

  form.addEventListener('submit', event => {
    const showError = text => {
      if (error) {
        error.textContent = text;
        error.style.display = 'block';
      }
      trackEvent('Form Blocked', { reason: text.slice(0, 60) });
    };

    if (honeypot && honeypot.value.trim()) {
      event.preventDefault();
      showError('Sorry, this enquiry could not be submitted. Please email us if the problem continues.');
      return;
    }

    if (Date.now() - loadedAt < 3000) {
      event.preventDefault();
      showError('Please take a moment to check your enquiry before submitting.');
      return;
    }

    if (message && hasLinkLikeText(message.value)) {
      event.preventDefault();
      showError('Please remove any links from your message before submitting. This helps protect you and the lawyers we contact.');
      message.focus();
    }
  });
}

function setupFormStartTracking() {
  const form = document.querySelector('.contact-form');
  if (!form) return;

  let started = false;
  const markStarted = event => {
    if (started) return;
    const field = event.target;
    if (!field || field.type === 'hidden' || field.type === 'submit') return;
    started = true;
    trackEvent('Form Started');
  };

  form.addEventListener('focusin', markStarted);
  form.addEventListener('input', markStarted);
  form.addEventListener('change', markStarted);
}

function setupIntentClickTracking() {
  document.querySelectorAll('a[href="#contact-form"]').forEach(link => {
    link.addEventListener('click', () => {
      if (link.classList.contains('btn-contact')) return;
      const section = link.closest('section');
      trackEvent('CTA Click', {
        cta: link.textContent.trim() || 'Contact form link',
        section: section && section.id ? section.id : 'page'
      });
    });
  });

  document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
    link.addEventListener('click', () => {
      trackEvent('Email Link Click', {
        link: link.classList.contains('btn-list') ? 'List firm' : 'General email'
      });
    });
  });
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

document.querySelectorAll('.lawyer-card').forEach((card, index) => {
  card.dataset.originalOrder = String(index);
});
sortVisibleListings('', '');

setupFormSpamGuard();
setupFormStartTracking();
setupIntentClickTracking();
initPage();


function setupMobileConversionEnhancements() {
  const showMore = document.getElementById('mobile-show-more');
  const grid = document.getElementById('listings-grid');
  if (showMore && grid) {
    showMore.addEventListener('click', () => {
      grid.classList.remove('mobile-collapsed');
      grid.classList.add('mobile-expanded');
      showMore.style.display = 'none';
      trackEvent('CTA Click', { cta: 'Show more firms' });
    });
  }

  const sticky = document.getElementById('mobile-sticky-cta');
  const formSection = document.getElementById('contact-form');
  if (!sticky || !formSection || !window.matchMedia('(max-width: 768px)').matches) return;

  document.body.classList.add('has-mobile-sticky-cta');
  const updateSticky = () => {
    const formRect = formSection.getBoundingClientRect();
    const afterHero = window.scrollY > 520;
    const formVisible = formRect.top < window.innerHeight * 0.75 && formRect.bottom > window.innerHeight * 0.2;
    sticky.classList.toggle('is-visible', afterHero && !formVisible);
  };

  window.addEventListener('scroll', updateSticky, { passive: true });
  window.addEventListener('resize', updateSticky);
  updateSticky();
}

setupMobileConversionEnhancements();
