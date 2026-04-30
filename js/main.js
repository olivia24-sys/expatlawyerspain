// ExpatLawyerSpain - Main JS

function trackEvent(name, props = {}) {
  if (typeof window === 'undefined' || typeof window.plausible !== 'function') return;

  const safeProps = {};
  Object.entries(props).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    safeProps[key] = String(value).slice(0, 80);
  });

  window.plausible(name, Object.keys(safeProps).length ? { props: safeProps } : undefined);
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
  filterListings(city, specialty);
  trackEvent('Search Used', {
    city: getSelectLabelByValue('city-select', city),
    specialty: getSelectLabelByValue('specialty-select', specialty),
    results: getVisibleLawyerCount()
  });
  document.getElementById('listings-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

function applyFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const city = params.get('city') || '';
  const specialty = params.get('specialty') || '';

  if (!city && !specialty) return;

  const citySelect = document.getElementById('city-select');
  const specialtySelect = document.getElementById('specialty-select');

  if (citySelect && city) citySelect.value = city;
  if (specialtySelect && specialty) specialtySelect.value = specialty;

  filterListings(city, specialty);

  const listingsGrid = document.getElementById('listings-grid');
  if (listingsGrid) {
    listingsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function getDataList(card, key) {
  const raw = card.dataset[key] || '';
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function filterListings(city, specialty) {
  const cards = document.querySelectorAll('.lawyer-card');
  const helper = document.getElementById('results-helper');
  let visible = 0;

  cards.forEach(card => {
    const cardCities = getDataList(card, 'city');
    const cardSpecialties = getDataList(card, 'specialty');

    const cityMatch = !city || cardCities.includes(city) || cardCities.includes('nationwide');
    const specialtyMatch = !specialty || cardSpecialties.includes(specialty);

    if (cityMatch && specialtyMatch) {
      card.style.display = 'flex';
      visible++;
    } else {
      card.style.display = 'none';
    }
  });

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
  noResults.style.display = visible === 0 ? 'block' : 'none';
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
    'valencia': 'Valencia',
    'alicante': 'Alicante',
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

setupFormStartTracking();
setupIntentClickTracking();
applyFiltersFromUrl();


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
